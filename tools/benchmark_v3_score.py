#!/usr/bin/env python3
"""Score Historical Benchmark v3 with fail-closed human-label rules."""
from __future__ import annotations
import argparse,datetime,json
from pathlib import Path

REL={"RELEVANT","OFF_TARGET","INSUFFICIENT_CONTEXT"}
QUAL={"PRIMARY_ORIGINAL","PRIMARY_FACSIMILE","PRIMARY_DERIVATIVE","SECONDARY","METADATA_ONLY","UNKNOWN"}

def read(p):return json.loads(Path(p).read_text(encoding="utf-8"))

def valid_time(v):
    if not isinstance(v,str) or not v.strip():return False
    try:return datetime.datetime.fromisoformat(v.replace("Z","+00:00")).tzinfo is not None
    except ValueError:return False

def score(manifest,labels,results_root:Path):
    by_uid={x["candidate_uid"]:x for x in manifest.get("candidates",[])}
    official={}; rejected=[]
    for i,l in enumerate(labels.get("items",[])):
        uid=l.get("candidate_uid")
        reason=None
        if l.get("reviewer_type")!="HUMAN":reason="REVIEWER_TYPE_NOT_HUMAN"
        elif l.get("review_status")!="FINAL":reason="REVIEW_NOT_FINAL"
        elif not str(l.get("reviewer") or "").strip():reason="REVIEWER_MISSING"
        elif not valid_time(l.get("reviewed_utc")):reason="INVALID_REVIEW_TIME"
        elif uid not in by_uid:reason="CANDIDATE_UID_NOT_IN_MANIFEST"
        elif l.get("candidate_evidence_sha256")!=by_uid[uid]["candidate_evidence_sha256"]:reason="EVIDENCE_BINDING_MISMATCH"
        elif l.get("relevance_label") not in REL:reason="INVALID_RELEVANCE_LABEL"
        elif l.get("evidence_quality_label") not in QUAL:reason="INVALID_EVIDENCE_QUALITY_LABEL"
        elif uid in official:reason="DUPLICATE_FINAL_LABEL"
        if reason:rejected.append({"index":i,"candidate_uid":uid,"reason":reason});continue
        official[uid]=l

    counts={x:0 for x in REL}
    quality={x:0 for x in QUAL}
    for l in official.values():
        counts[l["relevance_label"]]+=1;quality[l["evidence_quality_label"]]+=1
    labelled=len(official);relevant=counts["RELEVANT"]
    precision=(relevant/labelled) if labelled else None
    label_coverage=(labelled/len(by_uid)) if by_uid else None

    positive=[];detected=[];missing_results=[]
    for c in manifest.get("cases",[]):
        if not c.get("metric_included") or not c.get("expected_positive"):continue
        cid=c["case_id"];rid=c["run_id"];positive.append(cid)
        rp=results_root/f"{rid}-{cid}.json"
        if not rp.exists():missing_results.append(cid);continue
        r=read(rp)
        if r.get("schema")!="agent-piracy-live-benchmark-result-v3":
            missing_results.append(cid);continue
        if r.get("matched_case_candidate"):detected.append(cid)
    evaluated=len(positive)-len(missing_results)
    recall=(len(detected)/evaluated) if evaluated else None

    gold_count=0
    gold_root=Path("benchmarks/historical_gold")
    if gold_root.exists():
        gold_count=sum(1 for p in gold_root.glob("*/HISTORICAL_GOLD.json") if read(p).get("historical_gold") is True)

    return {
      "schema":"pct-benchmark-v3-summary-v1",
      "metrics_status":"VALID" if labelled and evaluated else ("WAITING_FOR_HUMAN_LABELS" if not labelled else "INCOMPLETE_CASE_RESULTS"),
      "dataset_scope":manifest.get("dataset_scope"),
      "candidate_manifest_count":len(by_uid),
      "official_human_label_count":labelled,
      "rejected_label_count":len(rejected),
      "human_label_coverage":label_coverage,
      "candidate_relevance_counts":counts,
      "evidence_quality_counts":quality,
      "precision":precision,
      "precision_definition":"RELEVANT / all FINAL human-labelled returned candidates; OFF_TARGET and INSUFFICIENT_CONTEXT are non-relevant.",
      "positive_reference_cases":len(positive),
      "evaluated_positive_reference_cases":evaluated,
      "detected_positive_reference_cases":len(detected),
      "recall":recall,
      "recall_definition":"Case-level reference retrieval recall using evaluator-v3 case matching; not historical-truth recall.",
      "missing_case_results":missing_results,
      "historical_gold_case_count":gold_count,
      "historical_truth_accuracy":None,
      "historical_truth_accuracy_reason":"Not defined until a sufficiently sized adjudicated HISTORICAL_GOLD set exists.",
      "rejected_labels":rejected,
      "rules":[
        "No AI/provisional labels contribute to official precision.",
        "Candidate evidence checksum must match the frozen manifest.",
        "Retrieval relevance is separate from documentary quality and historical verification."
      ]
    }

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--manifest",default="benchmarks/v3/CURRENT_MANIFEST.json")
    p.add_argument("--labels",default="benchmarks/v3/labels/HUMAN_LABELS.json")
    p.add_argument("--results-root",default="benchmarks/results")
    p.add_argument("--output",default="benchmarks/v3/results/SUMMARY.json")
    a=p.parse_args();out=score(read(a.manifest),read(a.labels),Path(a.results_root))
    dest=Path(a.output);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(out,ensure_ascii=False,indent=2))
