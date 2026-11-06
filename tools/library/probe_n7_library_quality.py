#!/usr/bin/env python3
"""Production check for historical book ranking and signed full-page reading. Do not log source text."""
import ftplib,hashlib,hmac,json,os,socket,ssl,time,urllib.request,urllib.error
host=os.environ["PCT_FTPS_HOST"];port=int(os.getenv("PCT_FTPS_PORT","21"));alias=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
if alias:
    a={x[4][0] for x in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    b={x[4][0] for x in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
    assert a.intersection(b),"TLS_MISMATCH"
ftp=ftplib.FTP_TLS(timeout=25,context=ssl.create_default_context());ftp.connect(host,port)
if alias:ftp.host=alias
ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"]);ftp.prot_p()
parts=[]
try:ftp.retrbinary("RETR /piratecartography-gateway/server/command-center-live/.n7-library-bridge-key",parts.append)
finally:ftp.quit()
key=b"".join(parts)
assert len(key)==32
def request(endpoint,body):
    raw=json.dumps(body,ensure_ascii=False,separators=(",",":")).encode()
    ts=str(int(time.time()))
    sig=hmac.new(key,ts.encode()+b"."+raw,hashlib.sha256).hexdigest()
    req=urllib.request.Request("https://pct-live.piratecartography.com/pct-api/live/n7/library/"+endpoint,data=raw,method="POST",headers={"Content-Type":"application/json","X-N7-Library-Ts":ts,"X-N7-Library-Signature":sig})
    with urllib.request.urlopen(req,timeout=25) as resp:
        assert resp.status==200
        return json.loads(resp.read(1000000))
results=request("search",{"query":"Barbarossa"})
matches=results.get("matches",[])
assert results.get("schema")=="n7-library-read-v1" and len(matches)>=10
assert results.get("source_count",0)>=2 and results.get("page_count",0)>=646
assert all(str(m.get("printed_page","")).isdigit() for m in matches)
assert all(m.get("source_type")=="SECONDARY_HISTORIOGRAPHY" for m in matches)
assert not any(m.get("title")=="Sea-Wolves of the Mediterranean" and str(m.get("printed_page")) in {"390","392"} for m in matches),"INDEX_PAGES_STILL_RANKED"
assert all(m.get("relevance_score",0)>0 for m in matches)
assert all("excerpt" in m and "source_uri" in m for m in matches)
assert all(matches[i]["relevance_score"]>=matches[i+1]["relevance_score"] for i in range(len(matches)-1))
first=matches[0]
page=request("page",{"source_id":first["source_id"],"scan_index":int(first["scan_index"])})
assert page.get("schema")=="n7-library-page-v1"
pg=page.get("page",{})
assert pg.get("printed_page")==first.get("printed_page")
assert isinstance(pg.get("ocr_text"),str) and len(pg["ocr_text"])>=len(first.get("excerpt",""))-15
assert pg.get("source_uri","").startswith("https://www.gutenberg.org/ebooks/")
print(json.dumps({"status":"VERIFIED","sources":results["source_count"],"pages":results["page_count"],"ranked_hits":len(matches),"full_page_length":len(pg["ocr_text"]),"full_page_printed_label":pg["printed_page"],"book_text_exposed":False}))
