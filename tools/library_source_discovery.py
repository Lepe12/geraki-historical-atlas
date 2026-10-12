#!/usr/bin/env python3
"""Library-first autonomous source discovery. Metadata only; never marks a claim verified."""
import json,urllib.parse,urllib.request,datetime,pathlib,time
OUT=pathlib.Path("library_discovery");OUT.mkdir(exist_ok=True)
queries=[
 'title:("Archipel") AND year:[1600 TO 1800]',
 'title:("Naxos") AND year:[1600 TO 1900]',
 'title:("Kythnos") AND year:[1600 TO 1900]',
 'title:("Cyclades") AND year:[1600 TO 1900]',
 'title:("pirates") AND year:[1600 TO 1800]'
]
items=[]; errors=[]
for q in queries:
 try:
  params=urllib.parse.urlencode({"q":q,"fl[]":["identifier","title","year","creator","date","collection"],"rows":30,"output":"json"})
  req=urllib.request.Request("https://archive.org/advancedsearch.php?"+params,headers={"User-Agent":"Piratecartography-Research/1.0 (scholarly source discovery)"})
  with urllib.request.urlopen(req,timeout=35) as f: data=json.load(f)
  for d in data.get("response",{}).get("docs",[]):
   items.append({"query":q,"repository":"Internet Archive digital library","metadata":d,"original_inspected":False,"verified":False})
 except Exception as exc: errors.append({"query":q,"error":str(exc)})
 time.sleep(1)
seen=set(); unique=[]
for item in items:
 k=item["metadata"].get("identifier")
 if k and k not in seen:seen.add(k);unique.append(item)
report={"generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"purpose":"Kythnos/Thermia 1672 Crevelier library/archival source discovery","status":"METADATA_LEADS_ONLY","records":unique,"errors":errors,"next_action":"Citation Chase: inspect catalogued original works and exact pages; no inference of raid from metadata.","verification_status":"NEEDS_EVIDENCE"}
(OUT/"catalogue_candidates.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("candidates",len(unique),"errors",len(errors))
