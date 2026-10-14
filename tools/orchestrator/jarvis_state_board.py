#!/usr/bin/env python3
"""Build a compact JARVIS research situation board from durable evidence."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from datetime import datetime, timezone

LANES=["greek","travellers","spanish_simancas","venetian","french","british","dutch","german","italian_states","ottoman","north_african"]

def read(p):
    return json.loads(p.read_text(encoding="utf-8"))

def lane_state(run,lane):
    base=run/lane
    if not base.exists(): return {"lane":lane,"status":"NOT_SELECTED"}
    qa=base/"qa"/"qa_report.json"
    ver=base/"verification"/"verification_gate.json"
    dossier=base/"research_dossier"/f"{lane}.json"
    out={"lane":lane,"status":"UNKNOWN","candidate_events":0,"verified_events":0,"blockers":[]}
    if qa.is_file():
        d=read(qa); out["status"]=d.get("decision") or d.get("verification_gate") or "UNKNOWN"; out["candidate_events"]=int(d.get("candidate_events",0) or 0); out["verified_events"]=int(d.get("verified_events",0) or 0)
    if ver.is_file():
        d=read(ver); out["verification_status"]=d.get("status")
    if dossier.is_file():
        d=read(dossier)
        for r in d.get("repositories_attempted",[]):
            if r.get("status") not in {"EXECUTED","OPERATIONAL","SUCCESS"}:
                out["blockers"].append({"repository":r.get("repository"),"status":r.get("status")})
    return out

def build(run):
    states=[lane_state(run,l) for l in LANES]
    selected=[x for x in states if x["status"]!="NOT_SELECTED"]
    return {
      "schema":"pct-jarvis-state-board-v1",
      "run_id":run.name,
      "generated_utc":datetime.now(timezone.utc).isoformat(),
      "summary":{
        "selected_lanes":len(selected),
        "candidate_events":sum(x.get("candidate_events",0) for x in selected),
        "verified_events":sum(x.get("verified_events",0) for x in selected),
        "blocked_lanes":sum(1 for x in selected if x.get("blockers"))
      },
      "lanes":states,
      "rule":"State board reports workflow state only; it does not verify historical claims."
    }

if __name__=="__main__":
    p=argparse.ArgumentParser(); p.add_argument("--run-id",required=True); p.add_argument("--runs-root",type=Path,default=Path("evidence/runs")); p.add_argument("--output",type=Path)
    a=p.parse_args(); run=a.runs_root/a.run_id
    if not run.is_dir(): raise SystemExit("RUN_NOT_FOUND")
    out=build(run); payload=json.dumps(out,ensure_ascii=False,indent=2)+"\n"
    if a.output: a.output.parent.mkdir(parents=True,exist_ok=True); a.output.write_text(payload,encoding="utf-8")
    else: print(payload,end="")
