#!/usr/bin/env python3
"""Run one specialist agent across registered discovery connectors."""
from __future__ import annotations
import argparse,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/"connectors"))
from connectors.connector_registry import eligible

def run_one(agent:dict, connector_limit:int=3):
    outputs=[]
    connectors=eligible("search")[:connector_limit]
    for query in agent.get("queries",[]):
        for meta in connectors:
            cid=meta["connector_id"]
            cmd=[sys.executable,str(ROOT/"connectors"/"connector_runner.py"),cid,query,"--timeout","120"]
            try:
                p=subprocess.run(cmd,capture_output=True,text=True,timeout=150)
                try: data=json.loads(p.stdout)
                except Exception:
                    data={"connector_id":cid,"status":"FAILED","raw_stdout":p.stdout[-3000:],"raw_stderr":p.stderr[-1000:]}
            except subprocess.TimeoutExpired:
                data={"connector_id":cid,"status":"FAILED","blockers":[{"code":"WORKER_TIMEOUT"}]}
            data["specialist_agent"]=agent["agent_id"]
            data["specialist_query"]=query
            outputs.append(data)
    return {
      "schema":"pct-specialist-agent-result-v1",
      "agent_id":agent["agent_id"],
      "label":agent.get("label"),
      "requested_outputs":agent.get("outputs",[]),
      "search_runs":outputs,
      "result_count":sum(len(x.get("records",[])) for x in outputs if isinstance(x,dict)),
      "verified_promotion_allowed":False,
      "rule":"Specialist discovery output is CANDIDATE/UNRESOLVED until scientific gates pass."
    }

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--plan",required=True);p.add_argument("--agent",required=True);p.add_argument("--output",required=True);p.add_argument("--connector-limit",type=int,default=3)
    a=p.parse_args();plan=json.loads(Path(a.plan).read_text(encoding="utf-8"))
    agent=next((x for x in plan.get("agents",[]) if x.get("agent_id")==a.agent),None)
    if not agent: raise SystemExit("SPECIALIST_AGENT_NOT_IN_PLAN")
    out=run_one(agent,a.connector_limit)
    dest=Path(a.output);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("SPECIALIST AGENT",a.agent,"runs",len(out["search_runs"]),"records",out["result_count"])
