#!/usr/bin/env python3
"""Deploy ONLY the standalone NABOU Agent Room to the verified Plesk bot document root.

Fail closed if destination, existing page, TLS or checksums do not match.
Never touch the main site, application root or the 3D NABOU world.
"""
from __future__ import annotations
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path
import re
import socket
import ssl
import uuid

DESTINATION = "/bot.piratecartography.com"
SOURCE = Path(__file__).resolve().parents[2] / "server/command-center-live/public/agents.html"
ALLOWED_MARKERS = (b"plesk", b"NABOU // AGENT ROOM")


def deploy(factory=ftplib.FTP_TLS):
    required=("PCT_FTPS_HOST", "PCT_FTPS_USER", "PCT_FTPS_PASSWORD")
    if not all(os.environ.get(name) for name in required):
        raise RuntimeError("MISSING_FTPS_BINDINGS")
    host=os.environ["PCT_FTPS_HOST"]
    port=int(os.environ.get("PCT_FTPS_PORT","21"))
    tls=os.environ.get("PCT_FTPS_TLS_SERVER_NAME","linux3087.grserver.gr")
    if not re.fullmatch(r"[a-zA-Z0-9.-]{1,253}",tls):
        raise RuntimeError("UNSAFE_FTPS_TLS_NAME")
    expected={r[4][0] for r in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    actual={r[4][0] for r in socket.getaddrinfo(tls,port,type=socket.SOCK_STREAM)}
    if not expected.intersection(actual):
        raise RuntimeError("TLS_NAME_NOT_BOUND_TO_HOST")
    payload=SOURCE.read_bytes()
    if not (b"NABOU // AGENT ROOM" in payload and b"AI AGENTS" in payload and b"/pct-api/live/n7/" in payload):
        raise RuntimeError("INVALID_BOT_ROOM_SOURCE")
    ftp=factory(timeout=30,context=ssl.create_default_context())
    token=uuid.uuid4().hex[:12]
    stage=".nabou-bot-room-stage-"+token+".html"
    backup=".nabou-bot-before-"+token+".html"
    backed_up=False
    activated=False
    try:
        ftp.connect(host,port)
        ftp.host=tls
        ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
        ftp.prot_p()
        ftp.cwd(DESTINATION)
        if ftp.pwd().rstrip("/") != DESTINATION:
            raise RuntimeError("UNEXPECTED_BOT_DOCUMENT_ROOT")
        names={item.rsplit("/",1)[-1] for item in ftp.nlst()}
        if "index.html" not in names:
            raise RuntimeError("BOT_INDEX_MISSING")
        old=[]
        ftp.retrbinary("RETR index.html",old.append)
        old=b"".join(old)
        if len(old)>250_000 or not any(marker.lower() in old.lower() for marker in ALLOWED_MARKERS):
            raise RuntimeError("BOT_PAGE_NOT_RECOGNIZED_DO_NOT_OVERWRITE")
        ftp.storbinary("STOR "+stage,io.BytesIO(payload))
        chunks=[]
        ftp.retrbinary("RETR "+stage,chunks.append)
        if hashlib.sha256(b"".join(chunks)).digest()!=hashlib.sha256(payload).digest():
            raise RuntimeError("STAGED_SHA256_MISMATCH")
        ftp.rename("index.html",backup)
        backed_up=True
        ftp.rename(stage,"index.html")
        activated=True
        verified=[]
        ftp.retrbinary("RETR index.html",verified.append)
        if hashlib.sha256(b"".join(verified)).digest()!=hashlib.sha256(payload).digest():
            raise RuntimeError("DEPLOYED_SHA256_MISMATCH")
        print(json.dumps({"status":"BOT_ROOM_FTPS_VERIFIED","directory":DESTINATION,
                          "source_sha256":hashlib.sha256(payload).hexdigest(),
                          "backup_preserved":True,"other_sites_modified":False,
                          "https_certificate_verified":False}))
    except BaseException:
        if backed_up:
            try:
                if activated:ftp.delete("index.html")
                ftp.rename(backup,"index.html")
            except Exception:
                print("BOT_ROOM_ROLLBACK_NEEDS_MANUAL_CHECK")
        raise
    finally:
        try:
            if not activated:ftp.delete(stage)
        except Exception:pass
        try:ftp.quit()
        except Exception:pass


if __name__=="__main__":
    deploy()
