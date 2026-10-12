#!/usr/bin/env python3
"""Prepare selected research outputs for durable GitHub evidence preservation.

This copies only evidence-bearing outputs into evidence/runs/<run>/<lane>/,
writes SHA-256 metadata, and never changes verification state.
"""
import argparse, hashlib, json, pathlib, shutil, datetime
p=argparse.ArgumentParser();p.add_argument("--run-id",required=True);p.add_argument("--lane",required=True);a=p.parse_args()
roots=["research_lanes","repository_plans","lane_discovery","iiif_candidate_requests","library_acquisition","citation_chase_hits","event_first_hits","exact_page_acquisition","original_inspection","source_genealogy","corroboration","verification","qa","structured_output","system_health"]
dest=pathlib.Path("evidence/runs")/a.run_id/a.lane;dest.mkdir(parents=True,exist_ok=True)
items=[]
for root in roots:
 src=pathlib.Path(root)
 if not src.exists(): continue
 for f in src.rglob("*"):
  if not f.is_file(): continue
  # Keep research text/metadata and exact-page images; skip unexpectedly large files.
  if f.stat().st_size > 5*1024*1024: continue
  rel=pathlib.Path(root)/f.relative_to(src); out=dest/rel;out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,out)
  b=out.read_bytes();items.append({"path":str(out.relative_to(pathlib.Path("evidence"))),"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest()})
index={"schema":"pct-github-evidence-v1","run_id":a.run_id,"lane":a.lane,"created_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"objects":items,"verification_gate":"Persistence does not imply original inspection, independence, corroboration, or VERIFIED status."}
(dest/"index.json").write_text(json.dumps(index,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("EVIDENCE PREPARED",a.lane,len(items))
