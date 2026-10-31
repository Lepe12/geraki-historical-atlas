#!/usr/bin/env python3
"""Upload a private book-image archive to the EXISTING NABOU host via verified FTPS.

Runs only where the archive and protected FTP environment secrets are available.
Never uploads to the public web root or a Git repository.
"""
import argparse, ftplib, hashlib, io, json, os, posixpath, re, socket, ssl, sys, zipfile
from pathlib import Path

PRIVATE_PARENT = "/piratecartography-system"
DESTINATION = PRIVATE_PARENT + "/nabou-book-images"

def inspect_archive(path):
    with zipfile.ZipFile(path) as z:
        names=z.namelist()
        if len(names)!=len(set(names)) or any("/" in n or "\\" in n or n.startswith(".") for n in names):
            raise ValueError("ARCHIVE_UNSAFE_NAMES")
        images=sorted(n for n in names if n.lower().endswith((".jpg",".jpeg",".png")))
        if not images or set(names)!=(set(images)|{"manifest.json"}):
            raise ValueError("ARCHIVE_UNEXPECTED_FILES")
        manifest=json.loads(z.read("manifest.json"))
        # Verify that supplied manifest refers to actual image files; do not
        # invent bibliographic or transcription metadata from filenames.
        if isinstance(manifest,list):
            entries=manifest
        elif isinstance(manifest,dict):
            entries=manifest.get("files",manifest.get("images"))
        else: entries=None
        if not isinstance(entries,list): raise ValueError("ARCHIVE_MANIFEST_UNKNOWN_FORMAT")
        by_name={x.get("name"):x for x in entries if isinstance(x,dict)}
        if set(by_name)!=set(images) or len(by_name)!=len(entries):
            raise ValueError("MANIFEST_IMAGE_MISMATCH")
        digests={}
        for n in images:
            data=z.read(n)
            if len(data)>30_000_000:raise ValueError("IMAGE_TOO_LARGE")
            digests[n]=hashlib.sha256(data).hexdigest()
            if by_name[n].get("sha256")!=digests[n] or by_name[n].get("bytes")!=len(data):
                raise ValueError("MANIFEST_CHECKSUM_MISMATCH")
        return z, images, digests, manifest

def upload(archive, ftp, dry_run=False):
    z,images,digests,manifest=inspect_archive(archive)
    with z:
        if dry_run:return {"status":"ARCHIVE_VALIDATED_NO_UPLOAD","image_count":len(images),"archive_sha256":hashlib.sha256(archive.read_bytes()).hexdigest()}
        # Private directory must already exist. Never create public dirs.
        ftp.cwd(PRIVATE_PARENT)
        ftp.cwd(DESTINATION)
        existing={posixpath.basename(s.rstrip("/")) for s in ftp.nlst()}
        uploaded=[]
        try:
            for name in images:
                remote=name
                if name in existing:
                    buf=[]
                    ftp.retrbinary("RETR "+remote,buf.append)
                    if hashlib.sha256(b"".join(buf)).hexdigest()!=digests[name]:
                        raise ValueError("EXISTING_FILE_CONFLICT:"+name)
                    continue
                data=z.read(name)
                tmp=".staging-"+name
                if tmp in existing:raise ValueError("STAGING_NAME_CONFLICT")
                ftp.storbinary("STOR "+tmp,io.BytesIO(data))
                buf=[]
                ftp.retrbinary("RETR "+tmp,buf.append)
                if hashlib.sha256(b"".join(buf)).hexdigest()!=digests[name]:
                    ftp.delete(tmp);raise ValueError("REMOTE_CHECKSUM_MISMATCH:"+name)
                ftp.rename(tmp,remote)
                uploaded.append(name)
            # Private receipt is not a citation; book/page attribution remains pending.
            receipt={"schema":"nabou-book-images-v1","archive_sha256":hashlib.sha256(archive.read_bytes()).hexdigest(),
                     "images":digests,"image_count":len(images),"bibliographic_metadata":"NOT_YET_VERIFIED",
                     "transcriptions":"NOT_IMPORTED"}
            payload=json.dumps(receipt,ensure_ascii=False,indent=2).encode()
            tmp=".staging-upload-receipt.json"
            if tmp in existing:raise ValueError("RECEIPT_STAGING_CONFLICT")
            ftp.storbinary("STOR "+tmp,io.BytesIO(payload))
            ftp.rename(tmp,"upload-receipt.json")
            return {"status":"PRIVATE_UPLOAD_VERIFIED","image_count":len(images),"new_images":len(uploaded)}
        except Exception:
            for n in reversed(uploaded):
                try: ftp.delete(n)
                except ftplib.all_errors: pass
            raise

def main():
    p=argparse.ArgumentParser()
    p.add_argument("archive",type=Path)
    p.add_argument("--dry-run",action="store_true")
    args=p.parse_args()
    if not args.archive.is_file():p.error("archive not found")
    if args.dry_run:
        print(json.dumps(upload(args.archive,None,True)));return
    required=["PCT_FTPS_HOST","PCT_FTPS_USER","PCT_FTPS_PASSWORD","PCT_FTPS_TLS_SERVER_NAME"]
    if any(not os.getenv(k) for k in required):raise SystemExit("BLOCKED_FTPS_BINDINGS")
    host=os.environ["PCT_FTPS_HOST"]; name=os.environ["PCT_FTPS_TLS_SERVER_NAME"]
    port=int(os.getenv("PCT_FTPS_PORT","21"))
    expected={x[4][0] for x in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    resolved={x[4][0] for x in socket.getaddrinfo(name,port,type=socket.SOCK_STREAM)}
    if not expected.intersection(resolved):raise SystemExit("TLS_HOST_NOT_BOUND_TO_SERVER")
    ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
    try:
        ftp.connect(host,port);ftp.host=name
        ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
        ftp.prot_p()
        result=upload(args.archive,ftp)
        print(json.dumps(result))
    except Exception as e:
        # Keep server messages, paths and secrets out of logs.
        print(json.dumps({"status":"PRIVATE_UPLOAD_FAILED","error_type":type(e).__name__}),file=sys.stderr)
        raise SystemExit(1)
    finally:
        try: ftp.quit()
        except ftplib.all_errors:pass

if __name__=="__main__": main()
