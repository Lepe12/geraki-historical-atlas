#!/usr/bin/env python3
"""Owner-chosen book import: download each listed https URL and send it to the N7 library.

The owner decides which and how many works (ops_ftps_requests/n7-library-url-import.json);
there is no built-in book list. A PDF is sent as is. A web page (HTML, e.g. a Project
Gutenberg book) is first printed to a PDF. Every upload goes through the existing signed
private route (`upload-signed`), which checks the PDF header and SHA-256 and writes pages.
Only counts and ids are printed, never book text.
"""
import ftplib,hashlib,hmac,json,os,socket,ssl,sys,time,urllib.error,urllib.parse,urllib.request

MAX_BYTES=200*1024*1024
MAX_ITEMS=25
ENDPOINT="https://pct-live.piratecartography.com/pct-api/live/n7/library/upload-signed"
UA="N7 Historical Library/1.0 (owner-requested import)"

def validate_request(obj):
    if not isinstance(obj,dict) or obj.get("schema")!="n7-library-url-import-v1":raise ValueError("BAD_SCHEMA")
    if obj.get("owner_confirms_rights") is not True:raise ValueError("OWNER_RIGHTS_CONFIRMATION_MISSING")
    items=obj.get("items")
    if not isinstance(items,list) or not 1<=len(items)<=MAX_ITEMS:raise ValueError("BAD_ITEM_COUNT")
    out=[]
    for item in items:
        url=str(item.get("url","")) if isinstance(item,dict) else ""
        parts=urllib.parse.urlsplit(url)
        if parts.scheme!="https" or not parts.hostname or parts.username or parts.password:raise ValueError("HTTPS_URL_REQUIRED")
        host=parts.hostname.lower()
        if host in("localhost",) or host.endswith(".local") or host.replace(".","").isdigit():raise ValueError("PUBLIC_HOST_REQUIRED")
        name=str(item.get("filename") or os.path.basename(parts.path) or "source").strip()[:200]
        if not name.lower().endswith(".pdf"):name+=".pdf"
        out.append({"url":url,"filename":name})
    return out

def kind_of(data,content_type=""):
    if data[:5]==b"%PDF-":return "pdf"
    head=data[:2048].lower()
    if b"<html" in head or b"<!doctype html" in head or "html" in content_type.lower():return "html"
    return "unknown"

def download(url):
    request=urllib.request.Request(url,headers={"User-Agent":UA})
    with urllib.request.urlopen(request,timeout=90) as result:
        data=result.read(MAX_BYTES+1)
        if len(data)>MAX_BYTES:raise RuntimeError("SOURCE_TOO_LARGE")
        return data,result.headers.get("Content-Type","")

def html_to_pdf(data,base_url):
    from weasyprint import HTML
    return HTML(string=data.decode("utf-8","replace"),base_url=base_url).write_pdf()

def bridge_key():
    host=os.environ["PCT_FTPS_HOST"];port=int(os.getenv("PCT_FTPS_PORT","21"))
    alias=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
    if alias:
        ips={x[4][0] for x in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
        names={x[4][0] for x in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
        if not ips.intersection(names):raise RuntimeError("UNVERIFIED_TLS_ALIAS")
    ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
    ftp.connect(host,port)
    if alias:ftp.host=alias
    ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"]);ftp.prot_p()
    parts=[]
    try:ftp.retrbinary("RETR /piratecartography-gateway/server/command-center-live/.n7-library-bridge-key",parts.append)
    finally:ftp.quit()
    key=b"".join(parts)
    if len(key)!=32:raise RuntimeError("MISSING_PRIVATE_SIGNING_KEY")
    return key

def upload(key,pdf,filename):
    digest=hashlib.sha256(pdf).hexdigest()
    ts=str(int(time.time()))
    sig=hmac.new(key,ts.encode()+b"."+digest.encode(),hashlib.sha256).hexdigest()
    request=urllib.request.Request(ENDPOINT,data=pdf,method="POST",headers={
        "Content-Type":"application/pdf","X-File-Name":filename,"X-N7-Library-Ts":ts,
        "X-N7-Library-Signature":sig,"X-N7-Library-Digest":digest,"User-Agent":"N7-Ingest/1.0"})
    try:
        with urllib.request.urlopen(request,timeout=175) as r:return r.status,json.loads(r.read(100000))
    except urllib.error.HTTPError as e:
        try:return e.code,json.loads(e.read(2000))
        except ValueError:return e.code,{}

def main(path):
    items=validate_request(json.load(open(path,encoding="utf-8")))
    key=bridge_key()
    failed=0
    for item in items:
        label=item["filename"]
        try:
            data,content_type=download(item["url"])
            kind=kind_of(data,content_type)
            if kind=="html":data=html_to_pdf(data,item["url"])
            elif kind!="pdf":raise RuntimeError("UNSUPPORTED_CONTENT_TYPE")
            if len(data)>MAX_BYTES:raise RuntimeError("PDF_TOO_LARGE")
            status,reply=upload(key,data,label)
            ok=status==201 and reply.get("status")=="DATABASE_COMMITTED"
            print(json.dumps({"file":label,"source_kind":kind,"http":status,"status":reply.get("status"),
                "source_id":reply.get("source_id"),"imported_pages":reply.get("imported_pages"),
                "searchable_pages":reply.get("searchable_pages"),"ocr_pending_pages":reply.get("ocr_pending_pages"),
                "reason":None if ok else reply.get("reason") or reply.get("error")}))
            failed+=0 if ok else 1
        except Exception as error:
            print(json.dumps({"file":label,"status":"FAILED","reason":type(error).__name__+":"+str(error)[:120]}))
            failed+=1
    if failed:sys.exit(1)

if __name__=="__main__":main(sys.argv[1] if len(sys.argv)>1 else "ops_ftps_requests/n7-library-url-import.json")
