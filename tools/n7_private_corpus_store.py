#!/usr/bin/env python3
"""N7 private encrypted corpus in the existing Plesk app, never in public Git.

Sources: SHA256-verified original Actions handoff archives. Transport: TLS FTPS.
At rest: AES-256-GCM, HKDF separated from the existing 32-byte bridge key.
Restore validates AEAD, encrypted archive checksums, and every original lane file
with research_lane_handoff.merge(). No decryption data is logged or committed.
"""
from __future__ import annotations

import argparse, ftplib, hashlib, io, json, os, pathlib, re, socket, ssl
import subprocess, tempfile, time, urllib.error, urllib.request
from contextlib import contextmanager

LANES = ("greek", "travellers", "spanish_simancas", "venetian", "french",
         "british", "dutch", "german", "italian_states", "ottoman", "north_african")
BOT = "/bot.piratecartography.com/n7-app"
STORE = "data/n7-corpora"
NODE = pathlib.Path(__file__).with_name("n7_private_aead.js")
REPO = pathlib.Path.cwd()


def checked_run(run_id):
    if not re.fullmatch(r"[0-9]{8,20}", str(run_id)):
        raise ValueError("INVALID_ORIGINAL_RUN_ID")
    return str(run_id)


def digest(data):
    return hashlib.sha256(data).hexdigest()


@contextmanager
def connect():
    host = os.environ["PCT_FTPS_HOST"]
    port = int(os.environ.get("PCT_FTPS_PORT", "21"))
    name = os.environ.get("PCT_FTPS_TLS_SERVER_NAME", "").strip()
    if name:
        a = {row[4][0] for row in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)}
        b = {row[4][0] for row in socket.getaddrinfo(name, port, type=socket.SOCK_STREAM)}
        if not a.intersection(b):
            raise RuntimeError("FTPS_CERT_HOST_MISMATCH")
    ftp = ftplib.FTP_TLS(timeout=65, context=ssl.create_default_context())
    try:
        ftp.connect(host, port)
        if name:
            ftp.host = name
        ftp.login(os.environ["PCT_FTPS_USER"], os.environ["PCT_FTPS_PASSWORD"])
        ftp.prot_p()
        ftp.cwd(BOT)
        yield ftp
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            pass


def remote_read(ftp, name, limit=80*1024*1024):
    chunks = []
    size = 0
    def collect(piece):
        nonlocal size
        size += len(piece)
        if size > limit:
            raise RuntimeError("PRIVATE_REMOTE_DATA_TOO_LARGE")
        chunks.append(piece)
    ftp.retrbinary("RETR " + name, collect)
    return b"".join(chunks)


def maybe_read(ftp, name, limit=10_000_000):
    try:
        return remote_read(ftp, name, limit)
    except ftplib.error_perm as e:
        if str(e).startswith("550"):
            return None
        raise


def write(ftp, remote, data):
    ftp.storbinary("STOR " + remote, io.BytesIO(data), blocksize=131072)


def make_dir(ftp, folder):
    for name in folder.split("/"):
        if not name:
            continue
        try:
            ftp.mkd(name)
        except ftplib.error_perm as e:
            if not (str(e).startswith("550") or str(e).startswith("521")):
                raise
        ftp.cwd(name)


def private_visibility_check(run_id):
    for url in (
        "https://bot.piratecartography.com/data/n7-corpora/" + run_id + "/index.json",
        "https://bot.piratecartography.com/n7-app/data/n7-corpora/" + run_id + "/index.json",
    ):
        req = urllib.request.Request(url, headers={"User-Agent": "N7-private-store-safety/1"})
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                # 200 (even login HTML) is unsafe for a private directory.
                raise RuntimeError("PRIVATE_DATA_PATH_PUBLICLY_ACCESSIBLE")
        except urllib.error.HTTPError as e:
            if e.code not in (401, 403, 404):
                raise RuntimeError("UNEXPECTED_PRIVATE_PATH_HTTP_" + str(e.code)) from None


def crypt(operation, input_bytes, secret, purpose):
    with tempfile.TemporaryDirectory(prefix="n7-private-crypt-") as temp:
        base = pathlib.Path(temp)
        inp, out, key = base / "input", base / "output", base / "key"
        inp.write_bytes(input_bytes)
        key.write_bytes(secret)
        key.chmod(0o600)
        p = subprocess.run(["node", str(NODE), operation, str(inp), str(out),
                            str(key), purpose], capture_output=True, timeout=120)
        if p.returncode:
            raise RuntimeError("N7_AEAD_" + operation.upper() + "_FAILED")
        return out.read_bytes()


def root(ftp, run_id, create=False):
    ftp.cwd(BOT)
    if create:
        make_dir(ftp, STORE + "/" + run_id)
    else:
        ftp.cwd(STORE + "/" + run_id)


def key_from_bot(ftp):
    ftp.cwd(BOT)
    secret = remote_read(ftp, ".n7-library-bridge-key", 128)
    if len(secret) != 32:
        raise RuntimeError("PRIVATE_BRIDGE_KEY_INVALID")
    return secret


def handoffs_on_disk(run_id, incoming):
    from research_lane_handoff import validate
    incoming = pathlib.Path(incoming)
    bundles = {}
    for lane in LANES:
        folder = incoming / ("pct-lane-handoff-" + run_id + "-" + lane)
        if not folder.is_dir():
            raise RuntimeError("N7_MISSING_PRIVATE_HANDOFF_" + lane)
        manifest = validate(folder, run_id, set(LANES))
        if manifest["lane"] != lane:
            raise ValueError("LANE_SOURCE_IDENTITY_MISMATCH")
        bundles[lane] = (folder, manifest)
    return bundles


def upload(run_id, incoming):
    run_id = checked_run(run_id)
    bundles = handoffs_on_disk(run_id, incoming)
    private_visibility_check(run_id)
    with connect() as ftp:
        secret = key_from_bot(ftp)
        root(ftp, run_id, create=True)
        existing = maybe_read(ftp, "index.json", 100000)
        if existing is not None:
            metadata = json.loads(existing)
            if (metadata.get("schema") == "n7-private-corpus-v1"
                    and metadata.get("run_id") == run_id
                    and set(metadata.get("lanes", {})) == set(LANES)):
                for desc in metadata["lanes"].values():
                    for fileinfo in desc.values():
                        name = fileinfo["name"]
                        if digest(remote_read(ftp, name)) != fileinfo["sealed_sha256"]:
                            raise RuntimeError("PREEXISTING_PRIVATE_CORPUS_CORRUPT")
                print("N7_PRIVATE_CORPUS_ALREADY_PRESENT_VERIFIED", run_id)
                return
            raise RuntimeError("N7_PRIVATE_CORPUS_INDEX_CONFLICT")
        index = {"schema": "n7-private-corpus-v1", "run_id": run_id,
                 "encryption": "AES-256-GCM-HKDF-v1", "lanes": {},
                 "historically_verified": False}
        for lane, (folder, manifest) in bundles.items():
            info = {}
            for typ, source in (("archive", folder / "evidence.tar.gz"),
                                ("manifest", folder / "manifest.json")):
                plaintext = source.read_bytes()
                purpose = "research:" + run_id + ":" + lane + ":" + typ
                encrypted = crypt("seal", plaintext, secret, purpose)
                name = lane + "." + typ + ".enc"
                # Encrypted content never appears in a public repository.
                write(ftp, name, encrypted)
                sealed = remote_read(ftp, name)
                if digest(sealed) != digest(encrypted):
                    raise RuntimeError("PRIVATE_FTPS_SEALED_READBACK_MISMATCH")
                if crypt("open", sealed, secret, purpose) != plaintext:
                    raise RuntimeError("PRIVATE_FTPS_AEAD_ROUNDTRIP_FAILED")
                info[typ] = {"name": name, "sealed_sha256": digest(sealed),
                             "clear_sha256": digest(plaintext), "bytes": len(plaintext)}
            if info["archive"]["clear_sha256"] != manifest["archive_sha256"]:
                raise RuntimeError("ORIGINAL_LANE_ARCHIVE_CHECKSUM_MISMATCH")
            index["lanes"][lane] = info
        raw = (json.dumps(index, sort_keys=True, indent=2) + "\n").encode()
        write(ftp, "index.json", raw)
        if remote_read(ftp, "index.json", 100000) != raw:
            raise RuntimeError("PRIVATE_CORPUS_INDEX_READBACK_FAILED")
        print("N7_PRIVATE_CORPUS_STORED", run_id, "lanes", len(index["lanes"]),
              "encrypted_archive_and_manifest_files", len(index["lanes"]) * 2)
    private_visibility_check(run_id)


def restore(run_id):
    run_id = checked_run(run_id)
    with connect() as ftp:
        secret = key_from_bot(ftp)
        root(ftp, run_id)
        index = json.loads(remote_read(ftp, "index.json", 100000))
        if index.get("schema") != "n7-private-corpus-v1" or index.get("run_id") != run_id:
            raise RuntimeError("PRIVATE_CORPUS_INDEX_ID_MISMATCH")
        if set(index.get("lanes", {})) != set(LANES):
            raise RuntimeError("PRIVATE_CORPUS_INCOMPLETE")
        dest = REPO / "lane_handoffs"
        for lane in LANES:
            folder = dest / ("pct-lane-handoff-" + run_id + "-" + lane)
            folder.mkdir(parents=True, exist_ok=True)
            info = index["lanes"][lane]
            for typ, name in (("archive", "evidence.tar.gz"), ("manifest", "manifest.json")):
                entry = info[typ]
                if entry.get("name") != lane + "." + typ + ".enc":
                    raise RuntimeError("INVALID_PRIVATE_CORPUS_OBJECT")
                encrypted = remote_read(ftp, entry["name"])
                if digest(encrypted) != entry["sealed_sha256"]:
                    raise RuntimeError("PRIVATE_SEALED_SHA_MISMATCH")
                original = crypt("open", encrypted, secret, "research:" + run_id + ":" + lane + ":" + typ)
                if digest(original) != entry["clear_sha256"]:
                    raise RuntimeError("PRIVATE_ORIGINAL_SHA_MISMATCH")
                (folder / name).write_bytes(original)
    from research_lane_handoff import merge
    report = merge(REPO, run_id, list(LANES), dest)
    if report["missing_lanes"]:
        raise RuntimeError("PRIVATE_RESTORED_LANES_INCOMPLETE")
    print("N7_PRIVATE_CORPUS_RESTORED_FROM_HOST_VERIFIED", run_id,
          "lanes", len(report["received_lanes"]),
          "files", report["files"], "historically_verified=false")



def decode_private_answer(index, encrypted, secret, run_id):
    """Private-only decrypt. The index and AEAD binding both must match this run."""
    if (index.get("schema") != "n7-private-answer-index-v1"
            or index.get("run_id") != run_id
            or index.get("historically_verified") is not False
            or not re.fullmatch(r"[0-9a-f]{64}", str(index.get("sealed_sha256", "")))
            or digest(encrypted) != index["sealed_sha256"]):
        raise RuntimeError("PRIVATE_ANSWER_INDEX_OR_SHA_INVALID")
    clear = crypt("open", encrypted, secret, "research:" + run_id + ":answer")
    if len(clear) > 8_000_000:
        raise RuntimeError("PRIVATE_ANSWER_PLAINTEXT_TOO_LARGE")
    answer = json.loads(clear)
    if (not isinstance(answer, dict) or not isinstance(answer.get("status"), str)
            or answer.get("verified") is True or answer.get("historically_verified") is True
            or not isinstance(answer.get("claims"), list)):
        raise RuntimeError("PRIVATE_PREVIOUS_ANSWER_UNSAFE")
    return clear, answer


def answer_restore(run_id):
    """Retrieve the encrypted previous N7 answer into THIS ephemeral runner only."""
    run_id = checked_run(run_id)
    with connect() as ftp:
        secret = key_from_bot(ftp)
        root(ftp, run_id)
        index = json.loads(remote_read(ftp, "answer-index.json", 100000))
        encrypted = remote_read(ftp, "answer.json.enc", 10_000_000)
        clear, answer = decode_private_answer(index, encrypted, secret, run_id)
        if not answer.get("claims"):
            history=[]
            for remote_name in ftp.nlst():
                name=pathlib.Path(str(remote_name)).name
                if not re.fullmatch(r"answer-history-[a-f0-9]{64}\\.enc",name):
                    continue
                candidate=remote_read(ftp,name,10_000_000)
                expected=name[len("answer-history-"):-len(".enc")]
                if digest(candidate)!=expected:
                    raise RuntimeError("PRIVATE_ANSWER_HISTORY_HASH_MISMATCH")
                idx={"schema":"n7-private-answer-index-v1","run_id":run_id,
                     "historically_verified":False,"sealed_sha256":expected}
                candidate_clear,candidate_answer=decode_private_answer(idx,candidate,secret,run_id)
                if candidate_answer.get("claims"):
                    history.append((len(candidate_answer["claims"]),candidate_clear,candidate_answer))
            if history:
                history.sort(key=lambda item:item[0],reverse=True)
                _,clear,answer=history[0]
                print("N7_PRIVATE_OLDER_SOURCE_BOUND_ANSWER_RECOVERED",json.dumps({
                    "run_id":run_id,"claims":len(answer["claims"]),
                    "historically_verified":False}))
            else:
                print("N7_NO_SOURCE_BOUND_ANSWER_IN_ENCRYPTED_HISTORY",run_id)
    out = REPO / "evidence" / "runs" / run_id / "previous_model_answer" / "answer.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        if out.read_bytes() != clear:
            raise RuntimeError("PREVIOUS_PRIVATE_ANSWER_ALREADY_PRESENT_DIFFERENT")
    else:
        out.write_bytes(clear)
        out.chmod(0o600)
    review = answer.get("review") or {}
    from collections import Counter
    outcomes = Counter(str(row.get("decision", "UNKNOWN")) for row in review.get("flagged_claims", [])
                       if isinstance(row, dict))
    print("N7_PRIVATE_ANSWER_DECRYPTED_WITH_AEAD", json.dumps({
        "run_id": run_id, "status": answer["status"],
        "model_claims": len(answer["claims"]),
        "supported": len(review.get("supported_claim_ids") or []),
        "flagged_by_decision": dict(sorted(outcomes.items())),
        "pending": len((answer.get("coverage") or {}).get("claims_awaiting_review") or []),
        "missing_review": len(review.get("missing_claim_ids") or []),
        "historically_verified": False
    }, sort_keys=True))



def answer_upload(run_id):
    run_id = checked_run(run_id)
    answer_file = REPO / "evidence" / "runs" / run_id / "research_answer" / "answer.json"
    if not answer_file.is_file():
        raise RuntimeError("PRIVATE_MODEL_ANSWER_NOT_PRODUCED")
    answer = json.loads(answer_file.read_text(encoding="utf8"))
    if not isinstance(answer, dict) or not isinstance(answer.get("status"), str):
        raise RuntimeError("PRIVATE_MODEL_ANSWER_INVALID")
    if answer.get("verified") is True or answer.get("historically_verified") is True:
        raise RuntimeError("MODEL_MUST_NOT_DECLARE_HISTORICAL_VERIFICATION")
    raw = answer_file.read_bytes()
    if len(raw) > 8_000_000:
        raise RuntimeError("PRIVATE_MODEL_ANSWER_TOO_LARGE")
    with connect() as ftp:
        secret = key_from_bot(ftp)
        root(ftp, run_id)
        if not maybe_read(ftp, "index.json", 100000):
            raise RuntimeError("PRIVATE_SOURCE_INDEX_MISSING")
        sealed = crypt("seal", raw, secret, "research:" + run_id + ":answer")
        # Never lose the prior source-bound model result when reviewing again.
        prior_index = maybe_read(ftp, "answer-index.json", 100000)
        prior_encrypted = maybe_read(ftp, "answer.json.enc", 10_000_000)
        if prior_index is not None or prior_encrypted is not None:
            if prior_index is None or prior_encrypted is None:
                raise RuntimeError("PRIOR_PRIVATE_ANSWER_INDEX_INCOMPLETE")
            old_index=json.loads(prior_index)
            # Fully re-authenticate the old answer before retaining a snapshot.
            decode_private_answer(old_index, prior_encrypted, secret, run_id)
            historical_name="answer-history-" + digest(prior_encrypted) + ".enc"
            existing=maybe_read(ftp, historical_name, 10_000_000)
            if existing is None:
                write(ftp, historical_name, prior_encrypted)
                existing=remote_read(ftp, historical_name, 10_000_000)
            if existing!=prior_encrypted:
                raise RuntimeError("PRIVATE_ANSWER_HISTORY_READBACK_MISMATCH")
        # No source text is written to a public Git commit or unencrypted artifact.
        write(ftp, "answer.json.enc", sealed)
        verify = remote_read(ftp, "answer.json.enc", 10_000_000)
        if digest(verify) != digest(sealed) or crypt("open", verify, secret,
                "research:" + run_id + ":answer") != raw:
            raise RuntimeError("PRIVATE_MODEL_ANSWER_READBACK_FAILED")
        meta = {"schema": "n7-private-answer-index-v1", "run_id": run_id,
                "sealed_sha256": digest(sealed), "status": str(answer["status"])[:80],
                "claims": len(answer.get("claims") or []),
                "model_used": bool(answer.get("model_used")),
                "historically_verified": False}
        summary = (json.dumps(meta, indent=2) + "\n").encode()
        write(ftp, "answer-index.json", summary)
        if remote_read(ftp, "answer-index.json", 100000) != summary:
            raise RuntimeError("PRIVATE_ANSWER_INDEX_READBACK_MISMATCH")
        print("N7_PRIVATE_SEMANTIC_ANSWER_STORED", run_id,
              "status", meta["status"], "claims", meta["claims"],
              "model_used", meta["model_used"], "historically_verified=false")


def main():
    p=argparse.ArgumentParser()
    p.add_argument("mode", choices=("upload", "restore", "answer-upload", "answer-restore"))
    p.add_argument("--run-id", required=True)
    p.add_argument("--incoming", default="lane_handoffs")
    args=p.parse_args()
    if args.mode == "upload":
        upload(args.run_id, args.incoming)
    elif args.mode == "restore":
        restore(args.run_id)
    elif args.mode == "answer-restore":
        answer_restore(args.run_id)
    else:
        answer_upload(args.run_id)


if __name__=="__main__":
    main()
