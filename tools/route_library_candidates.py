#!/usr/bin/env python3
"""Route request-relevant generic library candidates into Citation Chase."""
import json,pathlib,datetime,re,sys
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from request_context import load_request
rf,req,ctx=load_request()
years=[int(y) for y in re.findall(r'\b(?:1[0-9]{3}|20[0-9]{2})\b',ctx['date_range'])]
hi=max(years) if years else 1900

def score(x):
    y=str(x.get('year') or '')
    match=re.search(r'\b(1[0-9]{3}|20[0-9]{2})\b',y)
    yr=int(match.group(1)) if match else None
    title=str(x.get('title') or '').lower()
    sc=10 if x.get('source_lead') else 0
    if yr is not None:
        if 1500<=yr<=hi+200:sc+=8
        elif yr>2000:sc-=10
    if any(t in title for t in ('tv :','skaitv','youtube-','guided walk','cia reading room')):sc-=20
    return sc
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
for lead in req.get("source_leads",[]):
    if isinstance(lead,str):lead={"identifier":lead,"repository":"Internet Archive"}
    if not isinstance(lead,dict):continue
    ident=lead.get("identifier")
    repo=str(lead.get("repository") or "Internet Archive")
    if not ident:continue
    selected.append({"identifier":ident,"title":lead.get("title"),"repository":repo,"discovery_repository":repo,"discovery_lane":"request_source_lead","connector_status":"REQUESTED_SOURCE_LEAD_NOT_YET_VALIDATED","url":lead.get("url") or ("https://archive.org/details/"+str(ident) if repo=="Internet Archive" else None),"acquisition_route":"INTERNET_ARCHIVE" if repo=="Internet Archive" else None,"source_lead":True,"verification_status":"NEEDS_EVIDENCE","next_stage":"ACQUIRE_AND_CHECK_ORIGINAL"})
selected.sort(key=score,reverse=True)
report={"schema":"pct-auto-router-v2","generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"request_file":d.get("request_file"),"selected":selected,"rule":"Selection is request-driven. Catalogue metadata is not evidence; inspect digitized original before claim use."}
(out/"routed_candidates.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("generic routed",len(selected))
