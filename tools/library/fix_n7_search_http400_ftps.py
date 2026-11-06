#!/usr/bin/env python3
"""Patch only the proven N7 search validator; verified FTPS staged upload and rollback."""
import ftplib,hashlib,io,json,os,socket,ssl,subprocess,tempfile,uuid
host=os.environ["PCT_FTPS_HOST"]
port=int(os.getenv("PCT_FTPS_PORT","21"))
alias=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
if alias:
    a={x[4][0] for x in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    b={x[4][0] for x in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
    if not a.intersection(b):raise RuntimeError("TLS_ALIAS_NOT_VERIFIED")
ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
ftp.connect(host,port)
if alias:ftp.host=alias
ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
ftp.prot_p()
base="/bot.piratecartography.com/n7-app"
old=b'/[\\\\x00-\\\\x1f]/'
new=b'/[\\x00-\\x1f]/'
def get(path):
    output=[]
    ftp.retrbinary("RETR "+path,output.append)
    return b"".join(output)
def sha(x):return hashlib.sha256(x).hexdigest()
nonce=uuid.uuid4().hex[:12]
live=base+"/server.js"
temp=base+"/.n7-search-400-fix-"+nonce+".js"
backup=base+"/server.js.before-search-400-"+nonce
written=False
try:
    assert b"independent-ai-bot" in get(base+"/package.json"),"WRONG_BOT"
    original=get(live)
    assert b"/api/library/search" in original,"WRONG_SEARCH_ROUTE"
    if old not in original:
        if new in original:
            print(json.dumps({"status":"ALREADY_FIXED","verified":True}))
            raise SystemExit(0)
        raise RuntimeError("VALIDATOR_PATTERN_CHANGED")
    if original.count(old)!=1:raise RuntimeError("VALIDATOR_AMBIGUOUS")
    patched=original.replace(old,new)
    with tempfile.TemporaryDirectory() as directory:
        from pathlib import Path
        file=Path(directory)/"server.js";file.write_bytes(patched)
        subprocess.run(["node","--check",str(file)],check=True,capture_output=True,timeout=15)
        test_code=r"const b=/[\x00-\x1f]/;for(const s of ['Barbarossa','Dragut','Doria','Λάντζας'])if(b.test(s))process.exit(1);for(const s of ['a\u0000b','a\nb'])if(!b.test(s))process.exit(2);"
        subprocess.run(["node","-e",test_code],check=True,timeout=10,capture_output=True)
    ftp.storbinary("STOR "+temp,io.BytesIO(patched))
    if sha(get(temp))!=sha(patched):raise RuntimeError("STAGE_HASH_MISMATCH")
    ftp.rename(live,backup)
    try:ftp.rename(temp,live)
    except Exception:
        ftp.rename(backup,live)
        raise
    written=True
    if sha(get(live))!=sha(patched):raise RuntimeError("FINAL_HASH_MISMATCH")
    ftp.storbinary("STOR "+base+"/tmp/restart.txt",io.BytesIO(b""))
    print(json.dumps({"status":"FIX_DEPLOYED","source_sha256":sha(original),"installed_sha256":sha(patched),"single_file_modified":True,"historical_db_untouched":True}))
except Exception:
    if written:
        try:ftp.delete(live);ftp.rename(backup,live);ftp.storbinary("STOR "+base+"/tmp/restart.txt",io.BytesIO(b""))
        except Exception:print("MANUAL_ROLLBACK_CHECK_REQUIRED")
    raise
finally:
    try:ftp.delete(temp)
    except ftplib.all_errors:pass
    try:ftp.quit()
    except ftplib.all_errors:pass
