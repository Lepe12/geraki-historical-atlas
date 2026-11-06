#!/usr/bin/env python3
"""Deploy only library count reporting, safely over existing verified FTPS."""
import ftplib,hashlib,io,json,os,re,socket,ssl,subprocess,tempfile,uuid
from pathlib import Path
ROOT="/piratecartography-gateway"
BOT="/bot.piratecartography.com/n7-app"
source=Path("tools/library")
route=(source/"n7-bot-library-route.snippet").read_bytes()
ui=(source/"n7-bot-autologin-ui.js").read_bytes()
php=Path("tools/library/n7_library.php").read_bytes()
gateway=Path("server/command-center-live/n7-gateway.js").read_bytes()
host=os.environ["PCT_FTPS_HOST"];port=int(os.getenv("PCT_FTPS_PORT","21"))
alias=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
if alias:
    actual={r[4][0] for r in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    named={r[4][0] for r in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
    if not actual.intersection(named):raise RuntimeError("TLS_ALIAS_NOT_VERIFIED")
ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
ftp.connect(host,port)
if alias:ftp.host=alias
ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
ftp.prot_p()
def read(p):
    blocks=[];total=0
    def add(b):
        nonlocal total
        total+=len(b)
        if total>600000:raise RuntimeError("FILE_SIZE_LIMIT")
        blocks.append(b)
    ftp.retrbinary("RETR "+p,add)
    return b"".join(blocks)
def sha(b):return hashlib.sha256(b).digest()
def optional(p):
    try:return read(p)
    except ftplib.error_perm as e:
        if str(e).startswith("550"):return None
        raise
changed=[];staged=[];nonce=uuid.uuid4().hex[:12]
try:
    if b"createN7Gateway" not in read(ROOT+"/server/command-center-live/app.js"):
        raise RuntimeError("WRONG_GATEWAY")
    bot_server=read(BOT+"/server.js")
    if b"independent-ai-bot" not in read(BOT+"/package.json"):
        raise RuntimeError("WRONG_BOT")
    if b"/api/library/search" not in bot_server or (b"x-n7-library-signature" not in bot_server and b"X-N7-Library-Signature" not in bot_server):
        raise RuntimeError("AUTHENTICATED_BOT_PROXY_MISSING")
    # Increase the existing server-side search cap to match the ranked top 30.
    if b"result.matches.slice(0,15)" in bot_server:
        bot_server=bot_server.replace(b"result.matches.slice(0,15)",b"result.matches.slice(0,30)")
    elif b"result.matches.slice(0,30)" not in bot_server:
        raise RuntimeError("BOT_SEARCH_ROUTE_CHANGED")
    # Add a new page-only proxy without replacing working search, login or agent logic.
    if b"if(p==='/api/library/page')" not in bot_server:
        marker=re.search(rb"(?m)^[ \\t]*if\\s*\\(\\s*p\\s*===\\s*['\\\"]/api/library/search['\\\"]\\s*\\)\\s*\\{",bot_server)
        if not marker:raise RuntimeError("BOT_LIBRARY_SEARCH_ANCHOR_CHANGED")
        page_route=(source/"n7-bot-full-page-route.snippet").read_bytes()
        bot_server=bot_server[:marker.start()]+page_route+bot_server[marker.start():]
    with tempfile.TemporaryDirectory() as tmp:
        script=Path(tmp)/"server.js";script.write_bytes(bot_server)
        subprocess.run(["node","--check",str(script)],check=True,capture_output=True,timeout=20)
    if b"relevance_score" not in php or b"n7-library-page-v1" not in gateway or b"n7LibraryPage" not in ui:
        raise RuntimeError("COUNT_FIELDS_NOT_PRESENT")
    files={
        ROOT+"/tools/library/n7_library.php":php,
        ROOT+"/server/command-center-live/n7-gateway.js":gateway,
        BOT+"/server.js":bot_server,
        BOT+"/public/historical-library.js":ui
    }
    # No writes until every original exists and all staged payloads verify.
    originals={}
    for p,data in files.items():
        original=optional(p)
        if original is None:raise RuntimeError("EXPECTED_PRODUCTION_FILE_MISSING")
        originals[p]=original
        if original==data:continue
        parent=p.rsplit("/",1)[0];name=p.rsplit("/",1)[-1]
        temporary=parent+"/.n7-index-stage-"+nonce+"-"+name
        ftp.storbinary("STOR "+temporary,io.BytesIO(data))
        staged.append((p,temporary))
        if sha(read(temporary))!=sha(data):raise RuntimeError("STAGE_READBACK_MISMATCH")
    for p,temporary in staged:
        backup=p+".n7-index-backup-"+nonce
        ftp.rename(p,backup)
        try:ftp.rename(temporary,p)
        except Exception:
            ftp.rename(backup,p)
            raise
        changed.append((p,backup))
    for p,data in files.items():
        if sha(read(p))!=sha(data):raise RuntimeError("FINAL_HASH_MISMATCH")
    ftp.storbinary("STOR "+ROOT+"/server/command-center-live/tmp/restart.txt",io.BytesIO(b""))
    ftp.storbinary("STOR "+BOT+"/tmp/restart.txt",io.BytesIO(b""))
    print(json.dumps({"status":"LIBRARY_SEARCH_QUALITY_DEPLOYED","verified_files":len(files),"backups_created":len(changed),"php_changed":True,"source_data_modified":False}))
except Exception:
    for p,backup in reversed(changed):
        try:ftp.delete(p);ftp.rename(backup,p)
        except Exception:print("ROLLBACK_CHECK_REQUIRED",p.rsplit("/",1)[-1])
    raise
finally:
    for p,temporary in staged:
        try:ftp.delete(temporary)
        except ftplib.all_errors:pass
    try:ftp.quit()
    except ftplib.all_errors:pass
