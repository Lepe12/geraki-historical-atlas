#!/usr/bin/env python3
"""JARVIS connector executor with structured fallback decisions.

It does not execute arbitrary code. Only connectors declared in the registry
may run, and their output is wrapped in the uniform connector contract.
"""
from __future__ import annotations
import argparse,json,subprocess,sys
from pathlib import Path
from connector_contract import ConnectorResult,ConnectorStatus,validate_result
from connector_registry import connector,next_route

def classify(returncode:int, stdout:str, stderr:str):
    blob=(stdout+"\n"+stderr).lower()
    if "captcha" in blob: return ConnectorStatus.BLOCKED,"CAPTCHA"
    if "login" in blob or "auth" in blob: return ConnectorStatus.BLOCKED,"LOGIN_REQUIRED"
    if "timeout" in blob or "timed out" in blob: return ConnectorStatus.FAILED,"TIMEOUT"
    if "archive_not_confirmed" in blob: return ConnectorStatus.BLOCKED,"ARCHIVE_NOT_CONFIRMED"
    if returncode==0: return ConnectorStatus.EXECUTED,None
    return ConnectorStatus.FAILED,"EXECUTION_FAILED"

def run_connector(connector_id:str, query:str, timeout:int=180):
    meta=connector(connector_id)
    module=Path(meta["module"])
    if not module.is_file(): raise SystemExit("CONNECTOR_MODULE_MISSING")
    proc=subprocess.run([sys.executable,str(module),query],capture_output=True,text=True,timeout=timeout)
    status,code=classify(proc.returncode,proc.stdout,proc.stderr)
    blockers=[]
    warnings=[]
    route=None
    if code:
        blockers.append({"code":code,"detail":proc.stderr[-1000:] or proc.stdout[-1000:]})
        route=next_route(connector_id,code)
    if proc.returncode!=0:
        warnings.append("Connector process returned non-zero exit status.")
    records=[]
    parsed=None
    try:
        parsed=json.loads(proc.stdout)
        if isinstance(parsed,dict):
            if isinstance(parsed.get("records"),list): records=parsed["records"]
            elif isinstance(parsed.get("results"),list): records=parsed["results"]
    except Exception:
        parsed=None
    result=ConnectorResult(
      connector_id=connector_id,
      repository=meta["repository"],
      operation="search",
      status=status,
      query=query,
      records=records,
      provenance={
        "module":str(module),
        "returncode":proc.returncode,
        "stdout_excerpt":proc.stdout[-5000:],
        "stderr_excerpt":proc.stderr[-2000:],
      },
      blockers=blockers,
      warnings=warnings,
      next_best_route=route,
      evidence_level="DISCOVERY_ONLY"
    ).to_dict()
    errors=validate_result(result)
    if errors: raise SystemExit("CONNECTOR_CONTRACT_INVALID:"+",".join(errors))
    return result

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("connector_id");p.add_argument("query");p.add_argument("--timeout",type=int,default=180);p.add_argument("--output")
    a=p.parse_args();out=run_connector(a.connector_id,a.query,a.timeout);payload=json.dumps(out,ensure_ascii=False,indent=2)+"\n"
    if a.output: Path(a.output).write_text(payload,encoding="utf-8")
    else: print(payload,end="")
