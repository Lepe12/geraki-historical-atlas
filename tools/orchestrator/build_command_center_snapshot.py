#!/usr/bin/env python3
"""Build a real-data Command Center snapshot from durable JARVIS evidence."""
from __future__ import annotations
import argparse,datetime,json
from pathlib import Path

LANE_LABELS={
 "travellers":"Travellers","spanish_simancas":"Simancas","venetian":"Venetian","french":"French",
 "british":"British","dutch":"Dutch","german":"German","italian_states":"Italian States",
 "ottoman":"Ottoman","north_african":"North African"
}

def read(path:Path,default=None):
    if not path.exists(): return {} if default is None else default
    try:return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError,OSError):return {} if default is None else default

def candidate_claims(run_root:Path):
    claims=[]
    for lane in LANE_LABELS:
        data=read(run_root/lane/"structured_output"/"candidate_events.json",{})
        for c in data.get("events",[]) or []:
            claims.append({
              "candidate_id":c.get("candidate_id"),"lane":lane,
              "title":c.get("title") or c.get("source_file") or c.get("identifier"),
              "source_type":c.get("source_type"),"evidence_state":c.get("evidence_state"),
              "event_type":c.get("event_type"),"actor":c.get("actor"),
              "place":c.get("place"),"date":c.get("date"),
              "repository":c.get("repository"),"identifier":c.get("identifier"),
              "url":c.get("url"),"original_inspected":bool(c.get("original_inspected")),
              "verified":bool(c.get("verified"))
            })
    return claims

def specialist_events(repo:Path,run_id:str):
    root=repo/"evidence/specialist_runs"/run_id
    out=[]
    if not root.exists():return out
    for p in root.glob("raw_agents/**/events.jsonl"):
        try:lines=p.read_text(encoding="utf-8").splitlines()
        except OSError:continue
        for line in lines:
            if not line.strip():continue
            try:e=json.loads(line)
            except json.JSONDecodeError:continue
            if isinstance(e,dict):out.append(e)
    out.sort(key=lambda x:str(x.get("created_utc") or ""))
    return out[-600:]

def research_request(run_root:Path):
    for lane in LANE_LABELS:
        lane_file=run_root/lane/"research_lanes"/f"{lane}.json"
        d=read(lane_file,{})
        if not d:continue
        req=d.get("normalized_request") or d.get("request") or {}
        if req:
            return {
              "target":req.get("target"),"aliases":req.get("aliases") or [],
              "date_range":req.get("date_range"),"purpose":req.get("purpose")
            }
    return {}

def build(repo:Path,run_id:str):
    run_root=repo/"evidence/runs"/run_id
    if not run_root.exists():raise SystemExit("RUN_NOT_FOUND:"+run_id)
    board=read(run_root/"JARVIS_STATE_BOARD.json",{})
    spec=read(repo/"evidence/specialist_runs"/run_id/"SPECIALIST_AGGREGATE.json",{})
    request=research_request(run_root)
    claims=candidate_claims(run_root)
    agents=[]
    events=specialist_events(repo,run_id)
    blockers=[]

    for row in board.get("lanes",[]) or []:
        lane=row.get("lane")
        b=row.get("blockers",[]) or []
        blockers.extend({"agent_id":lane,**x} for x in b if isinstance(x,dict))
        agents.append({
          "id":lane,"label":LANE_LABELS.get(lane,lane),
          "kind":"research_lane","status":"COMPLETED",
          "phase":row.get("status") or row.get("verification_status") or "complete",
          "percent":100,"candidate_events":int(row.get("candidate_events",0) or 0),
          "verified_events":int(row.get("verified_events",0) or 0),
          "record_count":None,"blocker_count":len(b)
        })
        events.append({
          "schema":"pct-command-center-derived-event-v1",
          "event_id":f"{run_id}:{lane}:final","created_utc":board.get("generated_utc"),
          "project":"piratecartography","run_id":run_id,"event_type":"agent_completed",
          "agent_id":lane,"phase":row.get("status"),"percent":100,"status":"COMPLETED",
          "warnings":[str(x.get("status")) for x in b[:5] if isinstance(x,dict)],
          "detail":f"{row.get('candidate_events',0)} candidate events; {len(b)} blockers"
        })

    contradiction_leads=0
    specialist_records=0
    for row in spec.get("agents",[]) or []:
        aid=row.get("agent_id"); rec=int(row.get("records",0) or 0); specialist_records+=rec
        if aid=="contradiction": contradiction_leads=rec
        b=row.get("blockers",[]) or []
        blockers.extend({"agent_id":aid,**x} for x in b if isinstance(x,dict))
        agents.append({
          "id":aid,"label":row.get("label") or aid,
          "kind":"specialist","status":"COMPLETED","phase":"specialist research complete",
          "percent":100,"candidate_events":None,"verified_events":None,
          "record_count":rec,"search_runs":int(row.get("search_runs",0) or 0),
          "blocker_count":len(b),"requested_outputs":row.get("requested_outputs") or []
        })

    events.sort(key=lambda x:str(x.get("created_utc") or ""))
    summary=board.get("summary") or {}
    return {
      "schema":"pct-command-center-live-v1",
      "project":"piratecartography","run_id":run_id,
      "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "source":"DURABLE_GITHUB_EVIDENCE",
      "live_transport":"SNAPSHOT_BASELINE",
      "mission":{
        "target":request.get("target") or "Unknown target",
        "aliases":request.get("aliases") or [],
        "date_range":request.get("date_range") or "",
        "purpose":request.get("purpose") or "Historical research operation",
        "status":"COMPLETED",
        "selected_lanes":int(summary.get("selected_lanes",len([a for a in agents if a["kind"]=="research_lane"])) or 0)
      },
      "metrics":{
        "agents":len(agents),
        "candidate_claims":len(claims),
        "verified_events":sum(1 for c in claims if c.get("verified")),
        "specialist_discovery_records":specialist_records,
        "contradiction_search_records":contradiction_leads,
        "blocked_agents":sum(1 for a in agents if a.get("blocker_count",0)>0),
        "blocker_records":len(blockers)
      },
      "agents":agents,
      "claims":claims[:500],
      "contradictions":{
        "status":"SEARCH_OUTPUT_NOT_ADJUDICATED",
        "search_records":contradiction_leads,
        "note":"Contradiction specialist records are research leads, not verified contradictions."
      },
      "blockers":blockers[:500],
      "events":events[-600:],
      "safety":{
        "automatic_verified":False,
        "human_review_required":True,
        "rule":"Operational live data never promotes a historical claim."
      }
    }

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--repo",default=".");p.add_argument("--run-id",required=True)
    p.add_argument("--output",required=True);p.add_argument("--latest")
    a=p.parse_args();repo=Path(a.repo).resolve();data=build(repo,str(a.run_id))
    out=repo/a.output;out.parent.mkdir(parents=True,exist_ok=True)
    payload=json.dumps(data,ensure_ascii=False,indent=2)+"\n";out.write_text(payload,encoding="utf-8")
    if a.latest:
        latest=repo/a.latest;latest.parent.mkdir(parents=True,exist_ok=True);latest.write_text(payload,encoding="utf-8")
    print("COMMAND CENTER SNAPSHOT",data["run_id"],"agents",data["metrics"]["agents"],"claims",data["metrics"]["candidate_claims"],"specialist records",data["metrics"]["specialist_discovery_records"])
