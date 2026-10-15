#!/usr/bin/env python3
"""JARVIS planner for parallel specialist historical-research assignments.

The planner owns source selection. Workers are executors and must not choose
their own repositories/connectors.
"""
from __future__ import annotations
import argparse,json,re
from pathlib import Path

REG=Path(__file__).with_name("specialist_agent_registry.json")

from jarvis_specialist_routing import plan_routes,select_queries

try:
    from naboux_memory import load as load_memory, successful_queries, retrieve
except Exception:
    load_memory=successful_queries=retrieve=None

SOURCE_LIMIT=4
FALLBACK_LIMIT=4
TOTAL_QUERY_BUDGET=20

def load_registry():
    return json.loads(REG.read_text(encoding="utf-8"))

def infer_kind(target:str,purpose:str,explicit:str="auto")->str:
    if explicit and explicit!="auto":
        return explicit
    blob=(target+" "+purpose).lower()
    if any(x in blob for x in ("biography","born","died","captain","pirate ","corsair ","privateer ")):
        return "person"
    if any(x in blob for x in ("base","anchorage","harbour","harbor","port","island","cave","fort","ormitir","ορμητ")):
        return "place"
    return "all"

def select_agents(kind:str):
    reg=load_registry()["agents"]
    chosen=[]
    for aid,meta in reg.items():
        kinds=set(meta.get("task_kinds",[]))
        if "all" in kinds or kind in kinds:
            chosen.append((meta.get("priority",999),aid))
    return [aid for _,aid in sorted(chosen)]

def render_queries(agent_id:str,target:str,date_range:str="",aliases:list[str]|None=None):
    reg=load_registry()["agents"][agent_id]
    aliases=aliases or []
    ctx={"target":target,"date_range":date_range or "","aliases":" | ".join(aliases)}
    out=[]
    for template in reg.get("query_families",[]):
        q=re.sub(r"\s+"," ",template.format(**ctx)).strip()
        if q not in out: out.append(q)
    for alias in aliases[:3]:
        q=(f'"{alias}" {date_range}').strip()
        if q not in out: out.append(q)
    return out[:int(reg.get("max_queries",8))]

def build(target,purpose,date_range="",aliases=None,target_type="auto"):
    aliases=list(aliases or [])
    kind=infer_kind(target,purpose,target_type)
    memory=None
    memory_context=[]
    if load_memory:
        try:
            memory=load_memory()
            memory_context=retrieve(memory,target+" "+purpose,limit=6) if retrieve else []
        except Exception:
            memory=None
            memory_context=[]
    agent_ids=select_agents(kind)
    reg=load_registry()["agents"]
    plan={
      "schema":"pct-specialist-agent-plan-v2",
      "routing_authority":"JARVIS_PLANNER",
      "target":target,
      "aliases":aliases,
      "target_type":kind,
      "date_range":date_range,
      "purpose":purpose,
      "source_limit_per_agent":SOURCE_LIMIT,
      "fallback_limit_per_agent":FALLBACK_LIMIT,
      "total_query_budget_per_agent":TOTAL_QUERY_BUDGET,
      "agents":[],
      "parallel_agent_count":len(agent_ids),
      "verified_promotion_allowed":False,
      "memory_context":memory_context,
      "memory_policy":"Persistent memory is retrieval/routing assistance only; it never verifies a historical claim.",
      "rule":"JARVIS assigns sources before execution. Specialist workers execute the assignment and may not self-route."
    }
    for aid in agent_ids:
        meta=reg[aid]
        queries=render_queries(aid,target,date_range,aliases)
        if memory is not None and successful_queries:
            try:
                learned=successful_queries(memory,aid,limit=4)
                for q in learned:
                    if target.casefold() in q.casefold() and q not in queries:
                        queries.append(q)
                queries=queries[:int(meta.get("max_queries",8))]
            except Exception:
                pass
        draft={
          "agent_id":aid,
          "label":meta["label"],
          "queries":queries,
          "outputs":meta.get("outputs",[]),
          "source_routes":meta.get("source_routes",[]),
        }
        ranked=plan_routes(draft,plan,limit=SOURCE_LIMIT+FALLBACK_LIMIT)
        assigned=ranked[:SOURCE_LIMIT]
        fallbacks=ranked[SOURCE_LIMIT:SOURCE_LIMIT+FALLBACK_LIMIT]
        assigned_queries=select_queries(queries,len(assigned),TOTAL_QUERY_BUDGET)
        plan["agents"].append({
          **draft,
          "assignment_id":aid+":wave1",
          "assignment_wave":1,
          "assigned_sources":assigned,
          "fallback_sources":fallbacks,
          "assigned_queries":assigned_queries,
          "query_budget":{
            "total":len(assigned)*len(assigned_queries),
            "max_total":TOTAL_QUERY_BUDGET,
            "queries_per_source":len(assigned_queries),
          },
          "routing_decision":{
            "authority":"JARVIS_PLANNER",
            "strategy":"context_aware_deterministic_v1",
            "selected_route_ids":[x["route_id"] for x in assigned],
            "fallback_route_ids":[x["route_id"] for x in fallbacks],
            "evidence_effect":"NONE_DISCOVERY_PRIORITY_ONLY",
          }
        })
    return plan

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--target",required=True);p.add_argument("--purpose",default="")
    p.add_argument("--date-range",default="");p.add_argument("--aliases",default="")
    p.add_argument("--target-type",choices=["auto","person","place","event","all"],default="auto")
    p.add_argument("--output")
    a=p.parse_args()
    out=build(a.target,a.purpose,a.date_range,[x.strip() for x in a.aliases.split("|") if x.strip()],a.target_type)
    payload=json.dumps(out,ensure_ascii=False,indent=2)+"\n"
    if a.output: Path(a.output).write_text(payload,encoding="utf-8")
    else: print(payload,end="")
