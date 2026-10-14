#!/usr/bin/env python3
"""Build deterministic blinded human-review packets for Historical Benchmark v4."""
from __future__ import annotations
import argparse,hashlib,json
from pathlib import Path

def read(p):return json.loads(Path(p).read_text(encoding="utf-8"))

def order(rows,salt,key):
    return sorted(rows,key=lambda x:hashlib.sha256((salt+"|"+str(x.get(key,""))).encode()).hexdigest())

def build(manifest,config,reviewer):
    eligible={x["case_id"] for x in manifest.get("cases",[]) if x.get("eligible_for_official_metrics")}
    cases=[{
      "case_id":x["case_id"],"case_type":x.get("case_type"),"run_id":x.get("run_id"),
      "candidate_count":x.get("candidate_count"),"claim_count":x.get("claim_count")
    } for x in manifest.get("cases",[]) if x["case_id"] in eligible]
    candidates=[{
      "candidate_uid":x["candidate_uid"],"candidate_evidence_sha256":x["candidate_evidence_sha256"],
      "case_id":x["case_id"],"lane":x.get("lane"),"candidate_id":x.get("candidate_id"),
      "candidate_path":x.get("candidate_path"),"source_type":x.get("source_type"),
      "repository":x.get("repository"),"identifier":x.get("identifier"),"url":x.get("url"),
      "title":x.get("title"),"research_value":x.get("research_value"),
      "evidence_confidence":x.get("evidence_confidence"),"retention":x.get("retention")
    } for x in manifest.get("candidates",[]) if x["case_id"] in eligible]
    claims=[{
      "claim_uid":x["claim_uid"],"claim_evidence_sha256":x["claim_evidence_sha256"],
      "case_id":x["case_id"],"lane":x.get("lane"),"claim_id":x.get("claim_id"),
      "claim_path":x.get("claim_path"),"claim_text":x.get("claim_text"),
      "claim_scope":x.get("claim_scope"),"machine_recommendation":x.get("machine_recommendation")
    } for x in manifest.get("claims",[]) if x["case_id"] in eligible]
    return {
      "schema":"pct-benchmark-v4-blinded-review-packet-v1",
      "reviewer_packet":reviewer,
      "official_engine_commit":manifest.get("official_engine_commit"),
      "gold_expectations_included":False,
      "instructions":[
        "Review independently. Do not consult the other reviewer's labels before submission.",
        "Use the frozen candidate/claim path and preserved evidence to assess the record.",
        "Research Value and Evidence Confidence are machine metadata, not ground truth; do not copy them as labels.",
        "Bind every candidate label to the supplied candidate_evidence_sha256."
      ],
      "candidate_dimensions":config.get("candidate_dimensions"),
      "case_dimensions":config.get("case_dimensions"),
      "cases":order(cases,reviewer,"case_id"),
      "candidates":order(candidates,reviewer,"candidate_uid"),
      "claims":order(claims,reviewer,"claim_uid")
    }

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--manifest",default="benchmarks/v4/CURRENT_MANIFEST.json")
    p.add_argument("--config",default="benchmarks/v4/config.json")
    p.add_argument("--out-dir",default="benchmarks/v4/review_packets")
    a=p.parse_args();m=read(a.manifest);c=read(a.config);out=Path(a.out_dir);out.mkdir(parents=True,exist_ok=True)
    for reviewer in ("REVIEWER_A","REVIEWER_B"):
        packet=build(m,c,reviewer)
        (out/(reviewer+".json")).write_text(json.dumps(packet,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("BENCHMARK V4 REVIEW PACKETS",m.get("official_eligible_case_count",0),"eligible cases")
