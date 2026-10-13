#!/usr/bin/env python3
"""Explicit final verification gate for Agent Piracy.

Requires a prior accepted HUMAN_REVIEWED decision and a separate verification
record. No automated stage invokes this tool.
"""
from __future__ import annotations
import argparse,datetime,json,pathlib

ap=argparse.ArgumentParser()
ap.add_argument("--lane",required=True)
ap.add_argument("--verification-file",required=True)
args=ap.parse_args()

cand_path=pathlib.Path("structured_output/candidate_events.json")
dec_path=pathlib.Path("human_review/decisions.json")
matrix_path=pathlib.Path("claim_evidence_matrix/claims.json")
if not cand_path.exists():raise SystemExit("CANDIDATE_FILE_NOT_FOUND")
if not dec_path.exists():raise SystemExit("HUMAN_REVIEW_DECISIONS_NOT_FOUND")
if not matrix_path.exists():raise SystemExit("CLAIM_EVIDENCE_MATRIX_NOT_FOUND")

cdata=json.loads(cand_path.read_text(encoding="utf-8"))
ddata=json.loads(dec_path.read_text(encoding="utf-8"))
mdata=json.loads(matrix_path.read_text(encoding="utf-8"))
v=json.loads(pathlib.Path(args.verification_file).read_text(encoding="utf-8"))

cid=str(v.get("candidate_id") or "").strip()
verifier=str(v.get("verifier") or "").strip()
decision=str(v.get("decision") or "").strip().upper()
if decision not in {"VERIFY","DO_NOT_VERIFY","NEEDS_MORE_EVIDENCE"}:
    raise SystemExit("INVALID_FINAL_VERIFICATION_DECISION")
if not cid or not verifier:raise SystemExit("FINAL_VERIFICATION_REQUIRES_CANDIDATE_AND_VERIFIER")

candidate=next((x for x in cdata.get("events",[]) if x.get("candidate_id")==cid),None)
review=next((x for x in ddata.get("items",[]) if x.get("candidate_id")==cid),None)
claim=next((x for x in mdata.get("claims",[]) if x.get("candidate_id")==cid),None)
if candidate is None:raise SystemExit("CANDIDATE_NOT_FOUND")
if review is None:raise SystemExit("HUMAN_REVIEW_NOT_FOUND")
if claim is None:raise SystemExit("CLAIM_MATRIX_ENTRY_NOT_FOUND")
if candidate.get("lane")!=args.lane or review.get("lane")!=args.lane:raise SystemExit("LANE_MISMATCH")

requirements={
 "human_review_accept":review.get("decision")=="ACCEPT",
 "verification_eligible":bool(review.get("verification_eligible")),
 "original_inspected":bool(review.get("original_inspected")),
 "exact_locator":bool(review.get("exact_locator")),
 "source_says":bool(review.get("source_says")),
 "claim_text":bool(str(v.get("claim_text") or "").strip()),
 "claim_scope":bool(str(v.get("claim_scope") or "").strip()),
 "source_genealogy_assessment":bool(v.get("source_genealogy_assessment")),
 "corroboration_assessment":bool(v.get("corroboration_assessment")),
 "limitations_recorded":v.get("limitations") is not None,
 "contradiction_search_assessed":claim.get("contradiction_search_status") not in (None,"NOT_ASSESSED"),
 "uncertainties_recorded":isinstance(claim.get("uncertainties"),list),
 "falsification_targets_recorded":bool(claim.get("falsification_targets")),
 "claim_matrix_human_assessed":bool(claim.get("assessment_reviewer") and claim.get("assessment_utc"))
}
if decision=="VERIFY":
    missing=[k for k,val in requirements.items() if not val]
    if missing:raise SystemExit("VERIFY_MISSING_REQUIREMENTS: "+",".join(missing))

record={
 "schema":"agent-piracy-final-verification-v1",
 "candidate_id":cid,
 "lane":args.lane,
 "verifier":verifier,
 "verified_utc":v.get("verified_utc") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "decision":decision,
 "claim_text":v.get("claim_text"),
 "claim_scope":v.get("claim_scope"),
 "source_genealogy_assessment":v.get("source_genealogy_assessment"),
 "corroboration_assessment":v.get("corroboration_assessment"),
 "limitations":v.get("limitations"),
 "notes":v.get("notes"),
 "claim_matrix_snapshot":{
   "claim_id":claim.get("claim_id"),
   "contradiction_search_status":claim.get("contradiction_search_status"),
   "contradicting_evidence":claim.get("contradicting_evidence",[]),
   "uncertainties":claim.get("uncertainties",[]),
   "falsification_assessment":claim.get("falsification_assessment"),
   "assessment_reviewer":claim.get("assessment_reviewer")
 },
 "requirements":requirements,
 "verified":decision=="VERIFY",
 "rule":"VERIFIED means the explicit final human verification gate passed; it is never inferred from workflow success."
}

out=pathlib.Path("verification");out.mkdir(exist_ok=True)
fp=out/"final_verifications.json"
existing={"schema":"agent-piracy-final-verifications-v1","items":[]}
if fp.exists():
    try:existing=json.loads(fp.read_text(encoding="utf-8"))
    except Exception:pass
items=[x for x in existing.get("items",[]) if x.get("candidate_id")!=cid]
items.append(record);existing["items"]=items
fp.write_text(json.dumps(existing,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

candidate["verified"]=decision=="VERIFY"
candidate["verification_status"]="VERIFIED" if decision=="VERIFY" else decision
candidate["final_verification"]=record
cand_path.write_text(json.dumps(cdata,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

print("FINAL VERIFICATION",args.lane,cid,decision,"verified",decision=="VERIFY")
