#!/usr/bin/env python3
"""Run one specialist agent across registered discovery connectors."""
from __future__ import annotations
import argparse,json,sys
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/"connectors"))
sys.path.insert(0,str(ROOT/"orchestrator"))

from connector_registry import eligible
from connector_batch import run_batch
from jarvis_event_bus import emit
from jarvis_task_history import record

def run_one(agent:dict, connector_limit:int=3, run_id:str="local", event_root:Path|None=None, history_path:Path|None=None):
    connectors=eligible("search")[:connector_limit]
    items=[]
    for query in agent.get("queries",[]):
        for meta in connectors:
            items.append({"connector_id":meta["connector_id"],"query":query})

    event_root=event_root or Path("evidence/command_center")
    history_path=history_path or Path("evidence/jarvis/task_history.jsonl")
    task_id=f"{run_id}:{agent['agent_id']}"
    emit(event_root,"piratecartography",run_id,"agent_started",agent_id=agent["agent_id"],phase="connector_batch",percent=1,status="RUNNING")
    record(history_path,task_id,"piratecartography","specialist_research","RUNNING",agent_id=agent["agent_id"],run_id=run_id,goal=agent.get("label",""))

    try:
        outputs=run_batch(items,max_workers=min(8,max(1,len(items))),timeout=120)
        total=max(1,len(outputs))
        for index,data in enumerate(outputs,1):
            data["specialist_agent"]=agent["agent_id"]
            progress=int(index*90/total)
            emit(event_root,"piratecartography",run_id,"agent_progress",agent_id=agent["agent_id"],phase="connector_batch",percent=progress,status=str(data.get("status","")))
        result={
          "schema":"pct-specialist-agent-result-v2",
          "agent_id":agent["agent_id"],
          "label":agent.get("label"),
          "requested_outputs":agent.get("outputs",[]),
          "search_runs":outputs,
          "result_count":sum(len(x.get("records",[])) for x in outputs if isinstance(x,dict)),
          "verified_promotion_allowed":False,
          "rule":"Specialist discovery output is CANDIDATE/UNRESOLVED until scientific gates pass."
        }
        emit(event_root,"piratecartography",run_id,"agent_completed",agent_id=agent["agent_id"],phase="complete",percent=100,status="COMPLETED")
        record(history_path,task_id,"piratecartography","specialist_research","COMPLETED",agent_id=agent["agent_id"],run_id=run_id,goal=agent.get("label",""))
        return result
    except Exception as exc:
        emit(event_root,"piratecartography",run_id,"agent_failed",agent_id=agent["agent_id"],phase="failed",percent=100,status="FAILED",warnings=[str(exc)])
        record(history_path,task_id,"piratecartography","specialist_research","FAILED",agent_id=agent["agent_id"],run_id=run_id,goal=agent.get("label",""),error=str(exc))
        raise

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--plan",required=True);p.add_argument("--agent",required=True);p.add_argument("--output",required=True)
    p.add_argument("--connector-limit",type=int,default=3);p.add_argument("--run-id",default="local")
    p.add_argument("--event-root",default="evidence/command_center");p.add_argument("--history-path",default="evidence/jarvis/task_history.jsonl")
    a=p.parse_args()
    plan=json.loads(Path(a.plan).read_text(encoding="utf-8"))
    agent=next((x for x in plan.get("agents",[]) if x.get("agent_id")==a.agent),None)
    if not agent: raise SystemExit("SPECIALIST_AGENT_NOT_IN_PLAN")
    out=run_one(agent,a.connector_limit,a.run_id,Path(a.event_root),Path(a.history_path))
    dest=Path(a.output);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("SPECIALIST AGENT",a.agent,"runs",len(out["search_runs"]),"records",out["result_count"])
