#!/usr/bin/env python3
"""Preserve research evidence in GitHub, including large files via deterministic chunks."""
import argparse, hashlib, json, pathlib, shutil, datetime
p=argparse.ArgumentParser();p.add_argument("--run-id",required=True);p.add_argument("--lane",required=True);a=p.parse_args()
roots=["research_lanes","repository_plans","lane_discovery","iiif_candidate_requests","library_acquisition","citation_chase_hits","event_first_hits","exact_page_acquisition","original_inspection","source_genealogy","corroboration","human_review","verification","qa","structured_output","research_dossier","run_manifest","system_health"]
dest=pathlib.Path("evidence/runs")/a.run_id/a.lane;dest.mkdir(parents=True,exist_ok=True)
items=[];chunk_size=20*1024*1024
for root in roots:
 src=pathlib.Path(root)
 if not src.exists(): continue
 for f in src.rglob("*"):
  if not f.is_file(): continue
  rel=pathlib.Path(root)/f.relative_to(src);size=f.stat().st_size
  if size<=chunk_size:
   out=dest/rel;out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,out);b=out.read_bytes()
   items.append({"path":str(out.relative_to(pathlib.Path("evidence"))),"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest(),"storage":"direct"})
  else:
   whole=hashlib.sha256();parts=[];partdir=dest/(str(rel)+".parts");partdir.mkdir(parents=True,exist_ok=True)
   with f.open("rb") as fh:
    n=0
    while True:
     b=fh.read(chunk_size)
     if not b: break
     whole.update(b);n+=1;out=partdir/f"part-{n:05d}.bin";out.write_bytes(b)
     parts.append({"path":str(out.relative_to(pathlib.Path("evidence"))),"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest()})
   items.append({"original_path":str(rel),"bytes":size,"sha256":whole.hexdigest(),"storage":"chunked","chunk_size":chunk_size,"parts":parts})
index={"schema":"pct-github-evidence-v2","run_id":a.run_id,"lane":a.lane,"created_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"objects":items,"reassembly":"Concatenate chunked parts in lexical part order; verify object sha256.","verification_gate":"Persistence does not imply original inspection, independence, corroboration, or VERIFIED status."}
(dest/"index.json").write_text(json.dumps(index,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("EVIDENCE PREPARED",a.lane,len(items),"chunked",sum(x.get("storage")=="chunked" for x in items))
