#!/usr/bin/env python3
"""Parallel connector batch runner with per-archive limits."""
from __future__ import annotations
import argparse,concurrent.futures,json,subprocess,sys
from pathlib import Path
from connector_rate_limit import ConnectorLease

HERE=Path(__file__).resolve().parent

def call(connector_id:str,query:str,timeout:int):
    with ConnectorLease(connector_id):
        p=subprocess.run(
          [sys.executable,str(HERE/"connector_runner.py"),connector_id,query,"--timeout",str(timeout)],
          capture_output=True,text=True,timeout=timeout+30
        )
    try: return json.loads(p.stdout)
    except Exception:
        return {"connector_id":connector_id,"status":"FAILED","query":query,"raw_stdout":p.stdout[-3000:],"raw_stderr":p.stderr[-2000:]}

def run_batch(items:list[dict],max_workers:int=8,timeout:int=180):
    out=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs=[ex.submit(call,x["connector_id"],x["query"],timeout) for x in items]
        for f in concurrent.futures.as_completed(futs):
            try: out.append(f.result())
            except Exception as e: out.append({"status":"FAILED","error":str(e)})
    return out

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--input",required=True);p.add_argument("--output",required=True);p.add_argument("--max-workers",type=int,default=8);p.add_argument("--timeout",type=int,default=180)
    a=p.parse_args();items=json.loads(Path(a.input).read_text(encoding="utf-8"))
    out=run_batch(items,a.max_workers,a.timeout)
    Path(a.output).write_text(json.dumps({"schema":"pct-connector-batch-v1","results":out},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CONNECTOR BATCH",len(out))
