#!/usr/bin/env python3
"""Acquire exact CC0 Niki Pocket Greek reference from Ditto with pinned checksums.
Staging changes ONLY /bot.piratecartography.com/n7-app/n7-voice-assets/niki/; never changes runtime.
"""
import ftplib
import hashlib
import io
import json
import os
import socket
import ssl
import sys
import tempfile
import urllib.request
import urllib.parse
import wave
from pathlib import Path

SLUG="pocket-el-niki"
ENDPOINT="https://ditto.audio/v1/models/"+SLUG
ROOT="/bot.piratecartography.com/n7-app"
REMOTE_FOLDER=ROOT+"/n7-voice-assets/niki"
TLS="linux3087.grserver.gr"
EXPECTED_SHA="f9c67aa1d2951e6338af84245c1770e070cb6bc85960a6f249f7d7bf4357c3e0"
EXPECTED_SIZE=696044
EXPECTED_FILE_ID="c3fd11f5-755d-4782-b76c-21d25a5c1172"
MAX_FETCH=2*1024*1024

def sha(data):
    return hashlib.sha256(data).hexdigest()

def json_api(url):
    req=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":"N7-Niki-CC0-verifier/1"})
    with urllib.request.urlopen(req,timeout=35) as r:
        raw=r.read(150000)
    return json.loads(raw)

def download(url):
    address=urllib.parse.urlsplit(url)
    if address.scheme!="https" or not (address.hostname or "").endswith(".r2.cloudflarestorage.com"):
        raise RuntimeError("N7_NIKI_UNTRUSTED_SIGNED_SOURCE")
    if "/ditto-models/models/pocket-el-niki/pocket_ref.wav" not in address.path:
        raise RuntimeError("N7_NIKI_WRONG_SIGNED_ASSET")
    with urllib.request.urlopen(url,timeout=60) as r:
        data=r.read(MAX_FETCH+1)
    if len(data)!=EXPECTED_SIZE or sha(data)!=EXPECTED_SHA:
        raise RuntimeError("N7_NIKI_REFERENCE_HASH_MISMATCH")
    with wave.open(io.BytesIO(data),"rb") as wav:
        params={"channels":wav.getnchannels(),"sample_width":wav.getsampwidth(),
                "rate":wav.getframerate(),"frames":wav.getnframes()}
    if params["channels"]!=1 or params["rate"] not in (16000,22050,24000,44100,48000):
        raise RuntimeError("N7_NIKI_BAD_REFERENCE_AUDIO")
    print("N7_NIKI_REFERENCE_VERIFIED "+json.dumps({"bytes":len(data),"sha256":EXPECTED_SHA,"wav":params}),flush=True)
    return data,params

def acquire():
    voice=json_api(ENDPOINT)
    if voice.get("slug")!=SLUG or voice.get("license")!="CC0-1.0" or voice.get("engine")!="pocket" or voice.get("baseSlug")!="pocket-el-v1":
        raise RuntimeError("N7_NIKI_SOURCE_PROVENANCE_CHANGED")
    files=[file for file in voice.get("files",[]) if file.get("role")=="speakers" and file.get("fileName")=="pocket_ref.wav"]
    if len(files)!=1:raise RuntimeError("N7_NIKI_REFERENCE_NOT_UNIQUE")
    f=files[0]
    if f.get("id")!=EXPECTED_FILE_ID or f.get("sha256")!=EXPECTED_SHA or f.get("sizeBytes")!=EXPECTED_SIZE:
        raise RuntimeError("N7_NIKI_SOURCE_METADATA_CHANGED")
    manifest=json_api(ENDPOINT+"/download")
    refs=[file for file in manifest.get("files",[]) if file.get("fileId")==EXPECTED_FILE_ID]
    if len(refs)!=1:raise RuntimeError("N7_NIKI_NO_DOWNLOAD_MANIFEST")
    raw,params=download(refs[0]["url"])
    provenance={
        "schema":"n7-voice-reference/v1",
        "voice_id":SLUG,
        "filename":"pocket_ref.wav",
        "engine":"pocket-tts-greek",
        "engine_config":"hf://myned-ai/pocket-tts-greek/greek.yaml",
        "source":ENDPOINT,
        "license":"CC0-1.0",
        "author":"Mozilla Common Voice contributor",
        "sha256":EXPECTED_SHA,
        "bytes":len(raw),
        "wave":params,
        "status":"approved-voice-reference-staged-not-active"
    }
    return raw,(json.dumps(provenance,ensure_ascii=False,sort_keys=True,indent=2)+"\n").encode("utf8")

def synth_test(raw):
    """Actual CPU generation using the exact acquired reference, no audio published."""
    import numpy as np
    from pocket_tts import TTSModel
    with tempfile.TemporaryDirectory() as td:
        wav=Path(td)/"niki.wav"
        wav.write_bytes(raw)
        tts=TTSModel.load_model(config="hf://myned-ai/pocket-tts-greek/greek.yaml")
        state=tts.get_state_for_audio_prompt(str(wav))
        out=tts.generate_audio(state,"Καλημέρα. Είμαι η Νίκη, η ελληνική φωνή του N επτά.")
        if hasattr(out,"detach"):out=out.detach().cpu().numpy()
        arr=np.asarray(out,dtype=np.float32).reshape(-1)
        rms=float(np.sqrt(np.mean(arr*arr)))
        if arr.size<tts.sample_rate//2 or not np.isfinite(arr).all() or rms<0.001:
            raise RuntimeError("N7_NIKI_SYNTHESIS_INVALID")
        print("N7_NIKI_REAL_TTS_PASS "+json.dumps({"rate":tts.sample_rate,"seconds":round(arr.size/tts.sample_rate,2),"rms":round(rms,4)}),flush=True)

def connect():
    host=os.environ["PCT_FTPS_HOST"]
    port=int(os.getenv("PCT_FTPS_PORT","21"))
    ips=lambda name:{a[4][0] for a in socket.getaddrinfo(name,port,type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):raise RuntimeError("N7_NIKI_UNEXPECTED_FTPS_HOST")
    import time
    for attempt in range(1,4):
        ftps=ftplib.FTP_TLS(timeout=19,context=ssl.create_default_context())
        try:
            ftps.connect(host,port)
            ftps.host=TLS
            ftps.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
            ftps.prot_p()
            ftps.cwd(ROOT)
            if ftps.pwd().rstrip("/")!=ROOT:raise RuntimeError("N7_NIKI_UNEXPECTED_REMOTE_ROOT")
            print("N7_NIKI_FTPS_CONNECTED attempt="+str(attempt),flush=True)
            return ftps
        except (OSError,TimeoutError,EOFError) as e:
            try:ftps.close()
            except Exception:pass
            print("N7_NIKI_FTPS_RETRY attempt="+str(attempt)+" reason="+type(e).__name__,flush=True)
            if attempt==3:raise
            time.sleep(4*attempt)

def ftp_read(ftp,path):
    parts=[]
    try:ftp.retrbinary("RETR "+path,parts.append)
    except ftplib.error_perm as e:
        if str(e).startswith("550"):return None
        raise
    return b"".join(parts)

def install(raw,meta):
    ftp=connect()
    try:
        targets=[(REMOTE_FOLDER+"/pocket_ref.wav",raw),(REMOTE_FOLDER+"/source.json",meta)]
        present=[]
        for dest,data in targets:
            prior=ftp_read(ftp,dest)
            if prior is not None and prior!=data:
                raise RuntimeError("N7_NIKI_EXISTING_ASSET_CONFLICT "+dest.rsplit("/",1)[-1])
            present.append(prior is not None)
        if os.environ.get("N7_DRY_RUN","1")!="0":
            print("N7_NIKI_FTPS_PREFLIGHT_PASS write=false already_present="+str(sum(present)),flush=True)
            return
        for name in ("n7-voice-assets","n7-voice-assets/niki"):
            try:ftp.mkd(ROOT+"/"+name)
            except ftplib.error_perm as e:
                if not str(e).startswith("550"):raise
        written=[]
        try:
            for (dest,data),exists in zip(targets,present):
                if exists:continue
                tmp=dest+".stage"
                if ftp_read(ftp,tmp) is not None:raise RuntimeError("N7_NIKI_STAGE_CONFLICT")
                ftp.storbinary("STOR "+tmp,io.BytesIO(data))
                if ftp_read(ftp,tmp)!=data:raise RuntimeError("N7_NIKI_STAGE_FAILED")
                ftp.rename(tmp,dest)
                written.append(dest)
                if ftp_read(ftp,dest)!=data:raise RuntimeError("N7_NIKI_UPLOAD_HASH_MISMATCH")
            print("N7_NIKI_REFERENCE_STAGED_VERIFIED "+json.dumps({"files_created":len(written),"sha256":EXPECTED_SHA,"status":"not-active","private_paths_changed":0}),flush=True)
        except BaseException:
            for path in reversed(written):
                try:ftp.delete(path)
                except ftplib.all_errors:pass
            raise
    finally:
        try:ftp.quit()
        except Exception:pass

def main():
    raw,meta=acquire()
    if os.environ.get("N7_SAVE_SOURCE_DIR"):
        folder=Path(os.environ["N7_SAVE_SOURCE_DIR"]).resolve()
        root=Path.cwd().resolve()
        if not folder.is_relative_to(root) or folder.is_symlink():
            raise RuntimeError("N7_NIKI_SOURCE_OUTPUT_PATH_INVALID")
        folder.mkdir(parents=True,exist_ok=True)
        (folder/"pocket_ref.wav").write_bytes(raw)
        (folder/"source.json").write_bytes(meta)
        if sha((folder/"pocket_ref.wav").read_bytes())!=EXPECTED_SHA:
            raise RuntimeError("N7_NIKI_SOURCE_PERSIST_VERIFY_FAILED")
        print("N7_NIKI_SOURCE_FILES_WRITTEN bytes="+str(len(raw))+" sha256="+EXPECTED_SHA,flush=True)
    if os.environ.get("N7_SKIP_SYNTH")!="1":synth_test(raw)
    if os.environ.get("N7_OFFLINE")=="1":
        print("N7_NIKI_ACQUIRED_SYNTHESIZED_NO_INSTALL",flush=True)
        return
    install(raw,meta)
if __name__=="__main__":
    try:main()
    except Exception as e:
        print("N7_NIKI_ACQUIRE_FAIL "+type(e).__name__+": "+str(e)[:180],file=sys.stderr,flush=True)
        raise
