#!/usr/bin/env python3
"""Regression tests for Historical Benchmark v3."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from benchmark_v3_score import score

def main():
    manifest={
      "dataset_scope":"TEST",
      "candidates":[
        {"candidate_uid":"c1","candidate_evidence_sha256":"a"*64},
        {"candidate_uid":"c2","candidate_evidence_sha256":"b"*64},
        {"candidate_uid":"c3","candidate_evidence_sha256":"c"*64},
        {"candidate_uid":"c4","candidate_evidence_sha256":"d"*64},
      ],
      "cases":[]
    }
    labels={"items":[
      {"candidate_uid":"c1","candidate_evidence_sha256":"a"*64,"reviewer_type":"HUMAN","review_status":"FINAL","reviewer":"Reviewer A","reviewed_utc":"2026-10-14T08:00:00+03:00","relevance_label":"RELEVANT","evidence_quality_label":"PRIMARY_FACSIMILE"},
      {"candidate_uid":"c2","candidate_evidence_sha256":"b"*64,"reviewer_type":"HUMAN","review_status":"FINAL","reviewer":"Reviewer A","reviewed_utc":"2026-10-14T08:01:00+03:00","relevance_label":"OFF_TARGET","evidence_quality_label":"SECONDARY"},
      {"candidate_uid":"c3","candidate_evidence_sha256":"WRONG","reviewer_type":"HUMAN","review_status":"FINAL","reviewer":"Reviewer A","reviewed_utc":"2026-10-14T08:02:00+03:00","relevance_label":"RELEVANT","evidence_quality_label":"METADATA_ONLY"},
      {"candidate_uid":"c4","candidate_evidence_sha256":"d"*64,"reviewer_type":"AI","review_status":"FINAL","reviewer":"AI audit","reviewed_utc":"2026-10-14T08:03:00+03:00","relevance_label":"RELEVANT","evidence_quality_label":"METADATA_ONLY"}
    ]}
    out=score(manifest,labels,Path("benchmarks/results"))
    assert out["official_human_label_count"]==2,out
    assert out["precision"]==0.5,out
    assert out["rejected_label_count"]==2,out
    reasons={x["reason"] for x in out["rejected_labels"]}
    assert "EVIDENCE_BINDING_MISMATCH" in reasons,reasons
    assert "REVIEWER_TYPE_NOT_HUMAN" in reasons,reasons

    empty=score(manifest,{"items":[]},Path("benchmarks/results"))
    assert empty["precision"] is None,empty
    assert empty["metrics_status"]=="WAITING_FOR_HUMAN_LABELS",empty
    print("BENCHMARK V3 TESTS PASS")

if __name__=="__main__":
    main()
