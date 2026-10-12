#!/usr/bin/env python3
"""Acquire what can be acquired automatically from common Citation Chase candidates.

Repository provenance is retained.  Unsupported/non-direct digital objects remain
LOCATED rather than being misreported as acquired or verified.
"""
import json,pathlib,urllib.request,urllib.parse,datetime,re,os

ROOT=pathlib.Path("citation_chase_candidates")
OUT=pathlib.Path("library_acquisition");OUT.mkdir(exist_ok=True)

def load(path):
    if not path.exists():return []
    return json.loads(path.read_text(encoding="utf-8")).get("selected",[])

candidates=load(ROOT/"repository_candidates.json")+load(ROOT/"routed_candidates.json")
seen=set();items=[]
for x in candidates:
    k=(str(x.get("discovery_repository") or x.get("repository")),str(x.get("identifier") or x.get("url") or x.get("title")))
    if k in seen:continue
    seen.add(k);items.append(x)

# Bounded per-run acquisition with a durable deferred queue. Preserve both
# executable Internet Archive objects and lane-specific catalogue candidates.
max_items=max(1,int(os.getenv("PCT_MAX_ACQUISITION_CANDIDATES","8")))
max_ia=max(1,int(os.getenv("PCT_MAX_IA_CANDIDATES","3")))
ia=[x for x in items if x.get("acquisition_route")=="INTERNET_ARCHIVE" or str(x.get("discovery_repository") or x.get("repository") or "").lower().startswith("internet archive")]
other=[x for x in items if x not in ia]
selected=ia[:max_ia]+other[:max(0,max_items-min(max_ia,len(ia)))]
if len(selected)<max_items:selected+=(ia[max_ia:]+other[max(0,max_items-min(max_ia,len(ia))):])[:max_items-len(selected)]
selected_ids={id(x) for x in selected}
deferred=[x for x in items if id(x) not in selected_ids]
(OUT/"acquisition_backlog.json").write_text(json.dumps({"total_candidates":len(items),"selected":len(selected),"deferred_count":len(deferred),"deferred":deferred,"rule":"Deferred leads remain eligible for later bounded batches."},ensure_ascii=False,indent=2),encoding="utf-8")
items=selected

def safe_name(s):
    return re.sub(r"[^A-Za-z0-9_.-]+","_",str(s))[:180]

def fetch(url,limit=8_000_000,timeout=25):
    req=urllib.request.Request(url,headers={"User-Agent":"Piratecartography-Research/3.0"})
    with urllib.request.urlopen(req,timeout=timeout) as f:
        data=f.read(limit+1);ctype=f.headers.get("Content-Type","")
    if len(data)>limit:raise ValueError("object exceeds acquisition size limit")
    return data,ctype

results=[]
for x in items:
    rec=dict(x);rec["files"]=[];rec["original_inspected"]=False;rec["verification_status"]="NEEDS_EVIDENCE"
    repo=str(rec.get("discovery_repository") or rec.get("repository") or "")
    ident=rec.get("identifier")
    try:
        is_ia=(rec.get("acquisition_route")=="INTERNET_ARCHIVE" or repo.lower().startswith("internet archive"))
        if is_ia and ident:
            with urllib.request.urlopen("https://archive.org/metadata/"+urllib.parse.quote(str(ident)),timeout=25) as f:meta=json.load(f)
            names=[str(a.get("name","")) for a in meta.get("files",[])]
            preferred=[n for n in names if n.lower().endswith(("_djvu.txt","_searchtext.txt",".txt"))]
            rec["available_text_files"]=preferred[:20]
            for n in preferred[:2]:
                try:
                    url="https://archive.org/download/"+urllib.parse.quote(str(ident))+"/"+urllib.parse.quote(n)
                    data,_=fetch(url)
                    dest=OUT/safe_name(str(ident)+"_"+pathlib.Path(n).name);dest.write_bytes(data);rec["files"].append(str(dest))
                except Exception as e:rec.setdefault("errors",[]).append(f"IA_TEXT {type(e).__name__}: {e}")
            rec["status"]="TEXT_ACQUIRED" if rec["files"] else "METADATA_ONLY"
        else:
            # Manifest acquisition is safe and bounded; image/page acquisition occurs later.
            manifests=rec.get("iiif_manifest_candidates") or []
            for i,url in enumerate(manifests[:3]):
                try:
                    data,ctype=fetch(url,limit=4_000_000,timeout=30)
                    json.loads(data.decode("utf-8","replace"))
                    dest=OUT/(safe_name((ident or repo)+"_manifest_"+str(i+1))+".json");dest.write_bytes(data);rec["files"].append(str(dest))
                except Exception as e:rec.setdefault("errors",[]).append(f"IIIF_MANIFEST {type(e).__name__}: {e}")
            direct=rec.get("digital_url")
            if direct and str(direct).lower().split("?")[0].endswith((".txt",".xml",".json")):
                try:
                    data,ctype=fetch(str(direct))
                    ext=pathlib.Path(urllib.parse.urlparse(str(direct)).path).suffix or ".dat"
                    dest=OUT/(safe_name(ident or repo+"_direct")+ext);dest.write_bytes(data);rec["files"].append(str(dest))
                except Exception as e:rec.setdefault("errors",[]).append(f"DIRECT {type(e).__name__}: {e}")
            rec["status"]="DIGITAL_METADATA_ACQUIRED" if rec["files"] else "LOCATED_CITATION_CHASE"
    except Exception as e:
        rec["status"]="ACQUISITION_ERROR";rec["error"]=f"{type(e).__name__}: {e}"
    results.append(rec)
report={"schema":"pct-library-acquire-v2","generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"results":results,"deferred_count":len(deferred),"total_candidates":len(selected)+len(deferred),"verification_status":"NEEDS_EVIDENCE","gate":"Acquisition or location never implies original inspection or verification."}
(OUT/"acquisition_report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print("acquisition",len(results),"text",sum(r.get("status")=="TEXT_ACQUIRED" for r in results),"digital",sum(r.get("status")=="DIGITAL_METADATA_ACQUIRED" for r in results),"located",sum(r.get("status")=="LOCATED_CITATION_CHASE" for r in results),"errors",sum(r.get("status")=="ACQUISITION_ERROR" for r in results))
