#!/usr/bin/env python3
"""Freeze Historical Benchmark v4 evidence from bound durable runs."""
from __future__ import annotations
import argparse,datetime,json
from pathlib import Path
from review_validation import candidate_digest,digest

LANES=["greek","travellers","spanish_simancas","venetian","french","british","dutch","german","italian_states","ottoman","north_african"]

def read(path):
    p=Path(path)
    return json.loads(p.read_text(encoding="utf-8"))

def run_engine_commit(root):
    commits=set()
    for lane in LANES:
        p=root/lane/"run_manifest"/"manifest.json"
        if not p.exists():
            continue
        try:
            c=read(p).get("git_commit")
            if c: commits.add(c)
        except Exception:
            pass
    return sorted(commits)

def build(repo):
    repo=Path(repo)
    cfg=read(repo/"benchmarks/v4/config.json")
    req=read(repo/"benchmarks/v4/cases/requests.json")
    bindings=read(repo/"benchmarks/v4/run_bindings.json")
    bind={x["case_id"]:x for x in bindings.get("bindings",[])}
    rows=[];candidates=[];claims=[]
    eligible_engine_commits=set()
    for case in req.get("cases",[]):
        cid=case["case_id"];b=bind.get(cid,{})
        rid=b.get("run_id")
        root=repo/"evidence/runs"/str(rid) if rid else None
        present=bool(root and root.is_dir())
        commits=run_engine_commit(root) if present else []
        eligible=bool(
            present and not b.get("baseline_only",True) and
            b.get("blind_execution_attested") is True and
            len(commits)==1 and case.get("metric_included",True)
        )
        if eligible: eligible_engine_commits.update(commits)
        row={
          "case_id":cid,"case_type":case.get("case_type"),
          "metric_included":case.get("metric_included",True) is not False,
          "run_id":rid,"run_present":present,"baseline_only":b.get("baseline_only",True),
          "blind_execution_attested":b.get("blind_execution_attested") is True,
          "engine_commits":commits,"eligible_for_official_metrics":eligible,
          "candidate_count":0,"claim_count":0,"missing_lanes":[]
        }
        if present:
            for lane in LANES:
                cp=root/lane/"structured_output"/"candidate_events.json"
                mp=root/lane/"claim_evidence_matrix"/"claims.json"
                if not cp.exists():
                    row["missing_lanes"].append(lane)
                else:
                    try: events=read(cp).get("events",[]) or []
                    except Exception: events=[]
                    for c in events:
                        candidate_id=str(c.get("candidate_id") or "")
                        uid=f"{cid}|{rid}|{lane}|{candidate_id}"
                        candidates.append({
                          "candidate_uid":uid,"case_id":cid,"run_id":rid,"lane":lane,
                          "candidate_id":candidate_id,
                          "candidate_path":str(cp.relative_to(repo).as_posix()),
                          "candidate_evidence_sha256":candidate_digest(c),
                          "source_type":c.get("source_type"),"repository":c.get("repository"),
                          "identifier":c.get("identifier"),"url":c.get("url"),"title":c.get("title"),
                          "research_value":c.get("research_value"),
                          "evidence_confidence":c.get("evidence_confidence"),
                          "retention":c.get("retention"),
                          "original_inspected":bool(c.get("original_inspected")),
                          "verified":bool(c.get("verified"))
                        })
                        row["candidate_count"]+=1
                if mp.exists():
                    try: claim_rows=read(mp).get("claims",[]) or []
                    except Exception: claim_rows=[]
                    for c in claim_rows:
                        claim_id=str(c.get("claim_id") or "")
                        claims.append({
                          "claim_uid":f"{cid}|{rid}|{lane}|{claim_id}",
                          "case_id":cid,"run_id":rid,"lane":lane,"claim_id":claim_id,
                          "claim_path":str(mp.relative_to(repo).as_posix()),
                          "claim_evidence_sha256":digest(c),
                          "claim_text":c.get("claim_text"),
                          "claim_scope":c.get("claim_scope"),
                          "machine_recommendation":c.get("machine_recommendation"),
                          "verified":bool(c.get("verified"))
                        })
                        row["claim_count"]+=1
        rows.append(row)
    same_engine=(len(eligible_engine_commits)<=1)
    if not same_engine:
        for r in rows:r["eligible_for_official_metrics"]=False
    return {
      "schema":"pct-benchmark-v4-frozen-manifest-v1",
      "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "benchmark_version":cfg.get("version"),
      "blindness_rule":cfg.get("blindness"),
      "case_count":len(rows),"candidate_count":len(candidates),"claim_count":len(claims),
      "official_engine_commit":next(iter(eligible_engine_commits),None) if same_engine else None,
      "single_engine_official_cohort":same_engine,
      "official_eligible_case_count":sum(1 for x in rows if x.get("eligible_for_official_metrics")),
      "cases":rows,"candidates":candidates,"claims":claims,
      "rules":[
        "Baseline-only runs exercise framework mechanics but never enter official v4 metrics.",
        "Official cases require a fresh blind-attested run and one common engine revision.",
        "Candidate and claim labels bind to frozen evidence hashes."
      ]
    }

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--repo",default=".")
    p.add_argument("--output",default="benchmarks/v4/CURRENT_MANIFEST.json")
    a=p.parse_args();repo=Path(a.repo).resolve();out=build(repo)
    dest=repo/a.output;dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("BENCHMARK V4 MANIFEST",out["case_count"],"cases",out["candidate_count"],"candidates","eligible",out["official_eligible_case_count"])
