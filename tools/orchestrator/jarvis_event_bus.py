#!/usr/bin/env python3
"""Append-only JARVIS research event bus.

Host/UI adapters can tail the JSONL stream and publish it over WebSocket/SSE.
The core stays dependency-free and project/run scoped.
"""
from __future__ import annotations
import argparse,datetime,json,re
from pathlib import Path

SAFE=re.compile(r"^[A-Za-z0-9_.:-]+$")

def _safe(v:str,name:str)->str:
    v=str(v or "").strip()
    if not v or not SAFE.match(v): raise ValueError("INVALID_"+name.upper())
    return v

def emit(root:Path,project:str,run_id:str,event_type:str,*,agent_id:str="",phase:str="",percent:int|None=None,status:str="",artifacts=None,warnings=None,detail:str="")->dict:
    project=_safe(project,"project"); run_id=_safe(run_id,"run_id"); event_type=_safe(event_type,"event_type")
    if agent_id: _safe(agent_id,"agent_id")
    event={
      "schema":"pct-jarvis-event-v1",
      "event_id":datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ"),
      "created_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "project":project,"run_id":run_id,"event_type":event_type,
      "agent_id":agent_id or None,"phase":phase or None,
      "percent":None if percent is None else max(0,min(100,int(percent))),
      "status":status or None,"artifacts":list(artifacts or []),
      "warnings":list(warnings or []),"detail":str(detail or "")[:2000]
    }
    path=root/project/run_id/"events.jsonl";path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("a",encoding="utf-8") as fh: fh.write(json.dumps(event,ensure_ascii=False)+"\n")
    return event

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--root",type=Path,default=Path("evidence/command_center"))
    p.add_argument("--project",default="piratecartography");p.add_argument("--run-id",required=True);p.add_argument("--event-type",required=True)
    p.add_argument("--agent-id",default="");p.add_argument("--phase",default="");p.add_argument("--percent",type=int);p.add_argument("--status",default="");p.add_argument("--detail",default="")
    a=p.parse_args(); print(json.dumps(emit(a.root,a.project,a.run_id,a.event_type,agent_id=a.agent_id,phase=a.phase,percent=a.percent,status=a.status,detail=a.detail),ensure_ascii=False))
