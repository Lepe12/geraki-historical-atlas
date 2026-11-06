#!/usr/bin/env python3
"""Install scoped N7 library session bridge using the existing verified FTPS connection."""
import ftplib,hashlib,io,json,os,re,socket,ssl,subprocess,tempfile,uuid
from pathlib import Path

BOT="/bot.piratecartography.com/n7-app"
API="/piratecartography-gateway/server/command-center-live"
KEY=".n7-library-bridge-key"
source=Path("tools/library")
ui=(source/"n7-bot-autologin-ui.js").read_bytes()
route=(source/"n7-bot-library-route.snippet").read_bytes()
if b"/api/library/search" not in ui or b"/api/library/search" not in route:
    raise RuntimeError("UNEXPECTED_SOURCE")
host=os.environ["PCT_FTPS_HOST"]
port=int(os.environ.get("PCT_FTPS_PORT","21"))
alias=os.environ.get("PCT_FTPS_TLS_SERVER_NAME","").strip()
if alias:
    ips={p[4][0] for p in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    named={p[4][0] for p in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
    if not ips.intersection(named):raise RuntimeError("UNVERIFIED_TLS_ALIAS")
ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
ftp.connect(host,port)
if alias:ftp.host=alias
ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
ftp.prot_p()
def fetch(p):
    chunks=[];size=0
    def add(b):
        nonlocal size
        size+=len(b)
        if size>400000:raise RuntimeError("REMOTE_FILE_TOO_LARGE")
        chunks.append(b)
    ftp.retrbinary("RETR "+p,add)
    return b"".join(chunks)
def optional(p):
    try:return fetch(p)
    except ftplib.error_perm as e:
        if str(e).startswith("550"):return None
        raise
def sha(b):return hashlib.sha256(b).hexdigest()
nonce=uuid.uuid4().hex[:12]
staged=[];updated=[];payload={}
try:
    ftp.cwd(BOT)
    if b"independent-ai-bot" not in fetch("package.json"):raise RuntimeError("WRONG_BOT")
    server=fetch("server.js")
    html=fetch("public/index.html")
    if b"Independent AI Bot" not in html:raise RuntimeError("WRONG_CHAT")
    if b"if(p==='/api/library/search')" not in server:
        guard=re.search(rb"(?m)^([ \t]*)if \(!session\(req\)\) \{\r?\n(?:[^\r\n]*\r?\n){1,6}?\1\}\r?\n",server)
        if not guard:
            raise RuntimeError("BOT_GLOBAL_SESSION_GUARD_CHANGED")
        server=server[:guard.end()]+route+server[guard.end():]
    elif b"x-n7-library-signature" not in server and b"X-N7-Library-Signature" not in server:
        raise RuntimeError("UNVERIFIED_BOT_LIBRARY_ROUTE")
    with tempfile.TemporaryDirectory() as d:
        js=Path(d)/"server.js";js.write_bytes(server)
        subprocess.run(["node","--check",str(js)],check=True,timeout=20,capture_output=True)
    if b"historical-library.js" not in html:raise RuntimeError("BOT_LIBRARY_NOT_INSTALLED")
    ftp.cwd(API)
    if b"createN7Gateway" not in fetch("app.js"):raise RuntimeError("WRONG_BACKEND")
    if b"verifyLibraryBridge" not in fetch("n7-library-bridge.js"):raise RuntimeError("BACKEND_BRIDGE_NOT_DEPLOYED")
    botkey=optional(BOT+"/"+KEY)
    apikey=optional(API+"/"+KEY)
    if botkey is not None and apikey is not None and botkey!=apikey:raise RuntimeError("BRIDGE_KEYS_DIFFER")
    key=botkey or apikey or os.urandom(32)
    if len(key)!=32:raise RuntimeError("INVALID_BRIDGE_KEY")
    payload={
       BOT+"/"+KEY:key,
       API+"/"+KEY:key,
       BOT+"/server.js":server,
       BOT+"/public/historical-library.js":ui
    }
    # Stage and verify every file before changing live paths.
    for p,data in payload.items():
        current=optional(p)
        if current==data:continue
        parent,name=p.rsplit("/",1)
        stage=parent+"/.n7-stage-"+nonce+"-"+name
        ftp.storbinary("STOR "+stage,io.BytesIO(data))
        staged.append((p,stage,current))
        if sha(fetch(stage))!=sha(data):raise RuntimeError("STAGING_HASH_MISMATCH")
    # Keys first; server route last. Roll back on any failure.
    staged.sort(key=lambda x:(x[0].endswith("/server.js"), x[0].endswith("/historical-library.js")))
    for p,tmp,previous in staged:
        backup=None
        if previous is not None:
            backup=p+".n7-before-"+nonce
            ftp.rename(p,backup)
        try:ftp.rename(tmp,p)
        except Exception:
            if backup:ftp.rename(backup,p)
            raise
        updated.append((p,backup))
    for p,data in payload.items():
        if sha(fetch(p))!=sha(data):raise RuntimeError("FINAL_READBACK_MISMATCH")
    ftp.storbinary("STOR "+BOT+"/tmp/restart.txt",io.BytesIO(b""))
    print(json.dumps({"status":"DEPLOYED","verified_files":len(payload),
        "shared_bridge_key_present":True,"historical_database_untouched":True}))
except Exception:
    for p,backup in reversed(updated):
        try:
            ftp.delete(p)
            if backup:ftp.rename(backup,p)
        except Exception:print("ROLLBACK_REQUIRES_CHECK",p.rsplit("/",1)[-1])
    raise
finally:
    for p,tmp,_ in staged:
        try:ftp.delete(tmp)
        except ftplib.all_errors:pass
    try:ftp.quit()
    except ftplib.all_errors:pass
