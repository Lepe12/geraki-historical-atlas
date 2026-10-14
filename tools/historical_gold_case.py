#!/usr/bin/env python3
"""Prepare and validate a HISTORICAL_GOLD case without fabricating human review.

The machine may prepare evidence-bound review material. Only a real
human_attestation.json can advance a case to HISTORICAL_GOLD.
"""
from __future__ import annotations
import argparse,datetime,hashlib,json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from review_validation import candidate_digest,digest,validate_review,validate_final

ALLOWED_CONTRADICTION={"SEARCHED_NONE_FOUND","CONTRADICTION_FOUND","PARTIAL_SEARCH","NOT_APPLICABLE_WITH_REASON"}

def read(path:Path):
    return json.loads(path.read_text(encoding="utf-8"))

def write(path:Path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def file_sha(path:Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def candidate(case,case_dir):
    src=case["source"]
    return {
      "candidate_id":"historical-gold-"+case["case_id"].removeprefix("HG-").lower(),
      "lane":"historical_gold",
      "source_file":str((case_dir/"source_precheck.txt").as_posix()),
      "source_type":src["source_type"],
      "identifier":"LCCN "+src["lccn"],
      "url":src["item_url"],
      "title":src["title"],
      "context_excerpt":case["source_says"],
      "place":{"raw":case["target"],"canonical":case["target"],"auto_equivalence":True},
      "date":{"original_date_text":case["date_range"],"date_role":"CLAIM_SCOPE"},
      "exact_page_candidates":[{
        "identifier":"LCCN "+src["lccn"],
        "printed_page":src["exact_locator"]["printed_page"],
        "image_url":src["exact_locator"].get("image_url"),
      }],
      "original_quote":case.get("controlled_transcription"),
      "controlled_transcription":case.get("controlled_transcription"),
      "translation":case.get("source_says"),
      "source_says":case["source_says"],
      "researcher_inference":case["claim_text"],
      "original_inspected":False,
      "extracted":True,
      "corroborated":False,
      "genealogy_checked":True,
      "verified":False,
    }

def base_claim(case,cand):
    return {
      "claim_id":"claim-"+cand["candidate_id"],
      "candidate_id":cand["candidate_id"],
      "lane":"historical_gold",
      "claim_text":case["claim_text"],
      "claim_scope":case["claim_scope"],
      "supporting_evidence":[{
        "evidence_kind":"DIRECT_EXTRACT",
        "source_key":"LCCN "+case["source"]["lccn"],
        "source_type":case["source"]["source_type"],
        "locator_status":"EXACT",
        "locators":[case["source"]["exact_locator"]],
        "text":case["source_says"],
        "original_inspected":False,
      }],
      "contradicting_evidence":[],
      "contradiction_search_status":"NOT_ASSESSED",
      "source_genealogy_status":"ASSESSED",
      "source_genealogy_evidence":case["genealogy"]["evidence_refs"],
      "independent_supporting_chains":[],
      "uncertainties":[
        "Human inspection of the facsimile is still required.",
        "Derivative translations are not independent corroboration.",
        "Claim scope is source attestation, not proof of every event detail."
      ],
      "falsification_targets":[
        "Evidence that the cited 1678 title page has been misread or mistranscribed.",
        "Evidence that the title-page wording refers to a different Panama event.",
        "A contemporary independent source directly contradicting the scoped attribution."
      ],
      "falsification_assessment":None,
      "assessment_reviewer":None,
      "assessment_utc":None,
      "machine_recommendation":"UNRESOLVED",
      "verified":False,
    }

def prepare(case_dir:Path):
    case=read(case_dir/"case.json")
    cand=candidate(case,case_dir)
    claim=base_claim(case,cand)
    generated=case_dir/"generated"
    write(generated/"structured_output"/"candidate_events.json",{
      "schema":"pct-structured-candidates-v3","lane":"historical_gold","events":[cand],
      "rule":"Prepared gold candidate; not historical truth until human and final gates pass."
    })
    write(generated/"claim_evidence_matrix"/"claims.json",{
      "schema":"pct-claim-evidence-matrix-v1","lane":"historical_gold","claim_count":1,"claims":[claim]
    })
    template={
      "schema":"pct-historical-gold-human-attestation-v1",
      "case_id":case["case_id"],
      "reviewer":"REPLACE_WITH_HUMAN_REVIEWER",
      "reviewed_utc":"REPLACE_WITH_TIMEZONE_AWARE_ISO8601",
      "review_decision":"ACCEPT_OR_OTHER",
      "original_inspected":False,
      "source_quality_score":None,
      "source_says_confirmed":case["source_says"],
      "controlled_transcription_confirmed":case["controlled_transcription"],
      "exact_locator_confirmed":case["source"]["exact_locator"],
      "contradiction_search_status":"NOT_ASSESSED",
      "contradicting_evidence":[],
      "uncertainties":claim["uncertainties"],
      "falsification_targets":claim["falsification_targets"],
      "falsification_assessment":"REPLACE_WITH_HUMAN_ASSESSMENT",
      "assessment_utc":"REPLACE_WITH_TIMEZONE_AWARE_ISO8601",
      "verifier":"REPLACE_WITH_HUMAN_VERIFIER",
      "verified_utc":"REPLACE_WITH_TIMEZONE_AWARE_ISO8601",
      "final_decision":"VERIFY_OR_OTHER",
      "limitations":[
        "Verification is limited to the source-attestation scope stated in case.json.",
        "Derivative translations are not counted as independent corroboration."
      ],
      "notes":"Human must inspect the facsimile at the inspection_url before setting original_inspected=true."
    }
    write(case_dir/"human_attestation_TEMPLATE.json",template)
    state={
      "schema":"pct-historical-gold-state-v1",
      "case_id":case["case_id"],
      "status":"READY_FOR_HUMAN_REVIEW",
      "candidate_evidence_sha256":candidate_digest(cand),
      "claim_matrix_sha256_pre_human":digest(claim),
      "source_precheck_sha256":file_sha(case_dir/"source_precheck.txt"),
      "historical_gold":False,
      "automatic_promotion_allowed":False,
    }
    write(case_dir/"STATE.json",state)
    return state

def validate(case_dir:Path):
    state=prepare(case_dir)
    att_path=case_dir/"human_attestation.json"
    if not att_path.exists():
        print(json.dumps(state,ensure_ascii=False,indent=2))
        return 0
    case=read(case_dir/"case.json")
    att=read(att_path)
    cand=read(case_dir/"generated"/"structured_output"/"candidate_events.json")["events"][0]
    claim=read(case_dir/"generated"/"claim_evidence_matrix"/"claims.json")["claims"][0]

    reviewer=str(att.get("reviewer") or "").strip()
    verifier=str(att.get("verifier") or "").strip()
    if not reviewer or reviewer.startswith("REPLACE_"): raise SystemExit("REAL_HUMAN_REVIEWER_REQUIRED")
    if not verifier or verifier.startswith("REPLACE_"): raise SystemExit("REAL_HUMAN_VERIFIER_REQUIRED")
    if att.get("review_decision")!="ACCEPT": raise SystemExit("HUMAN_ACCEPT_REQUIRED")
    if att.get("original_inspected") is not True: raise SystemExit("ORIGINAL_INSPECTION_ATTESTATION_REQUIRED")
    if att.get("final_decision")!="VERIFY": raise SystemExit("FINAL_VERIFY_REQUIRED")
    if att.get("contradiction_search_status") not in ALLOWED_CONTRADICTION: raise SystemExit("CONTRADICTION_ASSESSMENT_REQUIRED")

    claim["contradiction_search_status"]=att["contradiction_search_status"]
    claim["contradicting_evidence"]=att.get("contradicting_evidence") or []
    claim["uncertainties"]=att.get("uncertainties") or []
    claim["falsification_targets"]=att.get("falsification_targets") or []
    claim["falsification_assessment"]=att.get("falsification_assessment")
    claim["assessment_reviewer"]=reviewer
    claim["assessment_utc"]=att.get("assessment_utc")

    precheck=case_dir/"source_precheck.txt"
    review={
      "candidate_id":cand["candidate_id"],
      "lane":"historical_gold",
      "reviewer":reviewer,
      "reviewed_utc":att.get("reviewed_utc"),
      "decision":"ACCEPT",
      "original_inspected":True,
      "evidence_examined":[{"path":str(precheck.as_posix()),"sha256":file_sha(precheck)}],
      "exact_locator":att.get("exact_locator_confirmed") or case["source"]["exact_locator"],
      "archival_reference":"Library of Congress LCCN "+case["source"]["lccn"],
      "source_says":att.get("source_says_confirmed") or case["source_says"],
      "researcher_inference":case["claim_text"],
      "original_quote":att.get("controlled_transcription_confirmed") or case["controlled_transcription"],
      "controlled_transcription":att.get("controlled_transcription_confirmed") or case["controlled_transcription"],
      "translation":case["source_says"],
      "source_quality_score":att.get("source_quality_score"),
      "candidate_evidence_sha256":candidate_digest(cand),
      "verification_eligible":True,
    }
    validate_review(review,cand)

    final={
      "candidate_id":cand["candidate_id"],
      "verifier":verifier,
      "verified_utc":att.get("verified_utc"),
      "decision":"VERIFY",
      "claim_text":claim["claim_text"],
      "claim_scope":claim["claim_scope"],
      "claim_matrix_sha256":digest(claim),
      "source_genealogy_assessment":case["genealogy"],
      "corroboration_assessment":case["corroboration"],
      "limitations":att.get("limitations") or [],
      "notes":att.get("notes"),
    }
    review["verification_eligible"]=True
    validate_final(final,cand,review,claim)

    gold={
      "schema":"pct-historical-gold-v1",
      "case_id":case["case_id"],
      "tier":"HISTORICAL_GOLD",
      "historical_gold":True,
      "claim_text":case["claim_text"],
      "claim_scope":case["claim_scope"],
      "candidate_evidence_sha256":candidate_digest(cand),
      "claim_matrix_sha256":digest(claim),
      "reviewer":reviewer,
      "verifier":verifier,
      "reviewed_utc":att.get("reviewed_utc"),
      "verified_utc":att.get("verified_utc"),
      "source":case["source"],
      "rule":"HISTORICAL_GOLD exists only because explicit human review and final verification both passed."
    }
    write(case_dir/"HISTORICAL_GOLD.json",gold)
    write(case_dir/"generated"/"human_review"/"decisions.json",{"items":[review]})
    write(case_dir/"generated"/"verification"/"final_verifications.json",{"items":[final]})
    state["status"]="HISTORICAL_GOLD"
    state["historical_gold"]=True
    write(case_dir/"STATE.json",state)
    print(json.dumps(gold,ensure_ascii=False,indent=2))
    return 0

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--case-dir",required=True,type=Path)
    p.add_argument("--mode",choices=["prepare","validate"],default="validate")
    a=p.parse_args()
    raise SystemExit(prepare(a.case_dir) and 0 if a.mode=="prepare" else validate(a.case_dir))
