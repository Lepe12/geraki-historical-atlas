#!/usr/bin/env python3
"""Plan parallel specialist agents for a Piratecartography research request."""
from __future__ import annotations
import argparse,json,re
from pathlib import Path

REG=Path(__file__).with_name("specialist_agent_registry.json")

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
    ctx={
      "target":target,
      "date_range":date_range or "",
      "aliases":" | ".join(aliases)
    }
    out=[]
    for template in reg.get("query_families",[]):
        q=template.format(**ctx)
        q=re.sub(r"\s+"," ",q).strip()
        if q not in out: out.append(q)
    for alias in aliases[:3]:
        q=(f'"{alias}" {date_range}').strip()
        if q not in out: out.append(q)
    return out[:int(reg.get("max_queries",8))]

def build(target,purpose,date_range="",aliases=None,target_type="auto"):
    kind=infer_kind(target,purpose,target_type)
    agents=select_agents(kind)
    return {
      "schema":"pct-specialist-agent-plan-v1",
      "target":target,
      "target_type":kind,
      "date_range":date_range,
      "purpose":purpose,
      "agents":[{
         "agent_id":aid,
         "label":load_registry()["agents"][aid]["label"],
         "queries":render_queries(aid,target,date_range,aliases or []),
         "outputs":load_registry()["agents"][aid].get("outputs",[]),
         "source_routes":load_registry()["agents"][aid].get("source_routes",[])
      } for aid in agents],
      "parallel_agent_count":len(agents),
      "verified_promotion_allowed":False
    }

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
