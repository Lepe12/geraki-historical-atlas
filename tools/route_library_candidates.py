#!/usr/bin/env python3
"""Route request-relevant generic library candidates into Citation Chase."""
import json,pathlib,datetime
src=pathlib.Path("library_discovery/catalogue_candidates.json")
if not src.exists(): raise SystemExit("missing catalogue_candidates.json")
d=json.loads(src.read_text(encoding="utf-8"));out=pathlib.Path("citation_chase_candidates");out.mkdir(exist_ok=True)
selected=[]
for x in d.get("records",[]):
    if x.get("routing")!="CITATION_CHASE_PRIORITY":continue
    m=x.get("metadata",{})
    selected.append({
      "identifier":m.get("identifier"),"title":m.get("title"),"year":m.get("year") or m.get("date"),
      "creator":m.get("creator"),"repository":x.get("repository","Internet Archive"),
      "discovery_repository":x.get("discovery_repository",x.get("repository","Internet Archive")),
      "discovery_lane":"generic_library_fallback","connector_status":"EXECUTED",
      "url":("https://archive.org/details/"+str(m.get("identifier"))) if m.get("identifier") else None,
      "acquisition_route":"INTERNET_ARCHIVE","verification_status":"NEEDS_EVIDENCE",
      "next_stage":"LOCATE_DIGITAL_OBJECT_AND_FULLTEXT_OR_IIIF"
    })
report={"schema":"pct-auto-router-v2","generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"request_file":d.get("request_file"),"selected":selected,"rule":"Selection is request-driven. Catalogue metadata is not evidence; inspect digitized original before claim use."}
(out/"routed_candidates.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("generic routed",len(selected))
