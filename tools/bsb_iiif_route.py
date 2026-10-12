#!/usr/bin/env python3
"""BSB normalized discovery -> IIIF v3/v2 -> bounded reference scan.

Acquisition proves digital-object routing only. It never sets historical VERIFIED.
"""
import json,pathlib,re,urllib.request,os
from concurrent.futures import ThreadPoolExecutor,as_completed

LANE=os.getenv("PCT_RESEARCH_LANE","german")
SRC=pathlib.Path("lane_discovery")/f"{LANE}.json"
OUT=pathlib.Path("iiif_candidate_requests");OUT.mkdir(exist_ok=True)
BASE="https://api.digitale-sammlungen.de/iiif/presentation"
HEADERS={"User-Agent":"PiratecartographyResearch/3.0 (scholarly IIIF acquisition)","Accept":"application/json"}

def get(url,timeout=12,limit=12_000_000):
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=timeout) as response:data=response.read(limit+1)
    if len(data)>limit:raise ValueError("response exceeds size limit")
    return data

def canvases(m):
    if m.get("items"):return [x for x in m["items"] if x.get("type")=="Canvas"]
    if m.get("sequences"):return m["sequences"][0].get("canvases",[])
    return []

def first_image(c):
    for ann in c.get("images",[]):
        body=ann.get("resource") or {};services=body.get("service") or []
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
    supplied=item.get("manifest_candidates") or []
    probes=list(supplied)+[f"{BASE}/v3/{bid}/manifest",f"{BASE}/v2/{bid}/manifest"]
    seen=set()
    for url in probes:
        if not url or url in seen:continue
        seen.add(url)
        try:
            m=json.loads(get(url));cs=canvases(m)
            if not cs:raise ValueError("manifest returned no canvases")
            result.update(status="IIIF_MANIFEST_VALIDATED",manifest=url,canvas_count=len(cs))
            img=first_image(cs[0])
            if img:
                try:
                    data=get(img,timeout=15,limit=6_000_000)
                    if data[:3]==bytes.fromhex("ffd8ff") or data[:8]==bytes.fromhex("89504e470d0a1a0a"):
                        dest=OUT/"scans"/f"{bid}_canvas_0001.jpg";dest.parent.mkdir(exist_ok=True);dest.write_bytes(data)
                        result.update(status="REFERENCE_SCAN_ACQUIRED_PENDING_INSPECTION",reference_scan=str(dest),reference_scan_bytes=len(data),reference_canvas_id=cs[0].get("id") or cs[0].get("@id"))
                    else:result["scan_error"]="Non-image response"
                except Exception as e:result["scan_error"]=repr(e)
            else:result["scan_error"]="NO_IMAGE_URL"
            return result
        except Exception as e:result["attempts"].append({"url":url,"error":repr(e)})
    return result

if not SRC.exists():
    print("BSB IIIF routing: missing",SRC);raise SystemExit(0)
payload=json.loads(SRC.read_text(encoding="utf-8"));by_id={}
bsb_records=[r for r in payload.get("results",[]) if (r.get("discovery_repository") or r.get("repository"))=="BSB"]
for rec in bsb_records:
    ids=list(rec.get("bsb_digital_ids") or [])
    raw=json.dumps(rec,ensure_ascii=False)
    ids+=re.findall(r"bsb[0-9]{7,}",raw,re.I)
    manifests=list(rec.get("iiif_manifest_candidates") or [])
    for bid in ids:
        bid=bid.lower()
        by_id.setdefault(bid,{"source_id":bid,"source_title":rec.get("title"),"catalogue_ids":[rec.get("identifier")] if rec.get("identifier") else [],"discovery_repository":"BSB","discovery_lane":LANE,"manifest_candidates":manifests})

items=list(by_id.values())
if os.getenv("PCT_BSB_POSITIVE_CONTROL","")=="1":
    items.append({"source_id":"bsb10447069","source_title":"CONTROL — Robert Saulger, Histoire nouvelle des anciens ducs et autres souverains de l'Archipel","catalogue_ids":[],"discovery_repository":"BSB","discovery_lane":LANE,"control":True,"manifest_candidates":[]})
results=[]
with ThreadPoolExecutor(max_workers=4) as pool:
    for future in as_completed([pool.submit(process,item) for item in items]):results.append(future.result())
results.sort(key=lambda r:r["source_id"])
summary={"lane":LANE,"catalogue_records":len(bsb_records),"digital_ids":len(by_id),"control_objects":sum(1 for x in items if x.get("control")),"validated_manifests":sum(r["status"] in ("IIIF_MANIFEST_VALIDATED","REFERENCE_SCAN_ACQUIRED_PENDING_INSPECTION") for r in results),"reference_scans":sum(r["status"]=="REFERENCE_SCAN_ACQUIRED_PENDING_INSPECTION" for r in results)}
(OUT/"bsb_iiif_candidates.json").write_text(json.dumps({"summary":summary,"results":results,"gate":"Reference scan is NOT visually inspected and NOT historical verification."},ensure_ascii=False,indent=2),encoding="utf-8")
print("BSB IIIF",json.dumps(summary))
for r in results:print("BSB IIIF RESULT",r["source_id"],r["status"],r.get("canvas_count",0))
