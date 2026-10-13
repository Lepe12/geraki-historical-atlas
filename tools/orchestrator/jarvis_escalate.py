#!/usr/bin/env python3
"""JARVIS archive-escalation planner.

Reads a completed/partial Piratecartography run and emits a request for
specialized archive/browser connectors when a lane has zero candidates and an
explicit archive blocker. It never marks evidence VERIFIED and never performs
network access itself.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path

ROUTES = {
    "venetian": {
        "match": ["Archivio di Stato di Venezia", "SIAS"],
        "statuses": ["AUTH_OR_BROWSER_REQUIRED", "ARCHIVE_NOT_CONFIRMED"],
        "route": "moreveneto_browser",
        "repository": "Archivio di Stato di Venezia / moreveneto",
    },
    "spanish_simancas": {
        "match": ["PARES", "Archivo General de Simancas"],
        "statuses": ["ARCHIVE_NOT_CONFIRMED", "AUTH_OR_BROWSER_REQUIRED"],
        "route": "pares_simancas_dynamic",
        "repository": "PARES / Archivo General de Simancas",
    },
    "italian_states": {
        "match": ["SIAS", "Italian State Archives"],
        "statuses": ["AUTH_OR_BROWSER_REQUIRED", "ARCHIVE_NOT_CONFIRMED"],
        "route": "sias_browser",
        "repository": "SIAS / Italian State Archives",
    },
}

def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))

def lane_zero_candidates(run: Path, lane: str) -> bool:
    qa = run / lane / "qa" / "qa_report.json"
    if not qa.is_file():
        return False
    d=read(qa)
    return int(d.get("candidate_events",0) or 0)==0 and int(d.get("verified_events",0) or 0)==0

def blockers(run: Path, lane: str):
    p=run/lane/"research_dossier"/f"{lane}.json"
    if not p.is_file(): return []
    d=read(p)
    return d.get("repositories_attempted",[]) or []

def request_identity(run: Path):
    for lane in ROUTES:
        p=run/lane/"research_request_identity.json"
        if p.is_file():
            d=read(p)
            return d.get("normalized_request",{}), d.get("request_sha256"), d.get("research_job_id")
    return {},None,None

def plan(run: Path):
    req,sha,job_id=request_identity(run)
    routes=[]
    for lane,cfg in ROUTES.items():
        if not lane_zero_candidates(run,lane):
            continue
        for b in blockers(run,lane):
            name=str(b.get("repository",""))
            status=str(b.get("status",""))
            if status not in cfg["statuses"]:
                continue
            if any(token.lower() in name.lower() for token in cfg["match"]):
                routes.append({
                    "lane":lane,
                    "route":cfg["route"],
                    "repository":cfg["repository"],
                    "trigger_status":status,
                    "reason":"ZERO_CANDIDATES_PLUS_ARCHIVE_BLOCKER",
                })
                break
    return {
        "schema":"pct-jarvis-archive-escalation-v1",
        "parent_run_id":run.name,
        "research_job_id":job_id,
        "request_sha256":sha,
        "target":req.get("target",""),
        "aliases":req.get("aliases",[]),
        "date_range":req.get("date_range",""),
        "purpose":req.get("purpose",""),
        "routes":routes,
        "automatic_verified_promotion":False,
        "rule":"Escalation is discovery only. Browser/catalogue output is not historical verification."
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--run-id",required=True)
    ap.add_argument("--runs-root",type=Path,default=Path("evidence/runs"))
    ap.add_argument("--output",type=Path,required=True)
    a=ap.parse_args()
    if not a.run_id.isdigit(): raise SystemExit("INVALID_RUN_ID")
    run=a.runs_root/a.run_id
    if not run.is_dir(): raise SystemExit("RUN_NOT_FOUND")
    out=plan(run)
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("JARVIS_ESCALATION_ROUTES",len(out["routes"]))
    for r in out["routes"]: print(r["lane"],r["route"],r["trigger_status"])

if __name__=="__main__":
    main()
