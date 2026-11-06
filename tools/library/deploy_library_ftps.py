#!/usr/bin/env python3
"""Safe N7 library-only FTPS deployment. No backend restart or database execution."""
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path
import posixpath
import ssl
import socket
import re
import sys
import uuid

ROOT = Path(__file__).resolve().parents[2]
FILES = ("schema.sql", "n7_library.php", "n7_pdf_ingest.py")
HOST = os.environ["PCT_FTPS_HOST"]
USER = os.environ["PCT_FTPS_USER"]
PASSWORD = os.environ["PCT_FTPS_PASSWORD"]
PORT = int(os.environ.get("PCT_FTPS_PORT", "21"))
TLS_NAME = os.environ.get("PCT_FTPS_TLS_SERVER_NAME", "").strip().rstrip(".")
APP = os.environ.get("PCT_FTPS_APP_ROOT", "/piratecartography-gateway/server/command-center-live")
if APP != "/piratecartography-gateway/server/command-center-live":
    raise SystemExit("BLOCKED_UNEXPECTED_APP_ROOT")
TARGET = "/piratecartography-gateway/tools/library"
payload = {name: (ROOT / "tools/library" / name).read_bytes() for name in FILES}
ftp = ftplib.FTP_TLS(timeout=30, context=ssl.create_default_context())
backup, staged, installed, remote_backup = {}, [], [], {}
runid = uuid.uuid4().hex[:12]
phase = "CONNECT"
try:
    if TLS_NAME:
        if len(TLS_NAME)>253 or not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?', TLS_NAME):
            raise RuntimeError("INVALID_TLS_SERVER_NAME")
        configured={addr[4][0] for addr in socket.getaddrinfo(HOST,PORT,type=socket.SOCK_STREAM)}
        certname={addr[4][0] for addr in socket.getaddrinfo(TLS_NAME,PORT,type=socket.SOCK_STREAM)}
        if not configured.intersection(certname):
            raise RuntimeError("TLS_NAME_NOT_MATCHING_HOST")
    ftp.connect(HOST, PORT)
    if TLS_NAME:
        ftp.host=TLS_NAME
    phase = "AUTH"
    ftp.login(USER, PASSWORD)
    ftp.prot_p()
    phase = "PREFLIGHT"
    ftp.cwd(APP)
    app_files = {posixpath.basename(s.rstrip("/")) for s in ftp.nlst()}
    if not {"package.json", "public", "tmp", "knowledge-data"}.issubset(app_files):
        raise RuntimeError("BLOCKED_UNEXPECTED_APPLICATION")
    ftp.cwd("/piratecartography-gateway/tools/storage")
    storage_files = {posixpath.basename(s.rstrip("/")) for s in ftp.nlst()}
    if "pct_research_store.php" not in storage_files:
        raise RuntimeError("BLOCKED_MISSING_RESEARCH_STORAGE")
    ftp.cwd("/piratecartography-gateway/tools")
    tools_files = {posixpath.basename(s.rstrip("/")) for s in ftp.nlst()}
    if "library" not in tools_files:
        ftp.mkd(TARGET)
    ftp.cwd(TARGET)
    listing = {posixpath.basename(s.rstrip("/")) for s in ftp.nlst()}
    for name in FILES:
        if name not in listing:
            backup[name] = None
            continue
        chunks = []
        ftp.retrbinary("RETR " + name, chunks.append)
        backup[name] = b"".join(chunks)
    phase = "STAGING"
    for name, data in payload.items():
        temp = ".n7-library-stage-" + runid + "-" + name
        ftp.storbinary("STOR " + temp, io.BytesIO(data))
        staged.append(temp)
        chunks = []
        ftp.retrbinary("RETR " + temp, chunks.append)
        if hashlib.sha256(b"".join(chunks)).digest() != hashlib.sha256(data).digest():
            raise RuntimeError("CHECKSUM_MISMATCH")
    phase = "ACTIVATE"
    for name in FILES:
        temp = ".n7-library-stage-" + runid + "-" + name
        if backup[name] is not None:
            old = ".n7-library-before-" + runid + "-" + name
            ftp.rename(name, old)
            remote_backup[name] = old
        try:
            ftp.rename(temp, name)
        except Exception:
            if name in remote_backup:
                ftp.rename(remote_backup[name], name)
                del remote_backup[name]
            raise
        staged.remove(temp)
        installed.append(name)
    phase = "READBACK"
    hashes = {}
    for name, data in payload.items():
        chunks = []
        ftp.retrbinary("RETR " + name, chunks.append)
        actual = hashlib.sha256(b"".join(chunks)).hexdigest()
        if actual != hashlib.sha256(data).hexdigest():
            raise RuntimeError("FINAL_READBACK_MISMATCH")
        hashes[name] = actual
    print(json.dumps({"status": "LIBRARY_FILES_STAGED",
                      "files": list(FILES), "sha256": hashes,
                      "database_schema_installed": False,
                      "database_import_tested": False,
                      "n7_chat_connected": False,
                      "backend_restarted": False}, sort_keys=True))
except Exception as error:
    print(json.dumps({"status": "DEPLOY_FAILED", "phase": phase,
                      "error_type": type(error).__name__}))
    for name in reversed(installed):
        try:
            ftp.delete(name)
            if name in remote_backup:
                ftp.rename(remote_backup[name], name)
            elif backup.get(name) is not None:
                ftp.storbinary("STOR " + name, io.BytesIO(backup[name]))
        except Exception:
            print("ROLLBACK_REQUIRES_MANUAL_INSPECTION: " + name)
    sys.exit(1)
finally:
    for temp in staged:
        try:
            ftp.delete(temp)
        except Exception:
            pass
    try:
        ftp.quit()
    except Exception:
        pass
