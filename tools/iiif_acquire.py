#!/usr/bin/env python3
"""Generic IIIF printed-page acquisition for Piratecartography Source Acquisition."""
import argparse, hashlib, json, pathlib, re, urllib.request

HEADERS={"User-Agent":"PiratecartographyResearch/1.0 (scholarly IIIF acquisition)"}

def get(url):
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=60) as r:return r.read()

def label_text(v):
    if isinstance(v,str): return v
    if isinstance(v,list): return " ".join(label_text(x) for x in v)
    if isinstance(v,dict): return " ".join(label_text(x) for x in v.values())
    return str(v)

def canvases(m):
    if m.get("sequences"): return m["sequences"][0].get("canvases",[])
    return m.get("items",[])

def image_url(c):
    # IIIF Presentation 2
    for a in c.get("images",[]):
        b=a.get("resource",{}); s=b.get("service",[])
        if isinstance(s,dict): s=[s]
        if s:
            base=s[0].get("@id") or s[0].get("id")
            if base:return base.rstrip("/")+"/full/1600,/0/default.jpg"
        if b.get("@id"):return b["@id"]
    # IIIF Presentation 3
    for ap in c.get("items",[]):
        for a in ap.get("items",[]):
            b=a.get("body",{}); s=b.get("service",[])
            if isinstance(s,dict):s=[s]
            if s:
                base=s[0].get("id") or s[0].get("@id")
                if base:return base.rstrip("/")+"/full/1600,/0/default.jpg"
            if b.get("id"):return b["id"]
    return None

def printed_number(label):
    """Conservative parser: accepts a leading Arabic page number only.
    Examples: '305 (0323)' -> 305, '305' -> 305. Never treats scan ordinal in parentheses as pagination.
    Roman/folio/unnumbered labels are deliberately unresolved and require pagination review.
    """
    s=label.strip()
    m=re.match(r"^(\d{1,5})(?=\s|\(|$)",s)
    return int(m.group(1)) if m else None

p=argparse.ArgumentParser()
p.add_argument("--manifest",required=True)
p.add_argument("--pages",default="",help="Comma-separated printed Arabic page numbers, e.g. 305,310,314")
p.add_argument("--canvas-indexes",default="",help="Explicit zero-based scan indexes; never interpreted as printed pages")
p.add_argument("--out",default="iiif_acquisition")
p.add_argument("--source-id",default="")
a=p.parse_args()
targets={int(x.strip()) for x in a.pages.split(",") if x.strip()}
indexes={int(x.strip()) for x in a.canvas_indexes.split(",") if x.strip()}
if not targets and not indexes:p.error('Printed pages or explicit canvas indexes are required')
if any(i<0 for i in indexes):p.error('Canvas indexes must be nonnegative')
out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=True)
report={"source_id":a.source_id,"manifest":a.manifest,"target_printed_pages":sorted(targets),"matches":[],"missing":[],"status":"NOT_INSPECTED"}
report['target_canvas_indexes_0_based']=sorted(indexes)
try:
    manifest_bytes=get(a.manifest)
    (out/'manifest.json').write_bytes(manifest_bytes)
    report['manifest_sha256']=hashlib.sha256(manifest_bytes).hexdigest()
    m=json.loads(manifest_bytes); cs=canvases(m); report["canvas_count"]=len(cs)
    by_page={}
    for i,c in enumerate(cs):
        lab=label_text(c.get("label","")); pn=printed_number(lab)
        if pn in targets:
            by_page.setdefault(pn,[]).append((i,c,lab))
    for pn in sorted(targets):
        hits=by_page.get(pn,[])
        if len(hits)!=1:
            report["missing"].append({"printed_page":pn,"reason":"NO_MATCH" if not hits else "AMBIGUOUS_LABEL","match_count":len(hits)})
            continue
        i,c,lab=hits[0]; url=image_url(c)
        e={"printed_page":pn,"canvas_index_0_based":i,"canvas_id":c.get("@id") or c.get("id"),"label":lab,"image_url":url}
        if not url:
            e["error"]="NO_IMAGE_URL"; report["missing"].append({"printed_page":pn,"reason":"NO_IMAGE_URL"})
        else:
            data=get(url); dest=out/f"printed_{pn}.jpg"; dest.write_bytes(data)
            e.update(saved_file=str(dest),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
        report["matches"].append(e)
    for i in sorted(indexes):
        if i>=len(cs):
            report['missing'].append({'canvas_index_0_based':i,'reason':'SCAN_INDEX_OUT_OF_RANGE'})
            continue
        c=cs[i];url=image_url(c)
        e={'printed_page':None,'canvas_index_0_based':i,'canvas_id':c.get('@id') or c.get('id'),
           'label':label_text(c.get('label','')),'image_url':url,
           'selection_basis':'EXPLICIT_SCAN_INDEX_NOT_PRINTED_PAGINATION','original_inspected':False}
        if not url:report['missing'].append({'canvas_index_0_based':i,'reason':'NO_IMAGE_URL'})
        else:
            data=get(url);dest=out/f'scan_{i:04d}.jpg';dest.write_bytes(data)
            e.update(saved_file=str(dest),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
        report['matches'].append(e)
    acquired={e["printed_page"] for e in report["matches"] if e.get("saved_file") and e.get('printed_page') is not None}
    acquired_indexes={e['canvas_index_0_based'] for e in report['matches'] if e.get('saved_file') and e.get('selection_basis')}
    if acquired==targets and acquired_indexes==indexes and not report["missing"]:
        report["status"]="ALL_TARGET_IMAGES_ACQUIRED_PENDING_VISUAL_PAGE_VERIFICATION"
    elif acquired or acquired_indexes:
        report["status"]="PARTIAL_ACQUISITION_PENDING_PAGINATION_REVIEW"
    else:
        report["status"]="PAGINATION_UNRESOLVED_OR_NO_IMAGES"
        report["sample_labels"]=[{"index":i,"label":label_text(c.get("label",""))} for i,c in enumerate(cs[:50])]
except Exception as e:
    report["status"]="ACQUISITION_ERROR";report["error"]=repr(e)
finally:
    (out/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
    if report["status"]=="ACQUISITION_ERROR":raise SystemExit(1)

