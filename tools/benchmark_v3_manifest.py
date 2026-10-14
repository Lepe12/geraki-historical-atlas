#!/usr/bin/env python3
"""Build the frozen candidate manifest for Historical Benchmark v3."""
from __future__ import annotations
import argparse,datetime,hashlib,json
from pathlib import Path
from review_validation import candidate_digest

LANES=["travellers","spanish_simancas","venetian","french","british","dutch","german","italian_states","ottoman","north_african"]

def read(path:Path):
    return json.loads(path.read_text(encoding="utf-8"))

def source_key(c):
    return str(c.get("identifier") or c.get("url") or c.get("source_file") or c.get("title") or c.get("candidate_id") or "")

def latest_requests(root:Path):
    latest={}
    for p in sorted(root.glob("*.json")):
        try:d=read(p)
        except Exception:continue
        cid=d.get("case_id")
        try:rid=int(d.get("run_id",0))
        except Exception:continue
        if not cid or rid<=0:continue
        if cid not in latest or rid>latest[cid]["run_id"]:
            latest[cid]={"case_id":cid,"run_id":rid,"request_file":str(p.as_posix())}
    return latest

def build(repo:Path):
    bench=read(repo/"benchmarks/historical_benchmark_v1.json")
    cfg=read(repo/"benchmarks/v3/config.json")
    case_map={x["id"]:x for x in bench.get("cases",[])}
    reqs=latest_requests(repo/"benchmarks/evaluation_requests")
    cases=[]; candidates=[]
    for cid,req in sorted(reqs.items()):
        case=case_map.get(cid)
        if not case:continue
        run_id=req["run_id"]
        root=repo/"evidence/runs"/str(run_id)
        case_row={
          "case_id":cid,"run_id":run_id,"request_file":req["request_file"],
          "tier":case.get("tier"),"expected_positive":bool(case.get("label")),
          "metric_included":case.get("metric_included",True) is not False,
          "run_present":root.is_dir(),"candidate_count":0,"missing_lanes":[]
        }
        for lane in LANES:
            p=root/lane/"structured_output/candidate_events.json"
            if not p.exists():
                case_row["missing_lanes"].append(lane);continue
            try:events=read(p).get("events",[]) or []
            except Exception:events=[]
            for c in events:
                cid0=str(c.get("candidate_id") or "")
                uid=f"{cid}|{run_id}|{lane}|{cid0}"
                row={
                  "candidate_uid":uid,
                  "case_id":cid,"run_id":run_id,"lane":lane,"candidate_id":cid0,
                  "candidate_path":str(p.relative_to(repo).as_posix()),
                  "candidate_evidence_sha256":candidate_digest(c),
                  "source_key":source_key(c),
                  "source_type":c.get("source_type"),
                  "repository":c.get("repository"),
                  "identifier":c.get("identifier"),
                  "url":c.get("url"),
                  "title":c.get("title"),
                  "context_excerpt":str(c.get("context_excerpt") or "")[:2000],
                  "original_quote":c.get("original_quote"),
                  "controlled_transcription":c.get("controlled_transcription"),
                  "source_says":c.get("source_says"),
                  "original_inspected":bool(c.get("original_inspected")),
                  "verified":bool(c.get("verified")),
                  "machine_status":c.get("machine_status"),
                  "human_review_status":c.get("human_review_status")
                }
                candidates.append(row);case_row["candidate_count"]+=1
        cases.append(case_row)
    return {
      "schema":"pct-benchmark-v3-candidate-manifest-v1",
      "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "dataset_scope":"LATEST_STORED_EVALUATION_REQUEST_PER_CASE",
      "engine_scope_warning":"Stored runs may come from different historical engine versions. v3 scoring identifies this as a frozen baseline, not automatically as current-engine performance.",
      "official_precision_requires":cfg["official_label_requirements"],
      "case_count":len(cases),"candidate_count":len(candidates),
      "cases":cases,"candidates":candidates
    }

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--repo",default=".");p.add_argument("--output",default="benchmarks/v3/CURRENT_MANIFEST.json")
    a=p.parse_args();repo=Path(a.repo).resolve();out=build(repo)
    dest=repo/a.output;dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("BENCHMARK V3 MANIFEST",out["case_count"],"cases",out["candidate_count"],"candidates")
