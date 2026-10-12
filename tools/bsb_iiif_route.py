#!/usr/bin/env python3
"""Route BSB catalogue leads to IIIF acquisition requests, without promoting catalogue records to evidence."""
import json,pathlib,urllib.request
src=pathlib.Path("lane_discovery/german.json")
out=pathlib.Path("iiif_candidate_requests");out.mkdir(exist_ok=True)
if not src.exists():
 print("BSB IIIF routing: no German lane discovery report");raise SystemExit(0)
data=json.loads(src.read_text(encoding="utf-8"))
candidates=[];seen=set()
for r in data.get("results",[]):
 if r.get("repository")!="BSB":continue
 for manifest in r.get("iiif_manifest_candidates",[]):
  if manifest in seen:continue
  seen.add(manifest)
  entry={"manifest":manifest,"source_id":manifest.split("/")[-2],"source_title":r.get("title"),"status":"UNTESTED_MANIFEST_CANDIDATE","original_inspected":False,"verification_status":"NEEDS_EVIDENCE"}
  try:
   req=urllib.request.Request(manifest,headers={"User-Agent":"PCT-Historical-Research/2.4"})
   with urllib.request.urlopen(req,timeout=25) as response:
    j=json.load(response)
   if j.get("sequences") or j.get("items"):entry["status"]="IIIF_MANIFEST_VALIDATED"
   else:entry["status"]="MANIFEST_NO_CANVASES"
  except Exception as e:entry["status"]="MANIFEST_ERROR";entry["error"]=str(e)
  candidates.append(entry)
(out/"bsb_iiif_candidates.json").write_text(json.dumps({"results":candidates,"gate":"IIIF metadata and images are not original-page inspection or independent corroboration."},ensure_ascii=False,indent=2),encoding="utf-8")
print("BSB IIIF candidates",len(candidates),"validated",sum(x["status"]=="IIIF_MANIFEST_VALIDATED" for x in candidates))
