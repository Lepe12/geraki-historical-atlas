#!/usr/bin/env python3
"""Acquire searchable text/metadata for routed Internet Archive library candidates."""
import json,pathlib,urllib.request,urllib.error,datetime,zipfile,io,re
src=pathlib.Path("citation_chase_candidates/routed_candidates.json")
if not src.exists(): raise SystemExit("missing routed_candidates.json")
d=json.loads(src.read_text(encoding="utf-8")); out=pathlib.Path("library_acquisition");out.mkdir(exist_ok=True)
results=[]
for x in d.get("selected",[]):
 ident=x.get("identifier"); rec=dict(x); rec["files"]=[]
 if not ident: continue
 try:
  with urllib.request.urlopen(f"https://archive.org/metadata/{ident}",timeout=45) as f: meta=json.load(f)
  files=meta.get("files",[])
  names=[str(a.get("name","")) for a in files]
  preferred=[]
  for n in names:
   low=n.lower()
   if low.endswith(("_djvu.txt","_searchtext.txt")) or low.endswith(".txt"): preferred.append(n)
  rec["available_text_files"]=preferred[:20]
  for n in preferred[:2]:
   try:
    url=f"https://archive.org/download/{ident}/"+urllib.parse.quote(n)
    with urllib.request.urlopen(url,timeout=60) as f: data=f.read(8_000_000)
    dest=out/(re.sub(r"[^A-Za-z0-9_.-]+","_",ident+"_"+pathlib.Path(n).name))
    dest.write_bytes(data); rec["files"].append(str(dest))
   except Exception as e: rec.setdefault("errors",[]).append(str(e))
  rec["status"]="TEXT_ACQUIRED" if rec["files"] else "METADATA_ONLY"
 except Exception as e: rec["status"]="ACQUISITION_ERROR";rec["error"]=str(e)
 results.append(rec)
report={"generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"protocol":"PCT-LIBRARY-ACQUIRE-v1","results":results,"verification_status":"NEEDS_EVIDENCE"}
(out/"acquisition_report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps([{"id":r.get("identifier"),"status":r.get("status"),"files":len(r.get("files",[]))} for r in results],ensure_ascii=False))
