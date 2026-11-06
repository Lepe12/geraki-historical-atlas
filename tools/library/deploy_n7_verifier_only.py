#!/usr/bin/env python3
"""Deploy N7 library verifier before bot proxy, leaving all other gateway files intact."""
import ftplib,hashlib,io,json,os,ssl,socket,uuid
from pathlib import Path
ROOT="/piratecartography-gateway/server/command-center-live"
NAMES=["n7-library-bridge.js","n7-gateway.js"]
src=Path("server/command-center-live")
data={name:(src/name).read_bytes() for name in NAMES}
host=os.environ["PCT_FTPS_HOST"];port=int(os.getenv("PCT_FTPS_PORT","21"))
alias=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
if alias:
    actual={v[4][0] for v in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    named={v[4][0] for v in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
    assert actual.intersection(named),"UNVERIFIED_TLS_NAME"
ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
ftp.connect(host,port)
if alias:ftp.host=alias
ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
ftp.prot_p()
ftp.cwd(ROOT)
def read(name):
    out=[];ftp.retrbinary("RETR "+name,out.append)
    return b"".join(out)
def optional(name):
    try:return read(name)
    except ftplib.error_perm as e:
        if str(e).startswith("550"):return None
        raise
assert b"createN7Gateway" in read("app.js"),"UNEXPECTED_APP_ROOT"
assert b"verifyLibraryBridge" in data["n7-gateway.js"],"VERIFIER_NOT_WIRED"
sha=lambda b:hashlib.sha256(b).digest()
nonce=uuid.uuid4().hex[:12]
staged=[];installed=[]
try:
    for name in NAMES:
        if optional(name)==data[name]:continue
        tmp=".n7bridge-stage-"+nonce+"-"+name
        ftp.storbinary("STOR "+tmp,io.BytesIO(data[name]))
        if sha(read(tmp))!=sha(data[name]):raise RuntimeError("STAGE_HASH_MISMATCH")
        staged.append((name,tmp))
    for name,tmp in staged:
        backup=None
        if optional(name) is not None:
            backup=".n7bridge-before-"+nonce+"-"+name
            ftp.rename(name,backup)
        try:ftp.rename(tmp,name)
        except Exception:
            if backup:ftp.rename(backup,name)
            raise
        installed.append((name,backup))
    for name in NAMES:
        if sha(read(name))!=sha(data[name]):raise RuntimeError("VERIFY_FAILED")
    ftp.storbinary("STOR tmp/restart.txt",io.BytesIO(b""))
    print(json.dumps({"status":"N7_BRIDGE_VERIFIER_INSTALLED","files_verified":NAMES,"passenger_restart_requested":True}))
except Exception:
    for name,backup in reversed(installed):
        try:
            ftp.delete(name)
            if backup:ftp.rename(backup,name)
        except Exception:print("ROLLBACK_MANUAL_CHECK",name)
    raise
finally:
    for name,tmp in staged:
        try:ftp.delete(tmp)
        except ftplib.all_errors:pass
    try:ftp.quit()
    except ftplib.all_errors:pass
