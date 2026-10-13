#!/usr/bin/env python3
"""Persistent append-only research task history for JARVIS."""
from __future__ import annotations
import argparse,datetime,json
from pathlib import Path

TERMINAL={"COMPLETED","FAILED","CANCELLED","ABORTED"}

def record(path:Path,task_id:str,project:str,kind:str,status:str,*,agent_id:str="",run_id:str="",goal:str="",error:str="",artifacts=None,warnings=None):
    row={
      "schema":"pct-task-record-v1","recorded_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "task_id":task_id,"project":project,"kind":kind,"status":status.upper(),
      "agent_id":agent_id or None,"run_id":run_id or None,"goal":goal,
      "error":error[:2000],"artifacts":list(artifacts or []),"warnings":list(warnings or []),
      "terminal":status.upper() in TERMINAL
    }
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("a",encoding="utf-8") as fh: fh.write(json.dumps(row,ensure_ascii=False)+"\n")
    return row

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--path",type=Path,default=Path("evidence/jarvis/task_history.jsonl"))
    p.add_argument("--task-id",required=True);p.add_argument("--project",default="piratecartography");p.add_argument("--kind",required=True);p.add_argument("--status",required=True)
    p.add_argument("--agent-id",default="");p.add_argument("--run-id",default="");p.add_argument("--goal",default="");p.add_argument("--error",default="")
    a=p.parse_args();print(json.dumps(record(a.path,a.task_id,a.project,a.kind,a.status,agent_id=a.agent_id,run_id=a.run_id,goal=a.goal,error=a.error),ensure_ascii=False))
