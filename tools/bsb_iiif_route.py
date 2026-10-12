#!/usr/bin/env python3
"""BSB MARC -> IIIF v3/v2 -> one reference scan per valid digital object.
No catalogue record or downloaded scan is treated as inspected evidence.
"""
import json,pathlib,re,urllib.request,urllib.error
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor,as_completed

SRC=pathlib.Path("lane_discovery/german.json")
OUT=pathlib.Path("iiif_candidate_requests")
OUT.mkdir(exist_ok=True)
BASE="https://api.digitale-sammlungen.de/iiif/presentation"
HEADERS={"User-Agent":"PiratecartographyResearch/2.5 (scholarly IIIF acquisition)","Accept":"application/json"}
def get(url,timeout=12,limit=12_000_000):
 req=urllib.request.Request(url,headers=HEADERS)
 with urllib.request.urlopen(req,timeout=timeout) as response:
  data=response.read(limit+1)
 if len(data)>limit:raise ValueError("response exceeds size limit")
 return data
def canvases(m):
 if m.get("items"):return [x for x in m["items"] if x.get("type")=="Canvas"]
 if m.get("sequences"):return m["sequences"][0].get("canvases",[])
 return []
def first_image(c):
 for ann in c.get("images",[]):
  body=ann.get("resource") or {}
  services=body.get("service") or []
  if isinstance(services,dict):services=[services]
  for s in services:
   base=s.get("@id") or s.get("id")
   if base:return base.rstrip("/")+"/full/800,/0/default.jpg"
  if body.get("@id"):return body["@id"]
 for page in c.get("items",[]):
  for ann in page.get("items",[]):
   body=ann.get("body") or {}
   if isinstance(body,list):body=body[0] if body else {}
   services=body.get("service") or []
   if isinstance(services,dict):services=[services]
   for s in services:
    base=s.get("id") or s.get("@id")
    if base:return base.rstrip("/")+"/full/800,/0/default.jpg"
   if body.get("id"):return body["id"]
 return None
def process(item):
 bid=item["source_id"]
 result={**item,"status":"MANIFEST_UNAVAILABLE","attempts":[],"original_inspected":False,"verification_status":"NEEDS_EVIDENCE"}
 for version in ("v3","v2"):
  url=f"{BASE}/{version}/{bid}/manifest"
  try:
   m=json.loads(get(url))
   cs=canvases(m)
   if not cs:raise ValueError("manifest returned no canvases")
   result.update(status="IIIF_MANIFEST_VALIDATED",manifest=url,canvas_count=len(cs))
   img=first_image(cs[0])
   if img:
    try:
     data=get(img,timeout=15,limit=6_000_000)
     if data[:3]==b"\\xff\\xd8\\xff" or data[:8]==b"\\x89PNG\\r\\n\\x1a\\n":
      dest=OUT/"scans"/f"{bid}_canvas_0001"+".jpg"
      dest.parent.mkdir(exist_ok=True)
      dest.write_bytes(data)
      result.update(status="REFERENCE_SCAN_ACQUIRED_PENDING_INSPECTION",reference_scan=str(dest),reference_scan_bytes=len(data),reference_canvas_id=cs[0].get("id") or cs[0].get("@id"))
     else:result["scan_error"]="Non-image response"
    except Exception as e:result["scan_error"]=repr(e)
   else:result["scan_error"]="NO_IMAGE_URL"
   return result
  except Exception as e:result["attempts"].append({"version":version,"url":url,"error":repr(e)})
 return result

if not SRC.exists():
 print("BSB IIIF routing: missing German discovery report")
 raise SystemExit(0)
payload=json.loads(SRC.read_text(encoding="utf-8"))
by_id={}
for rec in payload.get("results",[]):
 if rec.get("repository")!="BSB":continue
 raw=" ".join(str(x) for x in rec.get("digital_links",[])+rec.get("digital_markers",[])+rec.get("bsb_digital_ids",[]))
 for bid in re.findall(r"bsb[0-9]{7,}",raw,re.I):
  by_id.setdefault(bid.lower(),{"source_id":bid.lower(),"source_title":rec.get("title"),"catalogue_ids":rec.get("identifier",[]),"discovery_repository":"BSB","discovery_lane":"german"})
items=list(by_id.values())
results=[]
with ThreadPoolExecutor(max_workers=4) as pool:
 for future in as_completed([pool.submit(process,item) for item in items]):
  results.append(future.result())
results.sort(key=lambda r:r["source_id"])
summary={"catalogue_records":sum(x.get("repository")=="BSB" for x in payload.get("results",[])),"digital_ids":len(items),"validated_manifests":sum(r["status"] in ("IIIF_MANIFEST_VALIDATED","REFERENCE_SCAN_ACQUIRED_PENDING_INSPECTION") for r in results),"reference_scans":sum(r["status"]=="REFERENCE_SCAN_ACQUIRED_PENDING_INSPECTION" for r in results)}
(OUT/"bsb_iiif_candidates.json").write_text(json.dumps({"summary":summary,"results":results,"gate":"Reference scan is NOT visually inspected and NOT historical verification."},ensure_ascii=False,indent=2),encoding="utf-8")
print("BSB IIIF",json.dumps(summary))
for r in results:print("BSB IIIF RESULT",r["source_id"],r["status"],r.get("canvas_count",0),r.get("attempts",[]),r.get("scan_error",""))
