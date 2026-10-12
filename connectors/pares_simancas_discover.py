"""Discover PARES candidates via public search index; verify each against live PARES.
Discovery is external-index-assisted, NOT a native PARES catalogue search API.
"""
import argparse, json, re, urllib.parse, urllib.request
from xml.etree import ElementTree as ET
from pares_simancas_verify import verify

BASE="https://www.bing.com/search?format=rss&q="
def discover(term,limit=5):
    query='site:pares.cultura.gob.es/ParesBusquedas20/catalogo/description/ "Archivo General de Simancas" '+term
    url=BASE+urllib.parse.quote(query)
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0","Accept":"application/rss+xml,application/xml"})
    with urllib.request.urlopen(req,timeout=20) as r: xml=r.read(1000000)
    root=ET.fromstring(xml)
    candidates=[]
    for item in root.findall(".//item"):
        link=item.findtext("link") or ""
        match=re.search(r"/catalogo/description/(\d+)",link)
        if match and match.group(1) not in candidates:candidates.append(match.group(1))
    records=[];errors=[]
    for rid in candidates[:limit]:
        try:
            rec=verify(rid)
            if rec["status"]=="RECORD_VERIFIED":records.append(rec)
        except Exception as exc: errors.append({"record_id":rid,"error":str(exc)})
    return {"term":term,"discovery_method":"external_public_search_index_RSS","source_query":query,"candidate_count":len(candidates),"verified_count":len(records),"records":records,"errors":errors,"native_PARES_search_implemented":False}
if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("term");parser.add_argument("--limit",type=int,default=5)
    args=parser.parse_args();result=discover(args.term,args.limit)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if not result["records"]:raise SystemExit("No newly discovered Simancas records verified")
