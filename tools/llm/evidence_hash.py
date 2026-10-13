#!/usr/bin/env python3
"""Canonical evidence hashing for evidence-versioned LLM work."""
from __future__ import annotations
import argparse,hashlib,json
from pathlib import Path
from typing import Any

VOLATILE={"generated_utc","retrieved_utc","recorded_utc","event_id","created_utc"}

def normalize(value:Any):
    if isinstance(value,dict):
        return {k:normalize(v) for k,v in sorted(value.items()) if k not in VOLATILE}
    if isinstance(value,list):
        normalized=[normalize(v) for v in value]
        try:return sorted(normalized,key=lambda x:json.dumps(x,sort_keys=True,ensure_ascii=False))
        except Exception:return normalized
    if isinstance(value,str): return " ".join(value.split())
    return value

def evidence_hash(value:Any)->str:
    raw=json.dumps(normalize(value),sort_keys=True,ensure_ascii=False,separators=(",",":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("input",type=Path)
    a=p.parse_args();print(evidence_hash(json.loads(a.input.read_text(encoding="utf-8"))))
