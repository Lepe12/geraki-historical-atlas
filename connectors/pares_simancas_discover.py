"""Native PARES catalogue discovery with strict Simancas attribution.
Catalogue metadata only; does not imply inspection of archival originals.
"""
import argparse,json,re,urllib.parse,urllib.request
from html import unescape
from pares_simancas_verify import verify

SEARCH="https://pares.cultura.gob.es/ParesBusquedas20/catalogo/find?"
def discover(term,limit=5):
    if not term.strip():raise ValueError("Search term required")
    url=SEARCH+urllib.parse.urlencode({"texto":term})
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; GERAKI-Research/1.0)","Accept":"text/html"})
    with urllib.request.urlopen(req,timeout=35) as r: html=r.read(4000000).decode("iso-8859-15","replace")
    # PARES renders catalogue result links in server-side HTML.
    patterns=[r"/catalogo/description/(\d+)",r"/catalogo/description\?id=(\d+)",r"javascript:[^\"']*description[^\"']*?(\d{5,12})"]
    candidates=[]
    for pattern in patterns:
        for match in re.finditer(pattern,unescape(html),re.I):
            rid=match.group(1)
            if rid not in candidates:candidates.append(rid)
    if not candidates:
        print("PARES_SEARCH_DIAGNOSTIC",json.dumps({"html_size":len(html),"description_occurrences":html.lower().count("description"),"href_samples":re.findall(r'href="([^"]+)"',html,re.I)[-35:]},ensure_ascii=False))
    records=[];errors=[]
    for rid in candidates[:max(limit*5,limit)]:
        try:
            rec=verify(rid)
            if rec["status"]=="RECORD_VERIFIED":records.append(rec)
            if len(records)>=limit:break
        except Exception as exc:errors.append({"record_id":rid,"error":str(exc)})
    return {"term":term,"search_url":url,"discovery_method":"native_PARES_catalogo_find","candidate_count":len(candidates),"verified_count":len(records),"records":records,"errors":errors[:10],"native_PARES_search_implemented":True,"scope":"catalogue search and description verification only"}
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("term");p.add_argument("--limit",type=int,default=5)
    a=p.parse_args();result=discover(a.term,a.limit)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if not result["records"]:raise SystemExit("No newly discovered Simancas records verified")
