#!/usr/bin/env python3
"""Read-only WebSocket command-center adapter for JARVIS research events."""
from __future__ import annotations
import asyncio,json,re
from pathlib import Path
try:
    from fastapi import FastAPI,WebSocket,WebSocketDisconnect,HTTPException
except ImportError as exc:
    raise SystemExit("Install fastapi and uvicorn to run command center server") from exc
from project_scope import validate_project

ROOT=Path("evidence/command_center")
SPECIALIST_ROOT=Path("evidence/specialist_runs")
SAFE_RUN=re.compile(r"^[A-Za-z0-9_.:-]+$")
app=FastAPI(title="Piratecartography JARVIS Command Center",docs_url=None,redoc_url=None)

def resolve_run_id(project:str,run_id:str)->str:
    validate_project(project)
    if run_id!="latest":
        if not SAFE_RUN.match(run_id): raise HTTPException(400,"invalid run id")
        return run_id
    candidates=[]
    p=ROOT/project
    if p.exists():
        candidates += [x.name for x in p.iterdir() if x.is_dir() and SAFE_RUN.match(x.name)]
    if project=="piratecartography" and SPECIALIST_ROOT.exists():
        candidates += [x.name for x in SPECIALIST_ROOT.iterdir() if x.is_dir() and SAFE_RUN.match(x.name)]
    if not candidates: return "latest"
    def key(v):
        try:return (1,int(v))
        except ValueError:return (0,v)
    return sorted(set(candidates),key=key)[-1]

def event_files(project:str,run_id:str)->list[Path]:
    run_id=resolve_run_id(project,run_id)
    files=[]
    direct=ROOT/project/run_id/"events.jsonl"
    if direct.exists(): files.append(direct)
    if project=="piratecartography":
        specialist=SPECIALIST_ROOT/run_id
        if specialist.exists():
            files += sorted(specialist.glob("raw_agents/**/events.jsonl"))
    return files

def read_events(project:str,run_id:str,limit:int=500)->list[dict]:
    out=[]
    for path in event_files(project,run_id):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip(): continue
            try: out.append(json.loads(line))
            except json.JSONDecodeError: continue
    out.sort(key=lambda x:x.get("created_utc",""))
    return out[-limit:]

@app.get("/status/{project}/{run_id}")
def status(project:str,run_id:str):
    actual=resolve_run_id(project,run_id)
    return {"project":project,"run_id":actual,"events":read_events(project,actual,500)}

@app.websocket("/ws/{project}/{run_id}")
async def ws(websocket:WebSocket,project:str,run_id:str):
    await websocket.accept()
    actual=resolve_run_id(project,run_id)
    sent=set()
    try:
        while True:
            for event in read_events(project,actual,500):
                eid=event.get("event_id") or json.dumps(event,sort_keys=True)
                if eid in sent: continue
                sent.add(eid)
                await websocket.send_json(event)
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        return

if __name__=="__main__":
    import uvicorn
    uvicorn.run(app,host="127.0.0.1",port=8765)
