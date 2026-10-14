#!/usr/bin/env python3
from benchmark_v4_review_packet import build

def main():
    manifest={
      "official_engine_commit":"abc",
      "cases":[{"case_id":"x","case_type":"POSITIVE_REFERENCE","run_id":1,"candidate_count":1,"claim_count":1,"eligible_for_official_metrics":True}],
      "candidates":[{"candidate_uid":"x|1|g|c","candidate_evidence_sha256":"a"*64,"case_id":"x","lane":"g","candidate_path":"evidence/x.json","title":"T"}],
      "claims":[{"claim_uid":"x|1|g|q","claim_evidence_sha256":"b"*64,"case_id":"x","lane":"g","claim_path":"evidence/q.json","claim_text":"Q"}]
    }
    cfg={"candidate_dimensions":{"relevance":["RELEVANT"]},"case_dimensions":{"retrieval_outcome":["DETECTED"]}}
    a=build(manifest,cfg,"REVIEWER_A");b=build(manifest,cfg,"REVIEWER_B")
    assert a["gold_expectations_included"] is False
    assert "expected_positive" not in str(a)
    assert a["candidates"][0]["candidate_evidence_sha256"]=="a"*64
    assert a["reviewer_packet"]!=b["reviewer_packet"]
    print("BENCHMARK V4 REVIEW PACKET TESTS PASS")

if __name__=="__main__":main()
