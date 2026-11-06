#!/usr/bin/env python3
"""Read-only N7 character production probe, no user content or secrets in logs."""
import ftplib,hashlib,json,os,socket,ssl
host=os.environ["PCT_FTPS_HOST"];port=int(os.getenv("PCT_FTPS_PORT","21"));alias=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
if alias:
    ips={x[4][0] for x in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    others={x[4][0] for x in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
    assert ips.intersection(others),"TLS_ALIAS_UNVERIFIED"
ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context());ftp.connect(host,port)
if alias:ftp.host=alias
ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"]);ftp.prot_p()
root="/bot.piratecartography.com/n7-app/public"
results={}
try:
    for name in ["index.html","app.js","n7-presence.js","n7-presence.css","assets/n7/n7-agent-base.webp","assets/n7/n7-agent-eyes.webp"]:
        parts=[];size=[0]
        try:
            def append(data):
                size[0]+=len(data)
                if size[0]<=200000:parts.append(data)
            ftp.retrbinary("RETR "+root+"/"+name,append)
            payload=b"".join(parts)
            results[name]={"exists":True,"bytes":size[0]}
            if name=="index.html":
                results[name].update({"n7_presence_script":b"n7-presence.js" in payload,
                    "n7_presence_css":b"n7-presence.css" in payload,
                    "n7_branding":b"N7" in payload,
                    "old_generic_branding":b"INDEPENDENT" in payload})
            if name=="app.js":
                results[name].update({"presence_mount":b"N7Presence" in payload})
            if name=="n7-presence.js":
                results[name].update({"draws_character":b"canvas" in payload,
                    "references_base_layer":b"n7-agent-base.webp" in payload,
                    "references_eyes_layer":b"n7-agent-eyes.webp" in payload})
            if name=="n7-presence.css":
                results[name].update({"hides_when_assets_missing":b".n7-presence.n7-assets-missing{display:none}" in payload})
        except ftplib.error_perm as error:
            if str(error).startswith("550"):
                results[name]={"exists":False}
            else:raise
finally:ftp.quit()
print(json.dumps({"status":"N7_ART_AUDIT","assets":results},ensure_ascii=False))
