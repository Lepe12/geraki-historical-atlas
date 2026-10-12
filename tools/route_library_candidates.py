#!/usr/bin/env python3
"""Route strong catalogue candidates into Citation Chase acquisition requests."""
import json,pathlib,re,datetime
src=pathlib.Path("library_discovery/catalogue_candidates.json")
if not src.exists(): raise SystemExit("missing catalogue_candidates.json")
d=json.loads(src.read_text(encoding="utf-8"))
out=pathlib.Path("citation_chase_candidates");out.mkdir(exist_ok=True)
selected=[]
for x in d.get("records",[]):
 m=x.get("metadata",{}); title=str(m.get("title","")); year=m.get("year")
 blob=json.dumps(m,ensure_ascii=False).lower()
 if x.get("routing")!="CITATION_CHASE_PRIORITY": continue
 if not any(k in blob for k in ("middelantsche zee","description exacte des isles de l'archipel","thermia","termia","kythnos","crevel")): continue
 selected.append({"identifier":m.get("identifier"),"title":title,"year":year,"repository":x.get("repository"),"verification_status":"NEEDS_EVIDENCE","next_stage":"LOCATE_DIGITAL_OBJECT_AND_FULLTEXT_OR_IIIF"})
report={"generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"protocol":"PCT-AUTO-ROUTER-v1","selected":selected,"rule":"Catalogue metadata is not evidence; inspect digitized original before claim use."}
(out/"routed_candidates.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("routed",len(selected))
