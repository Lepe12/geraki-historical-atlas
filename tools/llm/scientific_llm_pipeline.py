#!/usr/bin/env python3
"""Scientific LLM task pipeline for Piratecartography."""
from __future__ import annotations
import argparse,json
from pathlib import Path
from evidence_hash import evidence_hash
from llm_router import route
from llm_client import call
from synthesis_cache import cache_key,load,save
from prompt_builders import synthesis_prompt,adversarial_prompt

def source_first_fallback(question:str,evidence:dict,ehash:str)->dict:
    return {
      "status":"SOURCE_FIRST_FALLBACK",
      "question":question,
      "evidence_hash":ehash,
      "summary":"LLM synthesis unavailable; evidence retained without generated conclusion.",
      "evidence":evidence,
      "verified_promotion_allowed":False
    }

def run(role:str,question:str,evidence:dict,cache_dir:Path)->dict:
    if role not in {"synthesis","adversarial_reviewer"}:
        raise ValueError("UNSUPPORTED_PIPELINE_ROLE")
    ehash=evidence_hash(evidence)
    key=cache_key(role,question,evidence)
    cached=load(cache_dir,key)
    if cached:
        return {**cached,"cache_hit":True}

    prompt=synthesis_prompt(question,ehash,evidence) if role=="synthesis" else adversarial_prompt(question,ehash,evidence)
    result=call(role,prompt)
    if result.get("status")=="COMPLETED":
        out={
          "schema":"pct-llm-research-result-v1","role":role,"question":question,
          "evidence_hash":ehash,"provider":result.get("provider"),"model":result.get("model"),
          "content":result.get("content"),"cache_hit":False,
          "verified_promotion_allowed":False
        }
    else:
        out=source_first_fallback(question,evidence,ehash)
        out.update({"schema":"pct-llm-research-result-v1","role":role,"fallback":result.get("fallback"),"error":result.get("error"),"cache_hit":False})
    save(cache_dir,key,out)
    return out

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--role",choices=["synthesis","adversarial_reviewer"],required=True)
    p.add_argument("--question",required=True);p.add_argument("--evidence",type=Path,required=True);p.add_argument("--output",type=Path,required=True)
    p.add_argument("--cache-dir",type=Path,default=Path("evidence/llm_cache"))
    a=p.parse_args();e=json.loads(a.evidence.read_text(encoding="utf-8"));out=run(a.role,a.question,e,a.cache_dir)
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(out["status"] if "status" in out else "COMPLETED",out["evidence_hash"])
