#!/usr/bin/env python3
"""Evidence-versioned synthesis cache.

Cache keys bind question + role + model + prompt version + evidence hash.
Changing evidence automatically invalidates previous synthesis reuse.
"""
from __future__ import annotations
import argparse,hashlib,json
from pathlib import Path
from llm_router import route
from evidence_hash import evidence_hash

def cache_key(role:str,question:str,evidence:dict)->str:
    r=route(role)
    payload={
      "role":role,"question":" ".join(question.split()),"provider":r.provider,
      "model":r.model,"prompt_version":r.prompt_version,
      "evidence_hash":evidence_hash(evidence)
    }
    raw=json.dumps(payload,sort_keys=True,ensure_ascii=False,separators=(",",":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def load(cache_dir:Path,key:str):
    p=cache_dir/f"{key}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

def save(cache_dir:Path,key:str,record:dict):
    cache_dir.mkdir(parents=True,exist_ok=True)
    p=cache_dir/f"{key}.json"
    record={**record,"cache_key":key,"verified_promotion_allowed":False}
    p.write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return p

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--role",required=True);p.add_argument("--question",required=True);p.add_argument("--evidence",type=Path,required=True)
    a=p.parse_args();data=json.loads(a.evidence.read_text(encoding="utf-8"));print(cache_key(a.role,a.question,data))
