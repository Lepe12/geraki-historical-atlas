#!/usr/bin/env python3
"""Fail if the ten lane payloads do not share one exact research request identity."""
import json,pathlib,sys
LANES=["greek","travellers","spanish_simancas","venetian","french","british","dutch","german","italian_states","ottoman","north_african"]
rows=[];missing=[]
for lane in LANES:
    p=pathlib.Path("research_lanes")/f"{lane}.json"
    if not p.exists(): missing.append(lane); continue
    d=json.loads(p.read_text(encoding="utf-8"))
    rows.append((lane,d.get("research_job_id"),d.get("request_sha256"),d.get("request_file")))
if missing:
    print("REQUEST INTEGRITY FAIL missing lanes",",".join(missing));sys.exit(1)
jobs={x[1] for x in rows}; hashes={x[2] for x in rows}; files={x[3] for x in rows}
bad=[x for x in rows if not x[1] or not x[2]]
if bad or len(jobs)!=1 or len(hashes)!=1 or len(files)!=1:
    print("REQUEST INTEGRITY FAIL",rows);sys.exit(1)
print("REQUEST INTEGRITY PASS",rows[0][1],rows[0][2],rows[0][3],"lanes",len(rows))
