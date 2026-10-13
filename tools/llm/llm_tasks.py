#!/usr/bin/env python3
"""Planner/query/extraction/replanning LLM tasks with deterministic fallbacks."""
from __future__ import annotations
import argparse,json,re
from pathlib import Path
from llm_client import call
from prompt_builders import planner_prompt,query_expander_prompt,extractor_prompt,replan_prompt
from llm_router import route

def _json_content(result:dict):
    if result.get("status")!="COMPLETED": return None
    text=str(result.get("content","")).strip()
    if text.startswith("```"):
        text=re.sub(r"^```(?:json)?\s*|\s*```$","",text,flags=re.I|re.S)
    try:return json.loads(text)
    except Exception:return None

def deterministic_query_expander(target:str,aliases:list[str],date_range:str,languages:list[str]):
    terms=[target,*aliases]
    suffixes=["pirate corsair","archive records","harbour anchorage","ship captain","trial ransom captivity"]
    out=[]
    for term in terms:
        for suffix in suffixes:
            q=" ".join(x for x in [f'"{term}"',date_range,suffix] if x).strip()
            if q not in [x["query"] for x in out]:
                out.append({"query":q,"language":"und","rationale":"deterministic source-discovery variant","status":"PROPOSED"})
    return {"query_variants":out[:20],"fallback":"deterministic_query_expander"}

def run_query_expander(target:str,aliases:list[str],date_range:str,languages:list[str]):
    result=call("query_expander",query_expander_prompt(target,aliases,date_range,languages))
    parsed=_json_content(result)
    if parsed is not None:
        parsed["verified_promotion_allowed"]=False
        return parsed
    return {**deterministic_query_expander(target,aliases,date_range,languages),"verified_promotion_allowed":False}

def deterministic_planner(target:str,purpose:str,agents:list[str],connectors:list[str]):
    return {
      "research_threads":[
        {"thread":"identity_and_aliases","parallel":True},
        {"thread":"primary_source_discovery","parallel":True},
        {"thread":"chronology","parallel":True},
        {"thread":"contradictions","parallel":True}
      ],
      "selected_agents":agents,
      "selected_connectors":connectors,
      "stop_conditions":["no registered route remains","human review required"],
      "risks":["name collision","derivative sources","catalogue metadata mistaken for original evidence"],
      "fallback":"deterministic_planner",
      "verified_promotion_allowed":False
    }

def run_planner(target:str,purpose:str,agents:list[str],connectors:list[str]):
    result=call("planner",planner_prompt(target,purpose,agents,connectors))
    parsed=_json_content(result)
    if parsed is not None:
        parsed["verified_promotion_allowed"]=False
        return parsed
    return deterministic_planner(target,purpose,agents,connectors)

def source_first_extractor(scope:str,evidence:dict):
    items=[]
    records=evidence.get("records",[]) if isinstance(evidence,dict) else []
    for i,rec in enumerate(records):
        items.append({
          "source_id":rec.get("source_id") or rec.get("id") or f"record-{i+1}",
          "exact_locator":rec.get("exact_locator"),
          "source_says":rec.get("source_says") or rec.get("transcription") or rec.get("quote"),
          "quote_or_transcription_if_supplied":rec.get("transcription") or rec.get("quote"),
          "entities":rec.get("entities",[]),"dates":rec.get("dates",[]),
          "uncertainty":["MODEL_EXTRACTION_UNAVAILABLE"],"limitations":["SOURCE_FIRST_ONLY"]
        })
    return {"extracted_items":items,"fallback":"source_first_extractor","verified_promotion_allowed":False}

def run_extractor(scope:str,evidence:dict):
    result=call("evidence_extractor",extractor_prompt(scope,evidence))
    parsed=_json_content(result)
    if parsed is not None:
        parsed["verified_promotion_allowed"]=False
        return parsed
    return source_first_extractor(scope,evidence)

def registered_route_replan(goal:str,failures:list[dict],allowed_routes:list[str]):
    failed={str(x.get("route")) for x in failures if x.get("route")}
    remaining=[x for x in allowed_routes if x not in failed]
    return {
      "next_steps":[{"route":x,"action":"TRY_REGISTERED_ROUTE"} for x in remaining[:3]],
      "route_changes":remaining[:3],
      "stop_conditions":["no registered routes remain"],
      "fallback":"registered_route_replan",
      "verified_promotion_allowed":False
    }

def run_replanner(goal:str,failures:list[dict],allowed_routes:list[str]):
    result=call("replanner",replan_prompt(goal,failures,allowed_routes))
    parsed=_json_content(result)
    if parsed is not None:
        illegal=[x for x in parsed.get("route_changes",[]) if x not in allowed_routes]
        if not illegal:
            parsed["verified_promotion_allowed"]=False
            return parsed
    return registered_route_replan(goal,failures,allowed_routes)

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("task",choices=["planner","query_expander","extractor","replanner"])
    p.add_argument("--input",type=Path,required=True);p.add_argument("--output",type=Path,required=True)
    a=p.parse_args();d=json.loads(a.input.read_text(encoding="utf-8"))
    if a.task=="planner": out=run_planner(d["target"],d.get("purpose",""),d.get("agents",[]),d.get("connectors",[]))
    elif a.task=="query_expander": out=run_query_expander(d["target"],d.get("aliases",[]),d.get("date_range",""),d.get("languages",[]))
    elif a.task=="extractor": out=run_extractor(d.get("claim_scope",""),d.get("evidence",{}))
    else: out=run_replanner(d.get("goal",""),d.get("failures",[]),d.get("allowed_routes",[]))
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
