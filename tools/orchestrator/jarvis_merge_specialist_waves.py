#!/usr/bin/env python3
"""Merge first- and second-wave specialist results without hiding either wave."""
from __future__ import annotations
import argparse,json
from pathlib import Path

def read_results(root:Path):
    out={}
    if not root.exists():return out
    for f in root.glob("**/result.json"):
        try:d=json.loads(f.read_text(encoding="utf-8"))
        except Exception:continue
        aid=d.get("agent_id")
        if aid:out.setdefault(aid,[]).append(d)
    return out

def merge_agent(rows:list[dict]):
    rows=sorted(rows,key=lambda x:int(x.get("assignment_wave",1) or 1))
    if len(rows)==1:return rows[0]
    first=rows[0]
    merged={
      "schema":"pct-specialist-agent-result-v5",
      "agent_id":first.get("agent_id"),
      "label":first.get("label"),
      "assignment_waves":[{
        "assignment_id":r.get("assignment_id"),
        "assignment_wave":r.get("assignment_wave"),
        "routing":r.get("routing"),
        "result_count":r.get("result_count",0)
      } for r in rows],
      "requested_outputs":first.get("requested_outputs",[]),
      "search_runs":[x for r in rows for x in (r.get("search_runs",[]) or [])],
      "result_count":sum(int(r.get("result_count",0) or 0) for r in rows),
      "verified_promotion_allowed":False,
      "rule":"Merged discovery preserves every JARVIS assignment wave; aggregation never verifies historical claims."
    }
    return merged

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--first-root",required=True);p.add_argument("--second-root",required=False,default="");p.add_argument("--output-root",required=True)
    a=p.parse_args()
    grouped=read_results(Path(a.first_root))
    second=read_results(Path(a.second_root)) if a.second_root else {}
    for aid,rows in second.items():grouped.setdefault(aid,[]).extend(rows)
    outroot=Path(a.output_root);outroot.mkdir(parents=True,exist_ok=True)
    for aid,rows in grouped.items():
        d=merge_agent(rows);dest=outroot/aid/"result.json";dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_text(json.dumps(d,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("MERGED SPECIALIST AGENTS",len(grouped))
