#!/usr/bin/env python3
"""General library-first source discovery driven entirely by the active research request."""
import json,urllib.parse,urllib.request,datetime,pathlib,time,re,sys
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from request_context import load_request

rf,req,ctx=load_request()
OUT=pathlib.Path("library_discovery");OUT.mkdir(exist_ok=True)
terms=[]
for x in [ctx["target"]]+ctx["aliases"]:
    x=str(x).strip()
    if x and x.casefold() not in [t.casefold() for t in terms]:terms.append(x)
# Bound network load while preserving modern and historical variants.
terms=terms[:4]
years=[int(x) for x in re.findall(r"\b(?:1[0-9]{3}|20[0-9]{2})\b",ctx["date_range"])]
lo,hi=(min(years),max(years)) if years else (0,9999)
queries=[]
for t in terms:
    escaped=t.replace('"','')
    yr=f" AND year:[{lo} TO {hi}]" if years else ""
    queries.append(f'(title:("{escaped}") OR description:("{escaped}") OR subject:("{escaped}")){yr}')
items=[];errors=[]
for q in queries:
    try:
        params=urllib.parse.urlencode({"q":q,"fl[]":["identifier","title","year","creator","date","collection","description","language","subject"],"rows":30,"output":"json"},doseq=True)
        request=urllib.request.Request("https://archive.org/advancedsearch.php?"+params,headers={"User-Agent":"Piratecartography-Research/3.0 (scholarly source discovery)"})
        with urllib.request.urlopen(request,timeout=35) as f:data=json.load(f)
        for d in data.get("response",{}).get("docs",[]):
            items.append({"query":q,"repository":"Internet Archive","discovery_repository":"Internet Archive","metadata":d,"original_inspected":False,"verified":False})
    except Exception as exc: errors.append({"query":q,"error":f"{type(exc).__name__}: {exc}"})
    time.sleep(.2)

needles=[t.casefold() for t in terms]
for item in items:
    blob=json.dumps(item["metadata"],ensure_ascii=False).casefold()
    score=sum(1 for t in needles if t and t in blob)
    item["target_relevance_score"]=score
    item["routing"]="CITATION_CHASE_PRIORITY" if score else "BROAD_CONTEXT_REVIEW"
seen=set();unique=[]
for item in items:
    k=item["metadata"].get("identifier")
    if k and k not in seen:seen.add(k);unique.append(item)
report={"schema":"pct-library-discovery-v2","generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"request_file":rf.name,"target":ctx["target"],"aliases":ctx["aliases"],"date_range":ctx["date_range"],"purpose":ctx["purpose"],"status":"METADATA_LEADS_ONLY","records":unique,"errors":errors,"next_action":"Citation Chase: locate/acquire the digitized original, map exact pages, inspect originals, then test source genealogy and corroboration.","verification_status":"NEEDS_EVIDENCE"}
(OUT/"catalogue_candidates.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("GENERAL LIBRARY DISCOVERY",ctx["target"],"queries",len(queries),"candidates",len(unique),"errors",len(errors))
