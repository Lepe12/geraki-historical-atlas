#!/usr/bin/env python3
"""Explicit existing-host FTPS backend/storage deployment, with file rollback.

Credentials come from GitHub Actions secrets. Never prints credentials.
FTPS requires an explicitly configured FTP account with access to the Plesk app root.
"""
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path
import posixpath
import re
import socket
import ssl
import sys
import uuid

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path("server/command-center-live")
FILES = ("historical-evidence.js", "pdf-evidence.py", "htr_kraken.py", "pdf-evidence.js", "app.js")
REMOTE = (os.getenv("PCT_FTPS_APP_ROOT") or "/").rstrip("/") or "/"
HOST = os.environ["PCT_FTPS_HOST"]
USER = os.environ["PCT_FTPS_USER"]
PASSWORD = os.environ["PCT_FTPS_PASSWORD"]
PORT = int(os.getenv("PCT_FTPS_PORT", "21"))
TLS_NAME = os.getenv('PCT_FTPS_TLS_SERVER_NAME','').strip().rstrip('.')
MODE = os.getenv('PCT_FTPS_PAYLOAD','backend')
if MODE not in ('backend','evidence_storage'):sys.exit('BLOCKED: unknown deployment payload')

if not REMOTE.startswith("/"):
    sys.exit("BLOCKED: PCT_FTPS_APP_ROOT must be absolute")
# "/" is allowed ONLY for an FTP account rooted at the application directory.
# Verify the exact app structure after login, before any writes.
if REMOTE != "/" and not REMOTE.endswith("/server/command-center-live"):
    sys.exit("BLOCKED: remote path must end with /server/command-center-live")

payload = {name: (ROOT / SOURCE / name).read_bytes() for name in FILES}
if MODE=='evidence_storage':
    if os.getenv('PCT_FTPS_STORAGE_CONFIRMATION')!='INSTALL-EXISTING-EVIDENCE-SCHEMA':
        sys.exit('BLOCKED: explicit existing evidence schema confirmation required')
    if REMOTE=='/':sys.exit('BLOCKED: storage deployment requires the confirmed repository layout')
    names=('historical_evidence.php','historical_evidence_schema.sql','pct_research_store.php','evidence_schema_request.php')
    code={name:(ROOT/'tools/storage'/name).read_bytes() for name in names}
    requested_runs=[value for value in os.getenv('PCT_EVIDENCE_REPLAY_RUNS','').split(',') if value]
    if len(requested_runs)>10 or any(not re.fullmatch(r'\d+',value) for value in requested_runs):
        sys.exit('BLOCKED: invalid explicitly requested evidence replay runs')
    manifest={'schema':'nabou-evidence-schema-install-request-v1','database':'piratecartography',
              'confirmation':'INSTALL-EXISTING-EVIDENCE-SCHEMA','source_revision':os.environ['GITHUB_SHA'],
              'code_sha256':{name:hashlib.sha256(code[name]).hexdigest() for name in names},
              'requested_runs':requested_runs}
    # Dependencies first, CLI next, explicit request LAST. The existing cron
    # cannot request a migration against partially transferred files.
    order=('historical_evidence.php','historical_evidence_schema.sql','evidence_schema_request.php','pct_research_store.php')
    storage_directory=posixpath.normpath(REMOTE+'/../../tools/storage')
    payload={storage_directory+'/'+name:code[name] for name in order}
    payload[storage_directory+'/.evidence-schema-install-request.json']=(json.dumps(manifest,indent=2)+'\n').encode()
    FILES=tuple(payload)
runid = uuid.uuid4().hex[:12]
ftp = ftplib.FTP_TLS(timeout=30, context=ssl.create_default_context())
backups = {}
written = []
staged = []
remote_backups = {}
phase = 'CONNECT'
try:
    if TLS_NAME:
        phase = 'VALIDATE_TLS_NAME'
        if len(TLS_NAME)>253 or not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?',TLS_NAME):
            raise RuntimeError('INVALID_TLS_SERVER_NAME')
        expected={row[4][0] for row in socket.getaddrinfo(HOST,PORT,type=socket.SOCK_STREAM)}
        actual={row[4][0] for row in socket.getaddrinfo(TLS_NAME,PORT,type=socket.SOCK_STREAM)}
        if not expected.intersection(actual):raise RuntimeError('TLS_NAME_NOT_BOUND_TO_CONFIGURED_SERVER')
    phase = 'CONNECT'
    ftp.connect(HOST, PORT)
    if TLS_NAME:ftp.host=TLS_NAME
    phase = 'CONTROL_TLS_LOGIN'
    ftp.login(USER, PASSWORD)
    ftp.prot_p()
    phase = 'PREFLIGHT'
    ftp.cwd(REMOTE)
    print("Authenticated FTPS, app root:", ftp.pwd())
    existing = set(ftp.nlst())
    # Preflight: ensure this really is the NABOU app and not an arbitrary directory.
    listing = {posixpath.basename(item.rstrip("/")) for item in existing}
    if not {"package.json", "public", "tmp", "knowledge-data"}.issubset(listing):
        raise RuntimeError("BLOCKED: destination does not match expected Plesk app directory")
    if MODE=='evidence_storage':
        ftp.cwd(storage_directory)
        existing_storage={posixpath.basename(x.rstrip('/')) for x in ftp.nlst()}
        ftp.cwd(REMOTE)
        if 'pct_research_store.php' not in existing_storage:raise RuntimeError('EXISTING_HOST_LOCAL_IMPORTER_REQUIRED')
        if '.evidence-schema-install-request.json' in existing_storage:raise RuntimeError('PENDING_SCHEMA_REQUEST_ALREADY_EXISTS')
    for name in FILES:
        try:
            chunks = []
            ftp.retrbinary("RETR " + name, chunks.append)
            backups[name] = b"".join(chunks)
        except ftplib.error_perm as exc:
            if not str(exc).startswith("550"):
                raise
            known=existing_storage if MODE=='evidence_storage' else listing
            if posixpath.basename(name) in known:raise RuntimeError('EXISTING_FILE_BACKUP_UNAVAILABLE')
            backups[name] = None
    if MODE=='evidence_storage' and backups[storage_directory+'/.evidence-schema-install-request.json'] is not None:
        raise RuntimeError('PENDING_SCHEMA_REQUEST_ALREADY_EXISTS')
    # Stage every file before modifying the running code.
    phase = 'STAGE_UPLOAD'
    for name, data in payload.items():
        stage = posixpath.join(posixpath.dirname(name),'.nabou-ftps-'+runid+'-'+posixpath.basename(name))
        staged.append(stage)
        ftp.storbinary("STOR " + stage, io.BytesIO(data))
        chunks = []
        ftp.retrbinary("RETR " + stage, chunks.append)
        if hashlib.sha256(b"".join(chunks)).digest() != hashlib.sha256(data).digest():
            raise RuntimeError("Upload checksum mismatch: " + name)
    # Load helper modules first and app.js last to limit partial activation window.
    phase = 'ACTIVATE'
    for name in FILES:
        stage = posixpath.join(posixpath.dirname(name),'.nabou-ftps-'+runid+'-'+posixpath.basename(name))
        if backups[name] is not None:
            backup_name = posixpath.join(posixpath.dirname(name),'.nabou-before-'+runid+'-'+posixpath.basename(name))
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
    if MODE=='backend':
        marker = "tmp/restart.txt"
        phase = 'RESTART'
        ftp.storbinary("STOR " + marker, io.BytesIO(b""))
        print("DEPLOYED: five verified backend files and issued Passenger restart marker.")
    else:
        print('STORAGE_FILES_STAGED_AWAITING_EXISTING_HOST_LOCAL_CRON')
    print("Existing files were retained as remote .nabou-before-* recovery copies.")
except Exception as exc:
    # Server-supplied messages can repeat login details. Record the error type,
    # never raw exception text or credential-bearing URLs.
    print("DEPLOY FAILED:", type(exc).__name__)
    print("DEPLOY_FAILURE_PHASE:", phase)
    if isinstance(exc,ftplib.Error):
        reply=re.match(r'(\d{3})',str(exc))
        if reply:print('FTP_REPLY_CODE:',reply.group(1))
        for pattern,reason in ((r'too many|maximum.*connection','CONNECTION_LIMIT'),
                               (r'no such|not found|no files','PATH_NOT_FOUND'),
                               (r'permission|not permitted|access denied','PERMISSION_DENIED'),
                               (r'session reuse|tls session','TLS_SESSION_REQUIREMENT')):
            if re.search(pattern,str(exc),re.I):print('FTP_FAILURE_REASON:',reason);break
    if isinstance(exc, ssl.SSLCertVerificationError):
        print("TLS_VERIFY_CODE:", exc.verify_code)
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
