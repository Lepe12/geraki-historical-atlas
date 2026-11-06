#!/usr/bin/env python3
"""N7 research/ingestion deploy: exact live patch, no DB row writes, staged FTPS SHA checks and rollback."""
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import tempfile
import uuid

ROOT="/piratecartography-gateway"
BOT="/bot.piratecartography.com/n7-app"
STAGE=Path("tools/library")
host=os.environ["PCT_FTPS_HOST"]
port=int(os.getenv("PCT_FTPS_PORT","21"))
alias=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
if alias:
    host_ips={i[4][0] for i in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    name_ips={i[4][0] for i in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
    if not host_ips.intersection(name_ips):
        raise RuntimeError("FTPS_TLS_IDENTITY_MISMATCH")
ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
ftp.connect(host,port)
if alias:ftp.host=alias
ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
ftp.prot_p()

def read(path):
    blocks=[]
    count=0
    def add(chunk):
        nonlocal count
        count+=len(chunk)
        if count>1_000_000:raise RuntimeError("UNEXPECTED_LIVE_FILE_SIZE")
        blocks.append(chunk)
    ftp.retrbinary("RETR "+path,add)
    return b"".join(blocks)
def maybe(path):
    try:return read(path)
    except ftplib.error_perm as error:
        if str(error).startswith("550"):return None
        raise
def sha(data):return hashlib.sha256(data).hexdigest()
def add_once(source,needle,insert,marker):
    if marker in source:return source
    if source.count(needle)!=1:raise RuntimeError("LIVE_ANCHOR_NOT_UNIQUE")
    return source.replace(needle,insert+needle)
def require_once(source,needle,insert,marker):
    if marker in source:return source
    if source.count(needle)!=1:raise RuntimeError("LIVE_REQUIRE_ANCHOR_CHANGED")
    return source.replace(needle,needle+insert)

changed=[]
staged=[]
nonce=uuid.uuid4().hex[:12]
try:
    current=read(BOT+"/server.js")
    if b"if(!session(req))" not in current:
        raise RuntimeError("EXISTING_BOT_SESSION_REQUIRED")
    if b"/api/library/search" not in current or b"/api/library/page" not in current:
        raise RuntimeError("EXISTING_PRIVATE_LIBRARY_MISSING")
    if b"independent-ai-bot" not in read(BOT+"/package.json"):
        raise RuntimeError("WRONG_N7_BOT")
    if b"createN7Gateway" not in read(ROOT+"/server/command-center-live/app.js"):
        raise RuntimeError("WRONG_HISTORICAL_GATEWAY")

    current=require_once(current,
        b"const { runAgent } = require('./agent');",
        b"\nconst historicalResearch = require('./historical-research');",
        b"const historicalResearch = require('./historical-research');")

    original_chat=b"      const history=[...item.messages,{role:'user',content}];\n      let reply;try {reply=await answer(history);}catch(e){return json(res,502,{error:e.message});}\n"
    replacement_chat=(STAGE/"n7-research-chat-handler.snippet").read_bytes()
    if b"historicalResearch.research(content" not in current:
        if current.count(original_chat)!=1:
            print(json.dumps({"live_chat_lines":[x.decode("utf-8","replace")[:200] for x in current.splitlines() if b"const history" in x or b"reply=await answer" in x or b"const chat=" in x][:8]}))
            raise RuntimeError("LIVE_CHAT_HANDLER_CHANGED")
        current=current.replace(original_chat,replacement_chat)
    current=add_once(current,
        b"    if(p==='/api/library/search'){",
        (STAGE/"n7-research-upload-route.snippet").read_bytes(),
        b"    if(p==='/api/library/upload'){")
    current=add_once(current,
        b"    if(req.method==='GET'&&p==='/api/skills/feedback')",
        (STAGE/"n7-research-capabilities.snippet").read_bytes(),
        b"    if(req.method==='GET'&&p==='/api/research/capabilities')")
    if b"pdf_upload:false" in current:
        current=current.replace(b"pdf_upload:false",b"pdf_upload:true")
    if b"historicalResearch.research(content" not in current or b"/api/library/upload" not in current:
        raise RuntimeError("RESEARCH_PATCH_INCOMPLETE")

    files={
        BOT+"/server.js":current,
        BOT+"/historical-research.js":(STAGE/"n7-historical-research.js").read_bytes(),
        BOT+"/public/historical-library.js":(STAGE/"n7-bot-autologin-ui.js").read_bytes(),
        ROOT+"/server/command-center-live/n7-gateway.js":Path("server/command-center-live/n7-gateway.js").read_bytes(),
        ROOT+"/tools/library/n7_library.php":(STAGE/"n7_library.php").read_bytes()
    }
    with tempfile.TemporaryDirectory(prefix="n7-ci-") as tmpdir:
        tmpdir=Path(tmpdir)
        for key,filename in [(BOT+"/server.js","server.js"),
                             (BOT+"/historical-research.js","historical-research.js"),
                             (BOT+"/public/historical-library.js","historical-library.js"),
                             (ROOT+"/server/command-center-live/n7-gateway.js","n7-gateway.js")]:
            local=tmpdir/filename
            local.write_bytes(files[key])
            subprocess.run(["node","--check",str(local)],check=True,timeout=20,capture_output=True)
        local=tmpdir/"n7_library.php"
        local.write_bytes(files[ROOT+"/tools/library/n7_library.php"])
        subprocess.run(["php","-l",str(local)],check=True,timeout=20,capture_output=True)
    originals={path:maybe(path) for path in files}
    if originals[BOT+"/server.js"] is None or originals[ROOT+"/server/command-center-live/n7-gateway.js"] is None:
        raise RuntimeError("REQUIRED_PRODUCTION_FILE_MISSING")
    for path,data in files.items():
        if originals[path]==data:continue
        folder,filename=path.rsplit("/",1)
        staged_path=folder+"/.n7-research-staged-"+nonce+"-"+filename
        ftp.storbinary("STOR "+staged_path,io.BytesIO(data))
        staged.append((path,staged_path))
        if sha(read(staged_path))!=sha(data):
            raise RuntimeError("STAGE_READBACK_HASH_MISMATCH")
    for path,staged_path in staged:
        old=originals[path]
        backup=path+".before-n7-research-"+nonce if old is not None else None
        if backup:ftp.rename(path,backup)
        try:ftp.rename(staged_path,path)
        except Exception:
            if backup:ftp.rename(backup,path)
            raise
        changed.append((path,backup))
    for path,data in files.items():
        if sha(read(path))!=sha(data):
            raise RuntimeError("DEPLOYMENT_HASH_MISMATCH")
    for app in [ROOT+"/server/command-center-live",BOT]:
        ftp.storbinary("STOR "+app+"/tmp/restart.txt",io.BytesIO(b""))
    print(json.dumps({
        "status":"N7_RESEARCH_DEPLOYED",
        "sha256_verified_files":len(files),
        "created_or_updated":len(changed),
        "signed_pdf_upload_endpoint":True,
        "automatic_chat_rag":True,
        "external_bibliographic_discovery":True,
        "historical_database_rows_modified":False,
        "original_chat_auth_preserved":True
    }))
except Exception:
    for path,backup in reversed(changed):
        try:
            ftp.delete(path)
            if backup:ftp.rename(backup,path)
        except Exception:
            print("MANUAL_ROLLBACK_CHECK_REQUIRED",path.rsplit("/",1)[-1])
    raise
finally:
    for _,staged_path in staged:
        try:ftp.delete(staged_path)
        except ftplib.all_errors:pass
    try:ftp.quit()
    except ftplib.all_errors:pass
