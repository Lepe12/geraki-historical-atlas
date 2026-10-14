#!/usr/bin/env python3
"""Dispatch Benchmark v4 cases as separate workflow runs on one frozen branch."""
from __future__ import annotations
import argparse,datetime,json,os,subprocess,time
from pathlib import Path

def sh(args):
    return subprocess.check_output(args,text=True).strip()

def gh_json(args):
    out=sh(["gh",*args])
    return json.loads(out) if out else {}

def list_runs(repo,branch,workflow):
    d=gh_json(["api","-X","GET",f"repos/{repo}/actions/workflows/{workflow}/runs",
               "-f",f"branch={branch}","-f","event=workflow_dispatch","-f","per_page=100"])
    return d.get("workflow_runs",[]) or []

def wait_for_new_run(repo,branch,workflow,before,timeout=120):
    deadline=time.time()+timeout
    while time.time()<deadline:
        runs=list_runs(repo,branch,workflow)
        new=[x for x in runs if int(x.get("id",0)) not in before]
        if new:
            new.sort(key=lambda x:int(x.get("id",0)),reverse=True)
            return new[0]
        time.sleep(2)
    raise RuntimeError("DISPATCHED_RUN_ID_NOT_OBSERVED")

def run_status(repo,run_id):
    return gh_json(["api",f"repos/{repo}/actions/runs/{run_id}"])

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--repo",required=True)
    p.add_argument("--branch",required=True)
    p.add_argument("--workflow",default="pct-parallel-multi-agent.yml")
    p.add_argument("--requests",default="benchmarks/v4/cases/requests.json")
    p.add_argument("--output",required=True)
    p.add_argument("--wait",action="store_true")
    p.add_argument("--poll-seconds",type=int,default=30)
    p.add_argument("--timeout-seconds",type=int,default=21000)
    a=p.parse_args()
    req=json.loads(Path(a.requests).read_text(encoding="utf-8"))
    mapping=[]
    known={int(x.get("id",0)) for x in list_runs(a.repo,a.branch,a.workflow)}
    for case in req.get("cases",[]):
        cmd=["gh","workflow","run",a.workflow,"--repo",a.repo,"--ref",a.branch,
             "-f","target="+str(case.get("target") or ""),
             "-f","aliases="+"|".join(str(x) for x in case.get("aliases",[]) or []),
             "-f","date_range="+str(case.get("date_range") or ""),
             "-f","purpose="+str(case.get("purpose") or "")]
        subprocess.run(cmd,check=True)
        run=wait_for_new_run(a.repo,a.branch,a.workflow,known)
        rid=int(run["id"]);known.add(rid)
        mapping.append({
          "case_id":case["case_id"],"run_id":rid,"dispatch_status":"DISPATCHED",
          "head_branch":run.get("head_branch"),"head_sha":run.get("head_sha"),
          "html_url":run.get("html_url")
        })
        print("DISPATCHED",case["case_id"],rid,flush=True)

    if a.wait:
        deadline=time.time()+a.timeout_seconds
        remaining={x["run_id"] for x in mapping}
        while remaining and time.time()<deadline:
            for item in mapping:
                rid=item["run_id"]
                if rid not in remaining:continue
                d=run_status(a.repo,rid)
                item["status"]=d.get("status")
                item["conclusion"]=d.get("conclusion")
                item["head_sha"]=d.get("head_sha") or item.get("head_sha")
                item["head_branch"]=d.get("head_branch") or item.get("head_branch")
                if d.get("status")=="completed":
                    remaining.remove(rid)
                    print("COMPLETED",item["case_id"],rid,item.get("conclusion"),flush=True)
            if remaining:time.sleep(max(5,a.poll_seconds))
        if remaining:
            for item in mapping:
                if item["run_id"] in remaining:item["status"]="WAIT_TIMEOUT"
    payload={
      "schema":"pct-benchmark-v4-fresh-dispatch-v1",
      "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "repo":a.repo,"frozen_branch":a.branch,
      "expected_engine_commit":os.getenv("GITHUB_SHA"),
      "all_completed":all(x.get("status")=="completed" for x in mapping) if a.wait else False,
      "runs":mapping
    }
    out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("WROTE",out)

if __name__=="__main__":main()
