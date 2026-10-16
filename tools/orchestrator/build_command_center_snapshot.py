#!/usr/bin/env python3
"""Build a real-data Command Center snapshot from durable JARVIS evidence."""
from __future__ import annotations
import argparse,datetime,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from research_relevance import identity, assess

LANE_LABELS={
 "greek":"Greek","travellers":"Travellers","spanish_simancas":"Simancas","venetian":"Venetian","french":"French",
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

def discovery_results(run_root:Path,request=None):
    """Publish retained leads and executed-query coverage, independently of claims."""
    discoveries=[];coverage=[];seen=set()
    for lane in LANE_LABELS:
        root=run_root/lane
        inv=read(root/"research_discovery/all_findings.json",{})
        raw=read(root/"lane_discovery"/f"{lane}.json",{})
        rows=inv.get("findings") or raw.get("results") or []
        for row in rows:
            key=(lane,row.get("repository") or row.get("discovery_repository"),str(row.get("identifier") or row.get("url") or row.get("title")))
            if key in seen:continue
            seen.add(key)
            assessment=row.get("relevance_assessment") or {}
            if request and request.get('target'):
                ident=identity(request,request)
                current=assess(row,ident)
                assessment=current if ident['type']=='person' else {**current,**assessment,'topical_match':current['topical_match']}
            discoveries.append({
                "lane":lane,"identifier":row.get("identifier"),"title":row.get("title"),
                "repository":row.get("repository") or row.get("discovery_repository"),
                "url":row.get("url") or row.get("digital_url"),"date":row.get("date"),
                "creator":row.get("creator"),"evidence_state":row.get('evidence_state') or "DISCOVERED",
                **{k:row.get(k) for k in ('publication_year','fulltext_hit','printed_page','canvas_id','scan_index_0_based','image_url','manifest_url','matched_terms','fulltext_query','reported_page_numbers','locator_status','source_origin') if row.get(k) is not None},
                "context_excerpt":str(row.get('context_excerpt') or row.get('description') or row.get('snippet') or '')[:600],
                "triage_status":assessment.get("status") or "REVIEW_REQUIRED",
                "triage_reasons":assessment.get("reasons") or [],
                "topical_match":assessment.get("topical_match"),
                "research_value":assessment.get("research_value"),
                "evidence_confidence":assessment.get("evidence_confidence"),
                "fallback_for":row.get("fallback_for"),"fallback_reason":row.get("fallback_reason"),
                "verified":False,
            })
        for attempt in raw.get("attempts",[]):
            coverage.append({"lane":lane,"repository":attempt.get("repository"),
                "status":attempt.get("status"),"hits":attempt.get("hits",0),
                "queries":[{"query":q.get("query"),"status":q.get("status"),"hits":q.get("hits",0)} for q in attempt.get("queries",[])],
                "url":attempt.get("base_url")})
    return discoveries,coverage

def request_id_for(run_root:Path):
    for lane in LANE_LABELS:
        data=read(run_root/lane/"research_request_identity.json",{})
        if data.get("request_id"):return data["request_id"]
    return None

def publish_latest(latest:Path,data:dict,payload:str):
    current=str(read(latest,{}).get("run_id", ""))
    incoming=str(data.get("run_id", ""))
    if current.isdigit() and incoming.isdigit() and int(current)>int(incoming):
        return False
    latest.parent.mkdir(parents=True,exist_ok=True)
    latest.write_text(payload,encoding="utf-8")
    return True

def build(repo:Path,run_id:str):
    run_root=repo/"evidence/runs"/run_id
    if not run_root.exists():raise SystemExit("RUN_NOT_FOUND:"+run_id)
    board=read(run_root/"JARVIS_STATE_BOARD.json",{})
    spec=read(repo/"evidence/specialist_runs"/run_id/"SPECIALIST_AGGREGATE.json",{})
    request=research_request(run_root)
    claims=candidate_claims(run_root)
    discoveries,coverage=discovery_results(run_root,request)
    request_id=request_id_for(run_root)
    agents=[]
    events=specialist_events(repo,run_id)
    blockers=[]

    for row in board.get("lanes",[]) or []:
        lane=row.get("lane")
        if row.get("status")=="NOT_SELECTED":continue
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
          "project":"piratecartography","run_id":run_id,"request_id":request_id,"event_type":"agent_completed",
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
      "project":"piratecartography","run_id":run_id,"request_id":request_id,
      "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "source":"DURABLE_GITHUB_EVIDENCE",
      "live_transport":"SNAPSHOT_BASELINE",
      "mission":{
        "target":request.get("target") or "Unknown target",
        "aliases":request.get("aliases") or [],
        "date_range":request.get("date_range") or "",
        "purpose":request.get("purpose") or "Historical research operation",
        "research_focus":identity(request,request)['focus'] if request.get('target') else None,
        "status":"COMPLETED",
        "selected_lanes":int(summary.get("selected_lanes",len([a for a in agents if a["kind"]=="research_lane"])) or 0)
      },
      "metrics":{
        "agents":len(agents),
        "candidate_claims":len(claims),
        "retained_discoveries":len(discoveries),
        "repositories_attempted":len(coverage),
        "verified_events":sum(1 for c in claims if c.get("verified")),
        "specialist_discovery_records":specialist_records,
        "contradiction_search_records":contradiction_leads,
        "blocked_agents":sum(1 for a in agents if a.get("blocker_count",0)>0),
        "blocker_records":len(blockers)
      },
      "agents":agents,
      "claims":claims[:500],
      "discoveries":discoveries,
      "coverage":coverage,
      "evidence_url":f"https://github.com/Lepe12/geraki-historical-atlas/tree/main/evidence/runs/{run_id}",
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
        publish_latest(repo/a.latest,data,payload)
    print("COMMAND CENTER SNAPSHOT",data["run_id"],"agents",data["metrics"]["agents"],"claims",data["metrics"]["candidate_claims"],"specialist records",data["metrics"]["specialist_discovery_records"])
