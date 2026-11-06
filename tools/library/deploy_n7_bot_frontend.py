#!/usr/bin/env python3
"""Deploy reviewed N7 bot library assets over the existing verified FTPS channel."""
import ftplib, hashlib, io, json, os, ssl
from pathlib import Path
root="/bot.piratecartography.com/n7-app"
names=["server.js","public/index.html","public/historical-library.js"]
payload={"public/historical-library.js":Path("atlas/tools/library/n7-bot-browser.js").read_bytes()}
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
server=get("server.js")
html=get("public/index.html")
print(json.dumps({"preflight":{"server_old":server.count(b"\x27/app.js\x27:\x27app.js\x27,"),"server_new":server.count(b"historical-library.js"),"html_old":html.count(b'<script src="/app.js" defer></script>'),"html_new":html.count(b"historical-library.js"),"server_csp":server.count(b"connect-src \x27self\x27;")}}))
import re
print(json.dumps({"structure":{
"server_assets":[line[:220] for line in server.decode("utf-8","replace").splitlines() if "app.js" in line or "historical-library" in line][:6],
"html_scripts":re.findall(r'<script[^>]*src=["\\x27]([^"\\x27]+)',html.decode("utf-8","replace"))[:12],
"html_title":(re.search(r'<title>([^<]+)</title>',html.decode("utf-8","replace")) or [None,""])[1][:100]
}}))
assert server.count(b"\x27/app.js\x27:\x27app.js\x27,")==1
assert html.count(b'<script src="/app.js" defer></script>')==1
payload["server.js"]=server.replace(b"\x27/app.js\x27:\x27app.js\x27,",b"\x27/app.js\x27:\x27app.js\x27,\x27/historical-library.js\x27:\x27historical-library.js\x27,").replace(b"\x27/app.js\x27,\x27/style.css\x27,",b"\x27/app.js\x27,\x27/historical-library.js\x27,\x27/style.css\x27,").replace(b"connect-src \x27self\x27;",b"connect-src \x27self\x27 https://pct-live.piratecartography.com;")
payload["public/index.html"]=html.replace(b'<script src="/app.js" defer></script>',b'<script src="/app.js" defer></script><script src="/historical-library.js" defer></script>')
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
