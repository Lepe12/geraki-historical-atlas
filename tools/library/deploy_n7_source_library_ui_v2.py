#!/usr/bin/env python3
"""Deploy ONLY the private N7 library modal UI + script cache-bust to Top.Host.
Do not alter book files, OCR jobs, backend services, user login, character or chat.
"""
import ftplib
import hashlib
import io
import json
import os
import re
import socket
import ssl
import uuid
from pathlib import Path

HOST=os.environ["PCT_FTPS_HOST"]
PORT=int(os.getenv("PCT_FTPS_PORT","21"))
ALIAS=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
ROOT="/bot.piratecartography.com/n7-app/public"
SOURCE=Path("tools/library/n7-source-library-ui-v2.js").read_bytes()
V1=Path("tools/n7/source-library-ui.js").read_bytes()
assert b"N7_SOURCE_LIBRARY_UI_V2" in SOURCE
assert b"N7_SOURCE_LIBRARY_UI_V1" in V1
assert b"closeLibrary()" in SOURCE and b"n7-library-close" in SOURCE
def sha(x):return hashlib.sha256(x).hexdigest()
def read(ftp,name):
    data=[]
    ftp.retrbinary("RETR "+name,data.append)
    raw=b"".join(data)
    if len(raw)>300000:raise RuntimeError("UNEXPECTED_UI_FILE_SIZE")
    return raw
if ALIAS:
    actual={x[4][0] for x in socket.getaddrinfo(HOST,PORT,type=socket.SOCK_STREAM)}
    expected={x[4][0] for x in socket.getaddrinfo(ALIAS,PORT,type=socket.SOCK_STREAM)}
    if not actual.intersection(expected):raise RuntimeError("TLS_HOST_UNEXPECTED")
ftp=ftplib.FTP_TLS(timeout=32,context=ssl.create_default_context())
ftp.connect(HOST,PORT)
if ALIAS:ftp.host=ALIAS
ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
ftp.prot_p()
ftp.cwd(ROOT)
nonce=uuid.uuid4().hex[:12]
staged=[]
changes=[]
def swap(name,old,data):
    if old==data:return
    stage=".n7-modal-stage-"+nonce+"-"+name
    backup=".n7-modal-backup-"+nonce+"-"+name
    ftp.storbinary("STOR "+stage,io.BytesIO(data))
    staged.append(stage)
    if sha(read(ftp,stage))!=sha(data):raise RuntimeError("STAGED_HASH_MISMATCH")
    if sha(read(ftp,name))!=sha(old):raise RuntimeError("CONCURRENT_MODIFICATION")
    ftp.rename(name,backup)
    try:ftp.rename(stage,name)
    except Exception:ftp.rename(backup,name);raise
    staged.remove(stage)
    changes.append((name,backup))
    try:ftp.sendcmd("SITE CHMOD 644 "+name)
    except ftplib.error_perm:pass
    if sha(read(ftp,name))!=sha(data):raise RuntimeError("FINAL_HASH_MISMATCH")
try:
    live=read(ftp,"n7-library-ui.js")
    index=read(ftp,"index.html")
    # Guard against overwriting a newer, independently modified version of the library.
    if live!=V1 and live!=SOURCE:
        print(json.dumps({"status":"UNEXPECTED_LIVE_MODAL","old_hash":sha(live)[:16],
              "canonical_v1_hash":sha(V1)[:16],"has_v1":b"N7_SOURCE_LIBRARY_UI_V1" in live}))
        raise RuntimeError("LIBRARY_UI_DRIFT_ABORT")
    if b"/n7-library-ui.js" not in index:raise RuntimeError("LIBRARY_SCRIPT_TAG_MISSING")
    pattern=rb'(<script\s+src="/n7-library-ui\.js)(?:\?v=[A-Za-z0-9_-]+)?("\s+defer></script>)'
    replacement=rb'\g<1>?v='+sha(SOURCE)[:12].encode()+rb'\g<2>'
    next_index,count=re.subn(pattern,replacement,index)
    if count!=1:raise RuntimeError("UNEXPECTED_LIBRARY_SCRIPT_TAG")
    swap("n7-library-ui.js",live,SOURCE)
    swap("index.html",index,next_index)
    print(json.dumps({"status":"N7_LIBRARY_MODAL_UI_DEPLOYED","new_version_sha256":sha(SOURCE),
      "files_changed":len(changes),"ui_close_x":True,"escape_and_backdrop_close":True,
      "sections":4,"book_records_modified":False,"ocr_progress_modified":False}))
except Exception:
    for name,backup in reversed(changes):
        try:ftp.delete(name);ftp.rename(backup,name)
        except ftplib.all_errors:print("MANUAL_ROLLBACK_REQUIRED",name)
    raise
finally:
    for name in staged:
        try:ftp.delete(name)
        except ftplib.all_errors:pass
    ftp.quit()
