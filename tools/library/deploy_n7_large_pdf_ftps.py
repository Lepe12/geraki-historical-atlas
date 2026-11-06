#!/usr/bin/env python3
"""Deploy N7 large-book upload via authenticated FTPS; staged SHA-256, backup and rollback.
Does not overwrite conversations, historical book records, approved N7 artwork or model settings.
"""
import ftplib,hashlib,io,json,os,socket,ssl,subprocess,tempfile,uuid
from pathlib import Path

ROOT="/piratecartography-gateway"
BOT="/bot.piratecartography.com/n7-app"
SRC=Path("tools/library")
host=os.environ["PCT_FTPS_HOST"];port=int(os.getenv("PCT_FTPS_PORT","21"))
alias=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
if alias:
    actual={item[4][0] for item in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    alt={item[4][0] for item in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
    if not actual.intersection(alt):raise RuntimeError("FTPS_TLS_CERT_NAME_MISMATCH")
ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
ftp.connect(host,port)
if alias:ftp.host=alias
ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
ftp.prot_p()
def fetch(path):
    parts=[];size=[0]
    def push(raw):
        size[0]+=len(raw)
        if size[0]>1_000_000:raise RuntimeError("UNEXPECTED_LIVE_FILE_SIZE")
        parts.append(raw)
    ftp.retrbinary("RETR "+path,push)
    return b"".join(parts)
def maybe(path):
    try:return fetch(path)
    except ftplib.error_perm as err:
        if str(err).startswith("550"):return None
        raise
def digest(raw):return hashlib.sha256(raw).hexdigest()
nonce=uuid.uuid4().hex[:12]
changed=[];staged=[];verified=0
try:
    bot_server=fetch(BOT+"/server.js")
    if b"/api/library/upload" not in bot_server or b"if(!session(req))" not in bot_server:
        # Existing authentication and PDF routes must remain intact.
        raise RuntimeError("BOT_SESSION_OR_PDF_ROUTE_UNRECOGNIZED")
    if b"independent-ai-bot" not in fetch(BOT+"/package.json"):
        raise RuntimeError("BOT_INSTANCE_UNRECOGNIZED")
    route=b"    if(p.startsWith('/api/library/large-pdf/'))return require('./n7-large-pdf-upload').createHandler({dataDir:DATA_DIR,json,keyPath:path.join(__dirname,'.n7-library-bridge-key')})(req,res,p,session(req));\n"
    anchor=b"    if(p==='/api/library/upload'){"
    if route not in bot_server:
        if bot_server.count(anchor)!=1:raise RuntimeError("BOT_PDF_ROUTE_ANCHOR_CHANGED")
        bot_server=bot_server.replace(anchor,route+anchor)
    if b"n7-large-pdf-upload" not in bot_server:
        raise RuntimeError("CHUNKED_PDF_ROUTE_NOT_INSTALLED")
    if b"createN7Gateway" not in fetch(ROOT+"/server/command-center-live/app.js"):
        raise RuntimeError("HISTORICAL_GATEWAY_UNRECOGNIZED")
    files={
        BOT+"/server.js":bot_server,
        BOT+"/n7-large-pdf-upload.js":(SRC/"n7-large-pdf-upload.js").read_bytes(),
        BOT+"/public/historical-library.js":(SRC/"n7-bot-autologin-ui.js").read_bytes(),
        ROOT+"/server/command-center-live/n7-gateway.js":Path("server/command-center-live/n7-gateway.js").read_bytes(),
        ROOT+"/server/command-center-live/pdf-evidence.py":Path("server/command-center-live/pdf-evidence.py").read_bytes(),
        ROOT+"/tools/library/n7_library.php":(SRC/"n7_library.php").read_bytes()
    }
    with tempfile.TemporaryDirectory(prefix="n7-pdf-validate-") as temp:
        temp=Path(temp)
        for remote,raw in files.items():
            local=temp/(remote.rsplit("/",1)[-1]+("-gateway" if remote.endswith("/n7-gateway.js") else ""))
            if remote.endswith(".js"):local=local.with_suffix(".js")
            elif remote.endswith(".php"):local=local.with_suffix(".php")
            elif remote.endswith(".py"):local=local.with_suffix(".py")
            local.write_bytes(raw)
            if remote.endswith(".js"):subprocess.run(["node","--check",str(local)],check=True,capture_output=True,timeout=20)
            if remote.endswith(".php"):subprocess.run(["php","-l",str(local)],check=True,capture_output=True,timeout=20)
            if remote.endswith(".py"):subprocess.run(["python3","-m","py_compile",str(local)],check=True,capture_output=True,timeout=20)
    originals={}
    for remote in files:
        originals[remote]=maybe(remote)
    if originals[BOT+"/server.js"] is None or originals[ROOT+"/server/command-center-live/n7-gateway.js"] is None:
        raise RuntimeError("PRODUCTION_FILE_MISSING")
    for remote,raw in files.items():
        if originals[remote]==raw:continue
        folder,filename=remote.rsplit("/",1)
        staged_path=folder+"/.n7-large-pdf-"+nonce+"-"+filename
        ftp.storbinary("STOR "+staged_path,io.BytesIO(raw))
        staged.append((remote,staged_path))
        if digest(fetch(staged_path))!=digest(raw):
            raise RuntimeError("FTPS_STAGED_HASH_MISMATCH")
    for remote,staged_path in staged:
        prior=originals[remote]
        backup=remote+".before-large-pdf-"+nonce if prior is not None else None
        if backup:ftp.rename(remote,backup)
        try:ftp.rename(staged_path,remote)
        except Exception:
            if backup:ftp.rename(backup,remote)
            raise
        changed.append((remote,backup))
    for remote,raw in files.items():
        if digest(fetch(remote))!=digest(raw):raise RuntimeError("FTPS_DEPLOY_HASH_MISMATCH")
        verified+=1
    for path in [ROOT+"/server/command-center-live/tmp/restart.txt",BOT+"/tmp/restart.txt"]:
        ftp.storbinary("STOR "+path,io.BytesIO(b""))
    print(json.dumps({"status":"N7_LARGE_PDF_DEPLOYED","sha256_verified_files":verified,
                      "files_changed":len(changed),"browser_chunk_size_mb":4,
                      "max_pdf_size_mb":200,"approved_character_modified":False,
                      "existing_library_data_modified":False,
                      "conversations_modified":False}))
except Exception:
    for remote,backup in reversed(changed):
        try:
            ftp.delete(remote)
            if backup:ftp.rename(backup,remote)
        except Exception:
            print("MANUAL_RESTORE_REQUIRED_FOR",remote.rsplit("/",1)[-1])
    raise
finally:
    for _,part in staged:
        try:ftp.delete(part)
        except ftplib.all_errors:pass
    try:ftp.quit()
    except ftplib.all_errors:pass
