#!/usr/bin/env python3
"""Connector registry and capability router for JARVIS."""
from __future__ import annotations
import json
from pathlib import Path

REGISTRY_PATH=Path(__file__).with_name("connector_registry.json")

def load_registry(path:Path=REGISTRY_PATH)->dict:
    return json.loads(path.read_text(encoding="utf-8"))

def connector(connector_id:str, path:Path=REGISTRY_PATH)->dict:
    reg=load_registry(path)
    item=reg.get("connectors",{}).get(connector_id)
    if not item:
        raise KeyError("UNKNOWN_CONNECTOR")
    return item

def eligible(operation:str, *, repository:str|None=None, path:Path=REGISTRY_PATH)->list[dict]:
    reg=load_registry(path)
    out=[]
    for cid,item in reg.get("connectors",{}).items():
        if repository and repository.lower() not in str(item.get("repository","")).lower():
            continue
        if item.get("capabilities",{}).get(operation) is True:
            out.append({"connector_id":cid,**item})
    return sorted(out,key=lambda x:(x.get("priority",999),x["connector_id"]))

def next_route(connector_id:str, failure_code:str, path:Path=REGISTRY_PATH)->str|None:
    item=connector(connector_id,path)
    routes=item.get("fallbacks",{})
    return routes.get(failure_code) or routes.get("*")
