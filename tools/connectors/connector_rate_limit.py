#!/usr/bin/env python3
"""Per-connector concurrency and pacing controls for local/batch execution."""
from __future__ import annotations
import json,threading,time
from pathlib import Path

CFG=Path(__file__).with_name("connector_limits.json")
_lock=threading.Lock()
_semaphores={}
_last_call={}

def config(connector_id:str):
    d=json.loads(CFG.read_text(encoding="utf-8"))
    return d.get("connectors",{}).get(connector_id,d.get("default",{"max_concurrent":1,"min_interval_seconds":1.0}))

def semaphore(connector_id:str):
    with _lock:
        if connector_id not in _semaphores:
            _semaphores[connector_id]=threading.BoundedSemaphore(int(config(connector_id)["max_concurrent"]))
        return _semaphores[connector_id]

class ConnectorLease:
    def __init__(self,connector_id:str):
        self.connector_id=connector_id;self.sem=semaphore(connector_id)
    def __enter__(self):
        self.sem.acquire()
        wait=float(config(self.connector_id).get("min_interval_seconds",0))
        with _lock:
            prior=_last_call.get(self.connector_id,0.0)
        delay=max(0.0,wait-(time.monotonic()-prior))
        if delay: time.sleep(delay)
        return self
    def __exit__(self,*_):
        with _lock: _last_call[self.connector_id]=time.monotonic()
        self.sem.release()
