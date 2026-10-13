#!/usr/bin/env python3
"""Role-aware LLM router for Piratecartography.

The router is provider-agnostic. It selects configured models by research role,
records safety metadata, and exposes deterministic fallbacks when no provider
is configured. It never promotes historical claims.
"""
from __future__ import annotations
import json,os
from dataclasses import dataclass
from pathlib import Path

POLICY_PATH=Path(__file__).with_name("llm_policy.json")

@dataclass(frozen=True)
class Route:
    role:str
    provider:str
    model:str|None
    tier:str
    temperature:float
    max_output_tokens:int
    fallback:str|None
    requires_evidence:bool
    prompt_version:str

def load_policy(path:Path=POLICY_PATH)->dict:
    return json.loads(path.read_text(encoding="utf-8"))

def route(role:str,path:Path=POLICY_PATH)->Route:
    policy=load_policy(path)
    spec=policy.get("roles",{}).get(role)
    if not spec: raise KeyError("UNKNOWN_LLM_ROLE:"+role)
    provider=os.environ.get("PCT_LLM_PROVIDER",policy.get("default_provider","disabled")).strip() or "disabled"
    model=os.environ.get(spec.get("model_env",""),"").strip() or None
    fallback=(spec.get("fallbacks") or [None])[0]
    if provider=="disabled" or not model:
        provider="disabled";model=None
    return Route(
      role=role,provider=provider,model=model,tier=str(spec.get("tier","")),
      temperature=float(spec.get("temperature",0)),
      max_output_tokens=int(spec.get("max_output_tokens",2000)),
      fallback=fallback,requires_evidence=bool(spec.get("requires_evidence")),
      prompt_version=str(policy.get("prompt_version",""))
    )

def routing_summary()->dict:
    policy=load_policy()
    return {
      "schema":"pct-llm-routing-summary-v1",
      "prompt_version":policy.get("prompt_version"),
      "routes":{role:route(role).__dict__ for role in policy.get("roles",{})},
      "verified_promotion_allowed":False
    }

if __name__=="__main__":
    import argparse
    p=argparse.ArgumentParser();p.add_argument("--role");p.add_argument("--all",action="store_true")
    a=p.parse_args()
    out=routing_summary() if a.all else route(a.role).__dict__
    print(json.dumps(out,ensure_ascii=False,indent=2))
