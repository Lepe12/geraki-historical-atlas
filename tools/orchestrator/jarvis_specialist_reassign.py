#!/usr/bin/env python3
"""Build JARVIS second-wave specialist assignments from first-wave outcomes."""
from __future__ import annotations
import argparse,json
from pathlib import Path

def _read(path:Path):
    return json.loads(path.read_text(encoding="utf-8"))

def _status_counts(result:dict):
    counts={}
    for row in result.get("search_runs",[]) or []:
        s=str(row.get("status") or "UNKNOWN").upper()
        counts[s]=counts.get(s,0)+1
    return counts

def build_second_wave(plan:dict, results_by_agent:dict[str,dict], source_limit:int=2):
    agents=[]
    decisions=[]
    for agent in plan.get("agents",[]):
        aid=agent.get("agent_id")
        first=results_by_agent.get(aid)
        fallbacks=list(agent.get("fallback_sources") or [])
        if not first or not fallbacks:
            decisions.append({"agent_id":aid,"reassign":False,"reason":"NO_RESULT_OR_NO_FALLBACK"})
            continue
        count=int(first.get("result_count",0) or 0)
        statuses=_status_counts(first)
        executed=statuses.get("EXECUTED",0)+statuses.get("PARTIAL",0)
        blocked=sum(v for k,v in statuses.items() if k not in {"EXECUTED","PARTIAL"})
        reason=None
        if count==0 and executed==0:
            reason="NO_EXECUTED_SOURCE_AND_ZERO_RECORDS"
        elif count==0 and blocked>0:
            reason="ZERO_RECORDS_WITH_BLOCKERS"
        elif count==0:
            reason="ZERO_RECORDS"
        if not reason:
            decisions.append({"agent_id":aid,"reassign":False,"reason":"FIRST_WAVE_RETURNED_RECORDS","records":count})
            continue
        assigned=fallbacks[:source_limit]
        if not assigned:
            decisions.append({"agent_id":aid,"reassign":False,"reason":"FALLBACK_EXHAUSTED"})
            continue
        q=list(agent.get("assigned_queries") or agent.get("queries") or [])
        second={
          **agent,
          "assignment_id":aid+":wave2",
          "assignment_wave":2,
          "assigned_sources":assigned,
          "fallback_sources":fallbacks[source_limit:],
          "assigned_queries":q,
          "query_budget":{
            "total":len(assigned)*len(q),
            "max_total":len(assigned)*len(q),
            "queries_per_source":len(q),
          },
          "routing_decision":{
            "authority":"JARVIS_PLANNER",
            "strategy":"result_aware_fallback_v1",
            "selected_route_ids":[x["route_id"] for x in assigned],
            "fallback_route_ids":[x["route_id"] for x in fallbacks[source_limit:]],
            "trigger":reason,
            "first_wave_status_counts":statuses,
            "first_wave_records":count,
            "evidence_effect":"NONE_DISCOVERY_PRIORITY_ONLY",
          }
        }
        agents.append(second)
        decisions.append({"agent_id":aid,"reassign":True,"reason":reason,"assigned":[x["route_id"] for x in assigned]})
    out={
      **{k:v for k,v in plan.items() if k!="agents"},
      "schema":"pct-specialist-agent-plan-v2",
      "routing_authority":"JARVIS_PLANNER",
      "assignment_wave":2,
      "agents":agents,
      "parallel_agent_count":len(agents),
      "reassignment_decisions":decisions,
      "rule":"JARVIS alone assigns second-wave fallback sources after evaluating first-wave outcomes."
    }
    return out

def load_results(root:Path):
    results={}
    for f in root.glob("**/result.json"):
        try:d=_read(f)
        except Exception:continue
        aid=d.get("agent_id")
        if aid and int(d.get("assignment_wave",1) or 1)==1:
            results[aid]=d
    return results

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--plan",required=True);p.add_argument("--results-root",required=True);p.add_argument("--output",required=True)
    a=p.parse_args()
    out=build_second_wave(_read(Path(a.plan)),load_results(Path(a.results_root)))
    Path(a.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("JARVIS SECOND WAVE",len(out["agents"]),"agents")
