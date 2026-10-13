#!/usr/bin/env python3
"""Apply an explicit human claim assessment to the claim-evidence matrix.

This records contradiction search, uncertainty, support/contradiction evidence
and falsification assessment. It never sets VERIFIED.
"""
from __future__ import annotations
import argparse, datetime, json
from pathlib import Path

def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--matrix",default="claim_evidence_matrix/claims.json")
    p.add_argument("--assessment",required=True)
    a=p.parse_args()

    matrix=load(a.matrix)
    assessment=load(a.assessment)
    cid=str(assessment.get("candidate_id") or "").strip()
    reviewer=str(assessment.get("reviewer") or "").strip()
    if not cid or not reviewer:
        raise SystemExit("ASSESSMENT_REQUIRES_CANDIDATE_AND_REVIEWER")

    claim=next((x for x in matrix.get("claims",[]) if x.get("candidate_id")==cid),None)
    if claim is None:
        raise SystemExit("CLAIM_NOT_FOUND")

    status=str(assessment.get("contradiction_search_status") or "").strip().upper()
    allowed={"SEARCHED_NONE_FOUND","CONTRADICTION_FOUND","PARTIAL_SEARCH","NOT_APPLICABLE_WITH_REASON"}
    if status not in allowed:
        raise SystemExit("INVALID_CONTRADICTION_SEARCH_STATUS")

    claim["contradiction_search_status"]=status
    claim["contradicting_evidence"]=assessment.get("contradicting_evidence",[]) or []
    claim["supporting_evidence_human_additions"]=assessment.get("supporting_evidence",[]) or []
    claim["uncertainties"]=assessment.get("uncertainties",claim.get("uncertainties",[])) or []
    claim["limitations"]=assessment.get("limitations",[])
    claim["falsification_assessment"]=assessment.get("falsification_assessment")
    claim["assessment_reviewer"]=reviewer
    claim["assessment_utc"]=assessment.get("reviewed_utc") or datetime.datetime.now(datetime.timezone.utc).isoformat()
    claim["machine_recommendation"]="UNRESOLVED"
    claim["verified"]=False

    Path(a.matrix).write_text(json.dumps(matrix,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CLAIM ASSESSMENT RECORDED",cid,status,"verified",False)
