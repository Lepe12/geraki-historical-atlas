#!/usr/bin/env python3
"""Execute one JARVIS specialist assignment without self-routing."""
from __future__ import annotations
import argparse,json,sys,concurrent.futures
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/"connectors"))
sys.path.insert(0,str(ROOT/"orchestrator"))

from connector_batch import run_batch
from repository_connectors import audited_dispatch as repository_dispatch
from jarvis_event_bus import emit
from jarvis_task_history import record
from jarvis_runtime_guard import validate_specialist_assignment

def _repository_call(repository:str,query:str,agent_id:str)->dict:
    try:
        status,records,diagnostic=repository_dispatch(repository,query,"specialist:"+agent_id)
        return {
          "connector_id":"repo:"+repository,"repository":repository,"operation":"search",
          "status":status,"query":query,"records":records if isinstance(records,list) else [],
          "diagnostic":diagnostic,
          "blockers":[] if status=="EXECUTED" else [{"code":status,"detail":str(diagnostic)[:1500]}],
          "warnings":[],"next_best_route":None,"evidence_level":"DISCOVERY_ONLY",
          "routing_mode":"repository_dispatch",
        }
    except Exception as exc:
        return {
          "connector_id":"repo:"+repository,"repository":repository,"operation":"search",
          "status":"FAILED","query":query,"records":[],
          "diagnostic":type(exc).__name__+": "+str(exc),
          "blockers":[{"code":"EXECUTION_FAILED","detail":type(exc).__name__+": "+str(exc)}],
          "warnings":["Repository connector raised an exception."],"next_best_route":None,
          "evidence_level":"DISCOVERY_ONLY","routing_mode":"repository_dispatch",
        }

def _run_repository_batch(items:list[dict],max_workers:int=6)->list[dict]:
    out=[]
    if not items:return out
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs=[ex.submit(_repository_call,x["repository"],x["query"],x["agent_id"]) for x in items]
        for f in concurrent.futures.as_completed(futs):
            try:out.append(f.result())
            except Exception as exc:
                out.append({"status":"FAILED","records":[],"error":str(exc),"evidence_level":"DISCOVERY_ONLY"})
    return out

def _assignment(agent:dict, plan:dict):
    permit=validate_specialist_assignment(plan,agent)
    routes=agent.get("assigned_sources")
    queries=agent.get("assigned_queries")
    return routes,queries,permit

def run_one(agent:dict, plan:dict, run_id:str="local", event_root:Path|None=None, history_path:Path|None=None):
    if plan.get("routing_authority")!="JARVIS_PLANNER":
        raise RuntimeError("JARVIS_PLANNER_AUTHORITY_REQUIRED")
    routes,queries,permit=_assignment(agent,plan)
    registry_items=[];repository_items=[]
    for route in routes:
        for query in queries:
            if route["route_type"]=="registered_connector":
                registry_items.append({"connector_id":route["connector_id"],"query":query})
            else:
                repository_items.append({"repository":route["repository"],"query":query,"agent_id":agent["agent_id"]})

    event_root=event_root or Path("evidence/command_center")
    history_path=history_path or Path("evidence/jarvis/task_history.jsonl")
    task_id=f"{run_id}:{agent['agent_id']}:wave{agent.get('assignment_wave',1)}"
    route_labels=[x["route_id"] for x in routes]
    emit(event_root,"piratecartography",run_id,"agent_started",agent_id=agent["agent_id"],
         phase="jarvis_assignment_execution",percent=1,status="RUNNING",
         detail="JARVIS assignment "+str(agent.get("assignment_id"))+": "+", ".join(route_labels))
    record(history_path,task_id,"piratecartography","specialist_research","RUNNING",
           agent_id=agent["agent_id"],run_id=run_id,goal=agent.get("label",""))

    try:
        outputs=[]
        if registry_items:
            outputs.extend(run_batch(registry_items,max_workers=min(6,max(1,len(registry_items))),timeout=120))
        if repository_items:
            outputs.extend(_run_repository_batch(repository_items,max_workers=min(6,max(1,len(repository_items)))))
        total=max(1,len(outputs))
        for index,data in enumerate(outputs,1):
            data["specialist_agent"]=agent["agent_id"]
            data["assignment_id"]=agent.get("assignment_id")
            data["assignment_wave"]=agent.get("assignment_wave",1)
            progress=int(index*90/total)
            connector=data.get("connector_id") or data.get("repository")
            emit(event_root,"piratecartography",run_id,"agent_progress",agent_id=agent["agent_id"],
                 phase="assigned_discovery",percent=progress,status=str(data.get("status","")),
                 detail=str(connector or "source")+" "+str(data.get("query",""))[:250])
        result={
          "schema":"pct-specialist-agent-result-v4",
          "agent_id":agent["agent_id"],"label":agent.get("label"),
          "assignment_id":agent.get("assignment_id"),"assignment_wave":agent.get("assignment_wave",1),
          "requested_outputs":agent.get("outputs",[]),
          "runtime_permit":permit,
          "routing":{
            "authority":"JARVIS_PLANNER",
            "strategy":agent.get("routing_decision",{}).get("strategy","preassigned"),
            "routes":routes,
            "fallback_sources_not_executed":agent.get("fallback_sources",[]),
            "queries_per_route":len(queries),
            "total_search_budget":len(routes)*len(queries),
            "worker_self_routing":False,
            "rule":"Worker executes only JARVIS-assigned sources; routing has no evidence effect."
          },
          "search_runs":outputs,
          "result_count":sum(len(x.get("records",[])) for x in outputs if isinstance(x,dict)),
          "verified_promotion_allowed":False,
          "rule":"Specialist discovery output is CANDIDATE/UNRESOLVED until scientific gates pass."
        }
        emit(event_root,"piratecartography",run_id,"agent_completed",agent_id=agent["agent_id"],
             phase="assignment_complete",percent=100,status="COMPLETED",
             detail=f"{result['result_count']} discovery records; permit {permit['permit_id'][:12]}")
        record(history_path,task_id,"piratecartography","specialist_research","COMPLETED",
               agent_id=agent["agent_id"],run_id=run_id,goal=agent.get("label",""))
        return result
    except Exception as exc:
        emit(event_root,"piratecartography",run_id,"agent_failed",agent_id=agent["agent_id"],
             phase="failed",percent=100,status="FAILED",warnings=[str(exc)])
        record(history_path,task_id,"piratecartography","specialist_research","FAILED",
               agent_id=agent["agent_id"],run_id=run_id,goal=agent.get("label",""),error=str(exc))
        raise

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--plan",required=True);p.add_argument("--agent",required=True);p.add_argument("--output",required=True)
    p.add_argument("--run-id",default="local")
    p.add_argument("--event-root",default="evidence/command_center");p.add_argument("--history-path",default="evidence/jarvis/task_history.jsonl")
    a=p.parse_args()
    plan=json.loads(Path(a.plan).read_text(encoding="utf-8"))
    agent=next((x for x in plan.get("agents",[]) if x.get("agent_id")==a.agent),None)
    if not agent: raise SystemExit("SPECIALIST_AGENT_NOT_IN_PLAN")
    out=run_one(agent,plan,a.run_id,Path(a.event_root),Path(a.history_path))
    dest=Path(a.output);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("SPECIALIST AGENT",a.agent,"assignment",out["assignment_id"],"runs",len(out["search_runs"]),"records",out["result_count"])
