#!/usr/bin/env python3
"""Deploy only N7 library read-only routes and Agent Room panel to existing Passenger backend."""
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
import time
import uuid
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[2]
FILES={
    "n7-gateway.js":(ROOT/"server/command-center-live/n7-gateway.js").read_bytes(),
    "public/agents.html":(ROOT/"server/command-center-live/public/agents.html").read_bytes(),
}
APP="/piratecartography-gateway/server/command-center-live"
if os.environ.get("PCT_FTPS_APP_ROOT")!=APP:sys.exit("BLOCKED_APP_ROOT")
HOST=os.environ["PCT_FTPS_HOST"]
USER=os.environ["PCT_FTPS_USER"]
PASSWORD=os.environ["PCT_FTPS_PASSWORD"]
PORT=int(os.environ.get("PCT_FTPS_PORT","21"))
TLS_NAME=os.environ.get("PCT_FTPS_TLS_SERVER_NAME","").strip().rstrip(".")
ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
backups={};stages=[];active=[];remoteBackups={}
nonce=uuid.uuid4().hex[:10];phase="CONNECT"
def get(remote):
    buf=[];ftp.retrbinary("RETR "+remote,buf.append);return b"".join(buf)
def upload(remote,data):
    ftp.storbinary("STOR "+remote,io.BytesIO(data))
def smoke():
    base="https://pct-live.piratecartography.com/pct-api/live"
    try:
        with urllib.request.urlopen(base+"/health",timeout=8) as res:
            if res.status!=200:return False
        try:
            urllib.request.urlopen(base+"/n7/library/search?q=test",timeout=8)
        except urllib.error.HTTPError as e:
            if e.code==401:
                data=json.loads(e.read().decode("utf-8"))
                return data.get("error")=="operator_authorization_required"
        return False
    except (urllib.error.URLError,TimeoutError,ValueError):
        return False
try:
    if TLS_NAME:
        if len(TLS_NAME)>253 or not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?",TLS_NAME):
            raise RuntimeError("INVALID_TLS_SERVER_NAME")
        resolved={v[4][0] for v in socket.getaddrinfo(HOST,PORT,type=socket.SOCK_STREAM)}
        cert={v[4][0] for v in socket.getaddrinfo(TLS_NAME,PORT,type=socket.SOCK_STREAM)}
        if not resolved.intersection(cert):raise RuntimeError("TLS_NAME_NOT_MATCHING_HOST")
    ftp.connect(HOST,PORT)
    if TLS_NAME:ftp.host=TLS_NAME
    phase="AUTH"
    ftp.login(USER,PASSWORD)
    ftp.prot_p()
    phase="PREFLIGHT"
    ftp.cwd(APP)
    listing={posixpath.basename(x.rstrip("/")) for x in ftp.nlst()}
    if not {"package.json","public","tmp","knowledge-data"}.issubset(listing):
        raise RuntimeError("UNEXPECTED_APP_ROOT")
    for name in FILES:
        backups[name]=get(name)
    phase="STAGE"
    for name,data in FILES.items():
        stage=posixpath.join(posixpath.dirname(name),".n7-bridge-stage-"+nonce+"-"+posixpath.basename(name))
        upload(stage,data);stages.append(stage)
        if hashlib.sha256(get(stage)).digest()!=hashlib.sha256(data).digest():
            raise RuntimeError("STAGING_CHECKSUM_FAILED")
    phase="ACTIVATE"
    for name in FILES:
        stage=posixpath.join(posixpath.dirname(name),".n7-bridge-stage-"+nonce+"-"+posixpath.basename(name))
        before=posixpath.join(posixpath.dirname(name),".n7-bridge-before-"+nonce+"-"+posixpath.basename(name))
        ftp.rename(name,before);remoteBackups[name]=before
        try:ftp.rename(stage,name)
        except Exception:
            ftp.rename(before,name);remoteBackups.pop(name,None);raise
        stages.remove(stage);active.append(name)
    phase="READBACK"
    for name,data in FILES.items():
        if hashlib.sha256(get(name)).digest()!=hashlib.sha256(data).digest():
            raise RuntimeError("FINAL_READBACK_CHECKSUM_FAILED")
    phase="RESTART"
    upload("tmp/restart.txt",b"")
    print(json.dumps({"status":"LIBRARY_BRIDGE_FILES_INSTALLED",
                      "backend_restarted":True,
                      "files":{n:hashlib.sha256(v).hexdigest() for n,v in FILES.items()},
                      "db_schema_changed":False}))
    phase="HTTP_SMOKE"
    for _ in range(12):
        if smoke():
            print(json.dumps({"status":"PASS","checks":["health_http_200","library_unauthenticated_http_401"],
                              "historical_data_verified":False}))
            break
        time.sleep(5)
    else:
        print(json.dumps({"status":"HTTP_SMOKE_UNCONFIRMED","files_installed":True}))
        raise RuntimeError("HTTP_SMOKE_FAILED")
except Exception as err:
    print(json.dumps({"status":"BRIDGE_DEPLOY_FAILED","phase":phase,"error_type":type(err).__name__,
                      "reason":str(err) if isinstance(err,RuntimeError) and re.fullmatch(r"[A-Z_]+",str(err)) else None}))
    if active:
        for name in reversed(active):
            try:
                ftp.delete(name)
                ftp.rename(remoteBackups[name],name)
            except Exception:
                print("ROLLBACK_REQUIRES_MANUAL_CHECK",name)
        try:upload("tmp/restart.txt",b"")
        except Exception:print("ROLLBACK_RESTART_REQUIRES_MANUAL_CHECK")
    sys.exit(1)
finally:
    for stage in stages:
        try:ftp.delete(stage)
        except Exception:pass
    try:ftp.quit()
    except Exception:pass
