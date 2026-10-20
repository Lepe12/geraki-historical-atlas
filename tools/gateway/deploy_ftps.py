#!/usr/bin/env python3
"""Manually gated FTPS deployment of only the NABOU Node backend, with rollback.

Credentials come from GitHub Actions secrets. Never prints credentials.
FTPS requires an explicitly configured FTP account with access to the Plesk app root.
"""
import ftplib
import hashlib
import io
import os
from pathlib import Path
import posixpath
import sys
import uuid

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path("server/command-center-live")
FILES = ("historical-evidence.js", "pdf-evidence.py", "pdf-evidence.js", "app.js")
REMOTE = (os.getenv("PCT_FTPS_APP_ROOT") or "/").rstrip("/") or "/"
HOST = os.environ["PCT_FTPS_HOST"]
USER = os.environ["PCT_FTPS_USER"]
PASSWORD = os.environ["PCT_FTPS_PASSWORD"]
PORT = int(os.getenv("PCT_FTPS_PORT", "21"))

if not REMOTE.startswith("/"):
    sys.exit("BLOCKED: PCT_FTPS_APP_ROOT must be absolute")
# "/" is allowed ONLY for an FTP account rooted at the application directory.
# Verify the exact app structure after login, before any writes.
if REMOTE != "/" and not REMOTE.endswith("/server/command-center-live"):
    sys.exit("BLOCKED: remote path must end with /server/command-center-live")

payload = {name: (ROOT / SOURCE / name).read_bytes() for name in FILES}
runid = uuid.uuid4().hex[:12]
ftp = ftplib.FTP_TLS(timeout=30)
backups = {}
written = []
staged = []
remote_backups = {}
try:
    ftp.connect(HOST, PORT)
    ftp.login(USER, PASSWORD)
    ftp.prot_p()
    ftp.cwd(REMOTE)
    print("Authenticated FTPS, app root:", ftp.pwd())
    existing = set(ftp.nlst())
    # Preflight: ensure this really is the NABOU app and not an arbitrary directory.
    listing = {posixpath.basename(item.rstrip("/")) for item in existing}
    if not {"package.json", "public", "tmp", "knowledge-data"}.issubset(listing):
        raise RuntimeError("BLOCKED: destination does not match expected Plesk app directory")
    for name in FILES:
        try:
            chunks = []
            ftp.retrbinary("RETR " + name, chunks.append)
            backups[name] = b"".join(chunks)
        except ftplib.error_perm as exc:
            if not str(exc).startswith("550"):
                raise
            backups[name] = None
    # Stage every file before modifying the running code.
    for name, data in payload.items():
        stage = ".nabou-ftps-" + runid + "-" + name
        ftp.storbinary("STOR " + stage, io.BytesIO(data))
        chunks = []
        ftp.retrbinary("RETR " + stage, chunks.append)
        if hashlib.sha256(b"".join(chunks)).digest() != hashlib.sha256(data).digest():
            raise RuntimeError("Upload checksum mismatch: " + name)
        staged.append(stage)
    # Load helper modules first and app.js last to limit partial activation window.
    for name in FILES:
        stage = ".nabou-ftps-" + runid + "-" + name
        if backups[name] is not None:
            backup_name = ".nabou-before-" + runid + "-" + name
            ftp.rename(name, backup_name)
            remote_backups[name] = backup_name
        # Write to the live name only after original has been saved remotely.
        try:
            ftp.rename(stage, name)
        except Exception:
            if name in remote_backups:
                ftp.rename(remote_backups.pop(name), name)
            raise
        staged.remove(stage)
        written.append(name)
    # Passenger restart marker is only issued after complete successful deployment.
    marker = "tmp/restart.txt"
    ftp.storbinary("STOR " + marker, io.BytesIO(b""))
    print("DEPLOYED: four verified backend files and issued Passenger restart marker.")
    print("Existing files were retained as remote .nabou-before-* recovery copies.")
except Exception as exc:
    print("DEPLOY FAILED:", type(exc).__name__, str(exc))
    for name in reversed(written):
        try:
            ftp.delete(name)
            if name in remote_backups:
                ftp.rename(remote_backups[name], name)
            elif backups[name] is not None:
                ftp.storbinary("STOR " + name, io.BytesIO(backups[name]))
        except Exception:
            print("ROLLBACK NEEDS MANUAL CHECK:", name)
    sys.exit(1)
finally:
    for stage in staged:
        try:
            ftp.delete(stage)
        except Exception:
            pass
    try:
        ftp.quit()
    except Exception:
        pass
