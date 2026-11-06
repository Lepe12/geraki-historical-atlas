#!/usr/bin/env python3
"""Deploy only read-only N7 search classifier PHP. Atomic FTPS, backup, SHA-256 check."""
import ftplib,hashlib,io,json,os,socket,ssl,uuid
from pathlib import Path
source=Path("tools/library/n7_library.php").read_bytes()
assert b"n7isReferenceIndexPage" in source
host=os.environ["PCT_FTPS_HOST"];port=int(os.getenv("PCT_FTPS_PORT","21"))
alias=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
if alias:
    ips={i[4][0] for i in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    alt={i[4][0] for i in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
    assert ips.intersection(alt),"FTPS_TLS_IDENTITY_MISMATCH"
ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
ftp.connect(host,port)
if alias:ftp.host=alias
ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
ftp.prot_p()
path="/piratecartography-gateway/tools/library/n7_library.php"
nonce=uuid.uuid4().hex[:12]
tmp=path+".index-stage-"+nonce
backup=path+".before-index-filter-"+nonce
def fetch(p):
    chunks=[]
    ftp.retrbinary("RETR "+p,chunks.append)
    return b"".join(chunks)
def sha(raw):return hashlib.sha256(raw).hexdigest()
renamed=False;installed=False
try:
    old=fetch(path)
    assert b"function n7search" in old and b"pc_library_pages" in old,"UNEXPECTED_LIBRARY"
    assert b"n7isReferenceIndexPage" not in old or old==source,"EXISTING_INDEX_FILTER_VARIANT"
    if old==source:
        print(json.dumps({"status":"ALREADY_DEPLOYED","sha256":sha(source)}))
    else:
        ftp.storbinary("STOR "+tmp,io.BytesIO(source))
        assert sha(fetch(tmp))==sha(source),"STAGED_HASH_MISMATCH"
        ftp.rename(path,backup);renamed=True
        ftp.rename(tmp,path);installed=True
        assert sha(fetch(path))==sha(source),"READBACK_FAILED"
        print(json.dumps({"status":"DEPLOYED","updated_file":"n7_library.php","sha256":sha(source),"database_rows_changed":False}))
except Exception:
    if renamed:
        try:
            if installed:ftp.delete(path)
            ftp.rename(backup,path)
        except Exception:print("MANUAL_ROLLBACK_CHECK_REQUIRED")
    raise
finally:
    try:ftp.delete(tmp)
    except ftplib.all_errors:pass
    try:ftp.quit()
    except ftplib.all_errors:pass
