#!/usr/bin/env python3
"""Deploy reviewed N7 bot library assets over the existing verified FTPS channel."""
import ftplib, hashlib, io, json, os, ssl
from pathlib import Path
root="/bot.piratecartography.com/n7-app"
base=Path("n7-bot-source")
names=["server.js","public/index.html","public/historical-library.js"]
payload={name:(base/name).read_bytes() for name in names}
ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
ftp.connect(os.environ["PCT_FTPS_HOST"],int(os.getenv("PCT_FTPS_PORT","21")))
if os.getenv("PCT_FTPS_TLS_SERVER_NAME"):ftp.host=os.environ["PCT_FTPS_TLS_SERVER_NAME"]
ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
ftp.prot_p()
ftp.cwd(root)
def get(name):
    chunks=[]
    ftp.retrbinary("RETR "+name,chunks.append)
    return b"".join(chunks)
assert b"independent-ai-bot" in get("package.json"),"Unexpected application"
for name,data in payload.items():
    current=None
    try:current=get(name)
    except ftplib.error_perm:pass
    if current is not None:
        ftp.storbinary("STOR "+name+".n7-library-backup",io.BytesIO(current))
    ftp.storbinary("STOR "+name,io.BytesIO(data))
    assert hashlib.sha256(get(name)).digest()==hashlib.sha256(data).digest(),"Upload check failed"
ftp.storbinary("STOR tmp/restart.txt",io.BytesIO(b""))
print(json.dumps({"status":"DEPLOYED","files":names}))
ftp.quit()
