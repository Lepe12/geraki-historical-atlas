#!/usr/bin/env python3
"""Authenticated production N7 library diagnostic; reports counts, never excerpts or secrets."""
import ftplib,hashlib,hmac,json,os,socket,ssl,time,urllib.request,urllib.error
ROOT="/piratecartography-gateway/server/command-center-live"
host=os.environ["PCT_FTPS_HOST"]
port=int(os.getenv("PCT_FTPS_PORT","21"))
alias=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
if alias:
    actual={x[4][0] for x in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    target={x[4][0] for x in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
    assert actual.intersection(target),"TLS_NAME_UNVERIFIED"
ftp=ftplib.FTP_TLS(timeout=25,context=ssl.create_default_context())
ftp.connect(host,port)
if alias:ftp.host=alias
ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
ftp.prot_p()
chunks=[]
try:
    ftp.retrbinary("RETR "+ROOT+"/.n7-library-bridge-key",chunks.append)
finally:
    ftp.quit()
key=b"".join(chunks)
if len(key)!=32:raise RuntimeError("BRIDGE_KEY_MISSING")
ts=str(int(time.time()))
body=json.dumps({"query":"Λάντζας"},ensure_ascii=False,separators=(",",":")).encode("utf-8")
signature=hmac.new(key,ts.encode()+b"."+body,hashlib.sha256).hexdigest()
url="https://pct-live.piratecartography.com/pct-api/live/n7/library/search"
req=urllib.request.Request(url,data=body,method="POST",headers={
    "Content-Type":"application/json","X-N7-Library-Ts":ts,"X-N7-Library-Signature":signature})
try:
    with urllib.request.urlopen(req,timeout=20) as response:
        status=response.status
        raw=response.read(1_000_000)
except urllib.error.HTTPError as e:
    print(json.dumps({"status":"UPSTREAM_ERROR","http_status":e.code}))
    raise SystemExit(1)
try:answer=json.loads(raw)
except (ValueError,UnicodeError):raise RuntimeError("INVALID_REPLY")
count=answer.get("source_count")
pages=answer.get("page_count")
matches=answer.get("matches")
if status!=200 or answer.get("schema")!="n7-library-read-v1" or not isinstance(matches,list):
    print(json.dumps({"status":"UNEXPECTED_REPLY","http_status":status}));raise SystemExit(1)
if type(count) is not int or type(pages) is not int or count<0 or pages<0:
    print(json.dumps({"status":"COUNTS_NOT_DEPLOYED","http_status":status}));raise SystemExit(1)
print(json.dumps({"status":"PASS","http_status":status,"source_count":count,"page_count":pages,
     "query":"Λάντζας","match_count":len(matches),"any_source_excerpts_logged":False},ensure_ascii=False))
