#!/usr/bin/env python3
"""Aggregate specialist-agent outputs conservatively."""
from __future__ import annotations
import argparse,json,datetime
from pathlib import Path

def main():
    p=argparse.ArgumentParser();p.add_argument("--root",required=True);p.add_argument("--output",required=True)
    a=p.parse_args();root=Path(a.root)
    agents=[];total_records=0;blockers=[]
    for f in sorted(root.glob("*/result.json")):
        d=json.loads(f.read_text(encoding="utf-8"))
        total_records+=int(d.get("result_count",0) or 0)
        agent_blockers=[]
        for run in d.get("search_runs",[]):
            for b in run.get("blockers",[]) or []:
                agent_blockers.append({"connector_id":run.get("connector_id"),**b})
        blockers.extend([{"agent_id":d.get("agent_id"),**b} for b in agent_blockers])
        agents.append({
          "agent_id":d.get("agent_id"),
          "label":d.get("label"),
          "search_runs":len(d.get("search_runs",[])),
          "records":d.get("result_count",0),
          "blockers":agent_blockers,
          "requested_outputs":d.get("requested_outputs",[])
        })
    out={
      "schema":"pct-specialist-agent-aggregate-v1",
      "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "agent_count":len(agents),
      "total_discovered_records":total_records,
      "agents":agents,
      "blockers":blockers,
      "verified_events":0,
      "rule":"Aggregate counts discovery records only. No specialist output is VERIFIED by aggregation."
    }
    dest=Path(a.output);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("SPECIALIST AGGREGATE agents",len(agents),"records",total_records,"blockers",len(blockers))
if __name__=="__main__":main()
