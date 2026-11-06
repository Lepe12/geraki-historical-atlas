#!/usr/bin/env python3
"""Ingest two rights-verified historical *secondary* works from Project Gutenberg.
All sources have independent bibliographic provenance and actual HTML page markers.
No unpublished user sources are sent to or fetched from GitHub.
"""
import ftplib,hashlib,hmac,json,os,re,socket,ssl,time,urllib.request,urllib.error
from bs4 import BeautifulSoup

BOOKS=[
 {"id":"22169","title":"The Story of the Barbary Corsairs",
  "author":"Stanley Lane-Poole; J. D. Jerrold Kelley","year":"1890",
  "url":"https://www.gutenberg.org/cache/epub/22169/pg22169-images.html"},
 {"id":"13689","title":"Sea-Wolves of the Mediterranean",
  "author":"E. Hamilton Currey","year":"1910",
  "url":"https://www.gutenberg.org/cache/epub/13689/pg13689-images.html"}
]
def download(url):
    request=urllib.request.Request(url,headers={"User-Agent":"N7 Historical Library/1.0 (non-commercial bibliographic research)"})
    with urllib.request.urlopen(request,timeout=45) as result:
        raw=result.read(5_000_000)
        if len(raw)<15000 or len(raw)>=5_000_000:raise RuntimeError("UNEXPECTED_BOOK_SIZE")
        return raw
def pages_from_html(blob):
    soup=BeautifulSoup(blob,"html.parser")
    body=soup.body or soup
    for tag in body.select("script,style,svg,nav"):
        tag.decompose()
    markers=body.select(".pagenum")
    if len(markers)<40:raise RuntimeError("INSUFFICIENT_PRINTED_PAGE_MARKERS")
    count=0
    for marker in markers:
        label=marker.get_text(" ",strip=True)
        clean=re.sub(r"(?i)\b(pg|page|p)\.?\s*","",label).strip(" []\u00a0.")
        m=re.fullmatch(r"([0-9]{1,4}|[ivxlcdmIVXLCDM]{1,9})",clean)
        if not m:marker.decompose();continue
        count+=1
        marker.replace_with(" N7PRINTPAGE"+str(count)+"LABEL"+m.group(1)+"END ")
    raw=body.get_text(" ",strip=True)
    tokens=re.split(r"N7PRINTPAGE([0-9]+)LABEL([0-9ivxlcdmIVXLCDM]+)END",raw)
    if len(tokens)<90:raise RuntimeError("NO_EXTRACTABLE_PAGES")
    pages=[]
    for i in range(1,len(tokens)-2,3):
        if i+2>=len(tokens):break
        number=int(tokens[i])
        label=tokens[i+1]
        content=" ".join(tokens[i+2].split())
        if not content:continue
        # Explicit printed-page marker, not an inferred number; source scan_index is the sequential segment.
        if len(content)>55000:raise RuntimeError("PAGE_EXCEEDS_IMPORT_LIMIT")
        pages.append({"scan_index":number,"printed_page":label,"text":content,"ocr_status":"UNREVIEWED"})
    if len(pages)<40:raise RuntimeError("TOO_FEW_TEXT_PAGES")
    if len({p["scan_index"] for p in pages})!=len(pages):raise RuntimeError("DUPLICATE_PAGE_INDEX")
    return pages
def ftp_key():
    host=os.environ["PCT_FTPS_HOST"];port=int(os.getenv("PCT_FTPS_PORT","21"))
    alias=os.getenv("PCT_FTPS_TLS_SERVER_NAME","").strip()
    if alias:
        ips={x[4][0] for x in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
        names={x[4][0] for x in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
        if not ips.intersection(names):raise RuntimeError("UNVERIFIED_TLS_ALIAS")
    ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
    ftp.connect(host,port)
    if alias:ftp.host=alias
    ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
    ftp.prot_p()
    chunks=[]
    try:ftp.retrbinary("RETR /piratecartography-gateway/server/command-center-live/.n7-library-bridge-key",chunks.append)
    finally:ftp.quit()
    key=b"".join(chunks)
    if len(key)!=32:raise RuntimeError("MISSING_PRIVATE_SIGNING_KEY")
    return key
ENDPOINT="https://pct-live.piratecartography.com/pct-api/live/n7/library/"
def signed(key,kind,obj):
    body=json.dumps(obj,ensure_ascii=False,separators=(",",":")).encode("utf-8")
    if len(body)>600000:raise RuntimeError("BATCH_TOO_LARGE")
    timestamp=str(int(time.time()))
    mac=hmac.new(key,timestamp.encode()+b"."+body,hashlib.sha256).hexdigest()
    request=urllib.request.Request(ENDPOINT+kind,data=body,method="POST",headers={
       "Content-Type":"application/json","X-N7-Library-Ts":timestamp,
       "X-N7-Library-Signature":mac,"User-Agent":"N7-Ingest/1.0"})
    try:
        with urllib.request.urlopen(request,timeout=35) as response:
            result=json.loads(response.read(500000))
            return response.status,result
    except urllib.error.HTTPError as error:
        # Never print downloaded book text or signed request values.
        raise RuntimeError("SIGNED_"+kind.upper().replace("-","_")+"_HTTP_"+str(error.code)) from None
def main():
    key=ftp_key()
    imported=0
    for book in BOOKS:
        pages=pages_from_html(download(book["url"]))
        digest=hashlib.sha256(("gutenberg:"+book["id"]).encode()).hexdigest()
        print(json.dumps({"book":book["id"],"verified_html_page_markers":len(pages),
                          "first_printed_page":pages[0]["printed_page"],"last_printed_page":pages[-1]["printed_page"]}))
        for offset in range(0,len(pages),12):
            batch={"gutenberg_id":book["id"],"source_id":digest,
              "source_uri":"https://www.gutenberg.org/ebooks/"+book["id"],
              "title":book["title"],"author":book["author"],"publication_year":book["year"],
              "pages":pages[offset:offset+12]}
            http,reply=signed(key,"import-signed",batch)
            if http!=201 or reply.get("status")!="IMPORTED" or reply.get("source_id")!=digest:
                raise RuntimeError("DATABASE_IMPORT_NOT_CONFIRMED")
            imported+=int(reply.get("page_count",0))
        print(json.dumps({"book":book["id"],"imported_pages":len(pages),"status":"DB_COMMITTED"}))
    http,reply=signed(key,"search",{"query":"Barbarossa"})
    total=reply.get("page_count"); sources=reply.get("source_count")
    hits=reply.get("matches")
    if http!=200 or not isinstance(sources,int) or sources<2 or not isinstance(total,int) or total<imported or not isinstance(hits,list) or not hits:
        raise RuntimeError("END_TO_END_SEARCH_NOT_VERIFIED")
    print(json.dumps({"status":"VERIFIED","mariadb_sources":sources,"mariadb_pages":total,"books_imported":2,
                      "search":"Barbarossa","matches_found":len(hits),"source_text_logged":False}))
if __name__=="__main__":main()
