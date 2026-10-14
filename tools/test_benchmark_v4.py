#!/usr/bin/env python3
from benchmark_v4_score import score

def reviewer(rid,sha):
    return {
      "reviewer_id":rid,"reviewer_type":"HUMAN","independent":True,"review_status":"FINAL",
      "reviewed_utc":"2026-10-14T10:00:00+03:00",
      "items":[{
        "candidate_uid":"p|1|greek|c1","candidate_evidence_sha256":sha,
        "relevance_label":"RELEVANT","evidence_quality_label":"PRIMARY_FACSIMILE",
        "locator_accuracy":"CORRECT","genealogy_accuracy":"CORRECT",
        "contradiction_detection":"DETECTED","claim_support":"SUPPORTED"
      },{
        "candidate_uid":"n|2|greek|c2","candidate_evidence_sha256":"b"*64,
        "relevance_label":"OFF_TARGET","evidence_quality_label":"METADATA_ONLY",
        "locator_accuracy":"NOT_APPLICABLE","genealogy_accuracy":"NOT_ASSESSED",
        "contradiction_detection":"NOT_APPLICABLE","claim_support":"NOT_A_CLAIM"
      }],
      "cases":[
        {"case_id":"p","retrieval_outcome":"DETECTED","abstention_quality":"NOT_APPLICABLE"},
        {"case_id":"n","retrieval_outcome":"CORRECT_NEGATIVE","abstention_quality":"CORRECT_ABSTENTION"}
      ]
    }

def main():
    manifest={
      "official_engine_commit":"abc","official_eligible_case_count":2,
      "cases":[
        {"case_id":"p","case_type":"POSITIVE_REFERENCE","eligible_for_official_metrics":True},
        {"case_id":"n","case_type":"NEGATIVE_RETRIEVAL_CONTROL","eligible_for_official_metrics":True}
      ],
      "candidates":[
        {"candidate_uid":"p|1|greek|c1","case_id":"p","candidate_evidence_sha256":"a"*64},
        {"candidate_uid":"n|2|greek|c2","case_id":"n","candidate_evidence_sha256":"b"*64}
      ]
    }
    a=reviewer("A","a"*64);b=reviewer("B","a"*64)
    labels={"reviewers":[a,b],"adjudication":{
      "adjudicator_id":"C","reviewer_type":"HUMAN","review_status":"FINAL","reviewed_utc":"2026-10-14T11:00:00+03:00",
      "items":a["items"],"cases":a["cases"]
    }}
    out=score(manifest,labels)
    assert out["metrics_status"]=="VALID",out
    assert out["candidate_precision"]==0.5,out
    assert out["reference_case_recall"]==1.0,out
    assert out["negative_control_specificity"]==1.0,out
    assert out["unsupported_claim_rate"]==0.0,out
    assert out["exact_locator_accuracy"]==1.0,out
    assert out["source_genealogy_accuracy"]==1.0,out
    assert out["contradiction_detection_rate"]==1.0,out
    assert out["abstention_quality_accuracy"]==1.0,out
    assert out["inter_reviewer_agreement"]["relevance_cohens_kappa"]==1.0,out

    nofresh={**manifest,"official_eligible_case_count":0,"cases":[{**x,"eligible_for_official_metrics":False} for x in manifest["cases"]]}
    wait=score(nofresh,{"reviewers":[],"adjudication":{}})
    assert wait["metrics_status"]=="WAITING_FOR_FRESH_BLIND_RUNS",wait
    assert wait["candidate_precision"] is None,wait

    single=score(manifest,{"reviewers":[a],"adjudication":{}})
    assert single["metrics_status"]=="WAITING_FOR_DUAL_HUMAN_REVIEW",single
    print("BENCHMARK V4 TESTS PASS")

if __name__=="__main__":main()
