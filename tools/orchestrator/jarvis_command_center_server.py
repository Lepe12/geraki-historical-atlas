#!/usr/bin/env python3
"""Optional WebSocket/SSE-ready command-center adapter.

Runs only when FastAPI/uvicorn are explicitly installed. It tails project/run
event streams created by jarvis_event_bus.py. No research mutation endpoints.
"""
from __future__ import annotations
import asyncio,json
from pathlib import Path
try:
    from fastapi import FastAPI,WebSocket,WebSocketDisconnect,HTTPException
except ImportError as exc:
    raise SystemExit("Install fastapi and uvicorn to run command center server") from exc
from project_scope import validate_project

ROOT=Path("evidence/command_center")
app=FastAPI(title="Piratecartography JARVIS Command Center",docs_url=None,redoc_url=None)

def event_path(project:str,run_id:str)->Path:
    project=validate_project(project)
    if not run_id.replace("-","").replace("_","").isalnum(): raise HTTPException(400,"invalid run id")
    return ROOT/project/run_id/"events.jsonl"

@app.get("/status/{project}/{run_id}")
def status(project:str,run_id:str):
    path=event_path(project,run_id)
    if not path.exists(): return {"project":project,"run_id":run_id,"events":[]}
    lines=path.read_text(encoding="utf-8").splitlines()
    events=[json.loads(x) for x in lines[-100:] if x.strip()]
    return {"project":project,"run_id":run_id,"events":events}

@app.websocket("/ws/{project}/{run_id}")
async def ws(websocket:WebSocket,project:str,run_id:str):
    await websocket.accept()
    path=event_path(project,run_id);pos=0
    try:
        while True:
            if path.exists():
                lines=path.read_text(encoding="utf-8").splitlines()
                while pos<len(lines):
                    if lines[pos].strip(): await websocket.send_json(json.loads(lines[pos]))
                    pos+=1
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        return

if __name__=="__main__":
    import uvicorn
    uvicorn.run(app,host="127.0.0.1",port=8765)
