"""Native PARES search with pagination and strict Archivo General de Simancas verification."""
import argparse,json,re,urllib.parse,urllib.request,http.cookiejar
from html import unescape
from pares_simancas_verify import verify
HOST="https://pares.cultura.gob.es"
FIRST="/ParesBusquedas20/catalogo/find?"
def fetch(opener,url):
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; GERAKI-Research/1.0)","Accept":"text/html"})
    with opener.open(req,timeout=35) as r:return r.read(4000000).decode("iso-8859-15","replace")
def ids(html):
    out=[]
    for m in re.finditer(r"/catalogo/description/(\d+)",unescape(html),re.I):
        if m.group(1) not in out:out.append(m.group(1))
    return out
def discover(term,limit=5,max_pages=12):
    jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    seed=HOST+FIRST+urllib.parse.urlencode({"texto":term});fetch(opener,seed)
    first=HOST+FIRST+urllib.parse.urlencode({"texto":term,"idA":"2"});html=fetch(opener,first)
    # Diagnose archive-facet controls before record verification.
    facet_context=[]
    for token in ("Archivo General de Simancas","Archivos","archivo","facet","filtro"):
        for m in list(re.finditer(re.escape(token),html,re.I))[:8]:
            facet_context.append(re.sub(r"\\s+"," ",html[max(0,m.start()-300):m.end()+500]))
    print("PARES_ARCHIVE_FACET_DIAGNOSTIC",json.dumps(facet_context,ensure_ascii=False))
    pages=[html];pager=re.search(r'href="([^"]*SearchController\.do[^"]*d-2677838-p=2[^"]*)"',html,re.I)
    page2=unescape(pager.group(1)) if pager else None
    verified=[];seen=[];errors=[]
    for page in range(1,max_pages+1):
        if page>1:
            if not page2:break
            pageurl=urllib.parse.urljoin(HOST,re.sub(r'd-2677838-p=2',f'd-2677838-p={page}',page2))
            try:html=fetch(opener,pageurl)
            except Exception as e:errors.append({"page":page,"error":str(e)});break
        cands=ids(html)
        for rid in cands:
            if rid in seen:continue
            seen.append(rid)
            try:
                rec=verify(rid)
                if rec["status"]=="RECORD_VERIFIED":
                    rec["discovered_on_page"]=page;verified.append(rec)
                    if len(verified)>=limit:break
            except Exception as e:errors.append({"record_id":rid,"error":str(e)})
        if len(verified)>=limit:break
    return {"term":term,"search_url":first,"discovery_method":"native_PARES_catalogo_find_paginated","pages_checked":page,"candidates_checked":len(seen),"verified_count":len(verified),"records":verified,"errors":errors[:10],"native_PARES_search_implemented":True,"archive_filter":"idA=2 (Archivo General de Simancas)","archive_gate":"Archivo General de Simancas + ES.47161.AGS + signatura","scope":"catalogue metadata only; originals not inspected"}
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("term");p.add_argument("--limit",type=int,default=3);p.add_argument("--max-pages",type=int,default=12)
    a=p.parse_args();r=discover(a.term,a.limit,a.max_pages);print(json.dumps(r,ensure_ascii=False,indent=2))
    if not r["records"]:raise SystemExit("No Simancas records verified within page limit")
