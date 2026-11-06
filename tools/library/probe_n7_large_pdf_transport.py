#!/usr/bin/env python3
"""Signed >25MiB production transport probe; deliberately wrong digest = NO DB writes."""
import ftplib,hashlib,hmac,json,os,socket,ssl,time,urllib.request,urllib.error
host=os.environ["PCT_FTPS_HOST"];port=int(os.getenv("PCT_FTPS_PORT","21"))
alias=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
if alias:
    ip={a[4][0] for a in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    alt={a[4][0] for a in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
    if not ip.intersection(alt):raise RuntimeError("TLS_NAME_MISMATCH")
ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
ftp.connect(host,port)
if alias:ftp.host=alias
ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"]);ftp.prot_p()
parts=[]
try:ftp.retrbinary("RETR /piratecartography-gateway/server/command-center-live/.n7-library-bridge-key",parts.append)
finally:ftp.quit()
key=b"".join(parts)
if len(key)!=32:raise RuntimeError("LIBRARY_SIGNING_KEY_MISSING")
declared=hashlib.sha256(b"N7-invalid-hash-probe-only").hexdigest()
ts=str(int(time.time()))
sig=hmac.new(key,ts.encode()+b"."+declared.encode(),hashlib.sha256).hexdigest()
size=27*1024*1024+17
data=b"%PDF-"+b"0"*(size-5)
req=urllib.request.Request(
 "https://pct-live.piratecartography.com/pct-api/live/n7/library/upload-signed",
 data=data,method="POST",
 headers={"Content-Type":"application/pdf","X-File-Name":"n7-transport-validation-only.pdf",
 "X-N7-Library-Ts":ts,"X-N7-Library-Signature":sig,
 "X-N7-Library-Digest":declared,
 "User-Agent":"N7-Authenticated-27MB-Transport-Probe"})
try:
    with urllib.request.urlopen(req,timeout=130) as r:
        response_code=r.status;answer=json.loads(r.read(500))
except urllib.error.HTTPError as e:
    response_code=e.code
    try:answer=json.loads(e.read(500))
    except ValueError:answer={}
if response_code!=400 or answer.get("error")!="pdf_digest_mismatch":
    raise RuntimeError("LARGE_PDF_TRANSPORT_NOT_VERIFIED_HTTP_"+str(response_code)+"_"+str(answer.get("error","unexpected")))
print(json.dumps({"status":"VERIFIED","transported_bytes":size,"old_25mb_limit_exceeded":True,
"server_rejected_deliberately_wrong_checksum":True,"database_import_attempted":False,"http_status":400}))
