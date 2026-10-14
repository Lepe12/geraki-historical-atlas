#!/usr/bin/env python3
"""Run one specialist agent through context-aware, auditable source routing."""
from __future__ import annotations
import argparse,json,sys,concurrent.futures
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/"connectors"))
sys.path.insert(0,str(ROOT/"orchestrator"))

from connector_batch import run_batch
from repository_connectors import dispatch as repository_dispatch
from jarvis_event_bus import emit
from jarvis_task_history import record
from jarvis_specialist_routing import plan_routes,select_queries

def _repository_call(repository:str,query:str,agent_id:str)->dict:
    try:
        status,records,diagnostic=repository_dispatch(repository,query,"specialist:"+agent_id)
        return {
          "connector_id":"repo:"+repository,
          "repository":repository,
          "operation":"search",
          "status":status,
          "query":query,
          "records":records if isinstance(records,list) else [],
          "diagnostic":diagnostic,
          "blockers":[] if status=="EXECUTED" else [{"code":status,"detail":str(diagnostic)[:1500]}],
          "warnings":[],
          "next_best_route":None,
          "evidence_level":"DISCOVERY_ONLY",
          "routing_mode":"repository_dispatch",
        }
    except Exception as exc:
        return {
          "connector_id":"repo:"+repository,
          "repository":repository,
          "operation":"search",
          "status":"FAILED",
          "query":query,
          "records":[],
          "diagnostic":type(exc).__name__+": "+str(exc),
          "blockers":[{"code":"EXECUTION_FAILED","detail":type(exc).__name__+": "+str(exc)}],
          "warnings":["Repository connector raised an exception."],
          "next_best_route":None,
          "evidence_level":"DISCOVERY_ONLY",
          "routing_mode":"repository_dispatch",
        }

def _run_repository_batch(items:list[dict],max_workers:int=6)->list[dict]:
    out=[]
    if not items:return out
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs=[
          ex.submit(_repository_call,x["repository"],x["query"],x["agent_id"])
          for x in items
        ]
        for f in concurrent.futures.as_completed(futs):
            try:out.append(f.result())
            except Exception as exc:
                out.append({"status":"FAILED","records":[],"error":str(exc),"evidence_level":"DISCOVERY_ONLY"})
    return out

def run_one(agent:dict, plan:dict, connector_limit:int=4, run_id:str="local", event_root:Path|None=None, history_path:Path|None=None):
    routes=plan_routes(agent,plan,connector_limit)
    queries=select_queries(agent.get("queries",[]),len(routes),total_budget=20)
    registry_items=[]
    repository_items=[]
    for route in routes:
        for query in queries:
            if route["route_type"]=="registered_connector":
                registry_items.append({"connector_id":route["connector_id"],"query":query})
            else:
                repository_items.append({"repository":route["repository"],"query":query,"agent_id":agent["agent_id"]})

    event_root=event_root or Path("evidence/command_center")
    history_path=history_path or Path("evidence/jarvis/task_history.jsonl")
    task_id=f"{run_id}:{agent['agent_id']}"
    route_labels=[x["route_id"] for x in routes]
    emit(event_root,"piratecartography",run_id,"agent_started",agent_id=agent["agent_id"],
         phase="source_routing",percent=1,status="RUNNING",
         detail="Selected routes: "+", ".join(route_labels))
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
            progress=int(index*90/total)
            connector=data.get("connector_id") or data.get("repository")
            emit(event_root,"piratecartography",run_id,"agent_progress",agent_id=agent["agent_id"],
                 phase="routed_discovery",percent=progress,status=str(data.get("status","")),
                 detail=str(connector or "source")+" "+str(data.get("query",""))[:250])
        result={
          "schema":"pct-specialist-agent-result-v3",
          "agent_id":agent["agent_id"],
          "label":agent.get("label"),
          "requested_outputs":agent.get("outputs",[]),
          "routing":{
            "strategy":"context_aware_deterministic_v1",
            "routes":routes,
            "queries_per_route":len(queries),
            "total_search_budget":len(routes)*len(queries),
            "rule":"Routing affects discovery priority only and never evidence state."
          },
          "search_runs":outputs,
          "result_count":sum(len(x.get("records",[])) for x in outputs if isinstance(x,dict)),
          "verified_promotion_allowed":False,
          "rule":"Specialist discovery output is CANDIDATE/UNRESOLVED until scientific gates pass."
        }
        emit(event_root,"piratecartography",run_id,"agent_completed",agent_id=agent["agent_id"],
             phase="complete",percent=100,status="COMPLETED",
             detail=f"{result['result_count']} discovery records from {len(routes)} routed sources")
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
    p.add_argument("--connector-limit",type=int,default=4);p.add_argument("--run-id",default="local")
    p.add_argument("--event-root",default="evidence/command_center");p.add_argument("--history-path",default="evidence/jarvis/task_history.jsonl")
    a=p.parse_args()
    plan=json.loads(Path(a.plan).read_text(encoding="utf-8"))
    agent=next((x for x in plan.get("agents",[]) if x.get("agent_id")==a.agent),None)
    if not agent: raise SystemExit("SPECIALIST_AGENT_NOT_IN_PLAN")
    out=run_one(agent,plan,a.connector_limit,a.run_id,Path(a.event_root),Path(a.history_path))
    dest=Path(a.output);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("SPECIALIST AGENT",a.agent,"routes",len(out["routing"]["routes"]),"runs",len(out["search_runs"]),"records",out["result_count"])
