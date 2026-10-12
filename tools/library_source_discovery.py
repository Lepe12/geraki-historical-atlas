#!/usr/bin/env python3
"""Library-first autonomous source discovery. Metadata only; never marks a claim verified."""
import json,urllib.parse,urllib.request,datetime,pathlib,time
OUT=pathlib.Path("library_discovery");OUT.mkdir(exist_ok=True)
queries=[
 '(title:("Archipel") OR description:("Archipel")) AND year:[1600 TO 1800]',
 '(title:("Arcipelago") OR description:("Arcipelago")) AND year:[1600 TO 1800]',
 '(title:("Archipelago") OR description:("Archipelago")) AND year:[1600 TO 1800]',
 '(title:("Archipelagus") OR description:("Archipelagus")) AND year:[1600 TO 1800]',
 '(title:("Thermia") OR description:("Thermia")) AND year:[1600 TO 1800]',
 '(title:("Termia") OR description:("Termia")) AND year:[1600 TO 1800]',
 '(title:("Kythnos") OR description:("Kythnos")) AND year:[1600 TO 1900]',
 '(title:("Cyclades") OR description:("Cyclades")) AND year:[1600 TO 1900]',
 '(title:("Crevelier") OR title:("Creveliers") OR description:("Crevelier") OR description:("Creveliers")) AND year:[1600 TO 1800]'
]
items=[]; errors=[]
for q in queries:
 try:
  params=urllib.parse.urlencode({"q":q,"fl[]":["identifier","title","year","creator","date","collection","description","language","subject"],"rows":30,"output":"json"},doseq=True)
  req=urllib.request.Request("https://archive.org/advancedsearch.php?"+params,headers={"User-Agent":"Piratecartography-Research/1.0 (scholarly source discovery)"})
  with urllib.request.urlopen(req,timeout=35) as f: data=json.load(f)
  for d in data.get("response",{}).get("docs",[]):
   items.append({"query":q,"repository":"Internet Archive digital library","metadata":d,"original_inspected":False,"verified":False})
 except Exception as exc: errors.append({"query":q,"error":str(exc)})
 time.sleep(1)

# Keep Archipel/Arcipelago as valid historical terms; rank rather than discard.
AEGEAN=("thermia","termia","kythnos","cyclad","aege","egée","egeo","archipel de la mer mediterran","middelantsche zee","naxos","paros","mycono","andros","santorini","crevel")\nNOISE=("bed curtain","bedspread","pillow","embroidery","clevelandart","legendary greece","ancient history")
for item in items:
 textblob=json.dumps(item["metadata"],ensure_ascii=False).lower()
 item["aegean_relevance_score"]=sum(1 for t in AEGEAN if t in textblob)
 noise=any(t in textblob for t in NOISE)\n item["routing"]="REJECT_NOISE" if noise else ("CITATION_CHASE_PRIORITY" if item["aegean_relevance_score"]>=1 else "BROAD_ARCHIPEL_REVIEW")

seen=set(); unique=[]
for item in items:
 k=item["metadata"].get("identifier")
 if k and k not in seen:seen.add(k);unique.append(item)
report={"generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"purpose":"Kythnos/Thermia 1672 Crevelier library/archival source discovery","status":"METADATA_LEADS_ONLY","records":unique,"errors":errors,"next_action":"Citation Chase: inspect catalogued original works and exact pages; no inference of raid from metadata.","verification_status":"NEEDS_EVIDENCE"}
(OUT/"catalogue_candidates.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("candidates",len(unique),"errors",len(errors))
