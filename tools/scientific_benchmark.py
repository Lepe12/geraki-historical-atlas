#!/usr/bin/env python3
"""Deterministic architecture/scientific benchmark for Agent Piracy core rules."""
import hashlib,json,sys
import unittest
from test_candidate_context import ContextPolicy
from evidence_model import EVIDENCE_STATES,can_advance,evidence_weight,verification_assessment,toponym_identity,normalize_date

def digest(payload):
    c=json.dumps(payload,ensure_ascii=False,sort_keys=True,separators=(",",":"))
    return hashlib.sha256(c.encode("utf-8")).hexdigest()

a={"target":"Alpha Test","aliases":["A"],"date_range":"1600-1610","purpose":"benchmark A"}
b={"target":"Beta Test","aliases":["B"],"date_range":"1700-1710","purpose":"benchmark B"}
ha,hb=digest(a),digest(b)
checks={
 "observed_context_regressions_and_synthetic_controls":unittest.TextTestRunner(verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(ContextPolicy)).wasSuccessful(),
 "two_requests_have_distinct_hashes":ha!=hb,
 "request_a_does_not_contain_b":b["target"] not in json.dumps(a),
 "request_b_does_not_contain_a":a["target"] not in json.dumps(b),
 "evidence_states_exact":EVIDENCE_STATES==["DISCOVERED","LOCATED","ACQUIRED","ORIGINAL_INSPECTED","EXTRACTED","CORROBORATED","VERIFIED"],
 "no_state_skip_discovered_to_verified":not can_advance("DISCOVERED","VERIFIED"),
 "strong_single_primary_can_be_machine_checked":verification_assessment(True,True,evidence_weight("PRIMARY",True,"EYEWITNESS","UNKNOWN"),False,False)=="MACHINE_CHECKED",
 "human_review_required_for_verified":verification_assessment(True,True,evidence_weight("PRIMARY",True,"EYEWITNESS","INDEPENDENT"),False,False)!="VERIFIED",
 "human_review_allows_verified_when_quality_high":verification_assessment(True,True,evidence_weight("PRIMARY",True,"EYEWITNESS","INDEPENDENT"),False,True)=="VERIFIED",
 "unknown_toponym_not_auto_equivalent":not toponym_identity("SimilarName","Canonical",["Alias"])["auto_equivalence"],
 "date_original_preserved":normalize_date("12 March 1677 OS")["original_date_text"]=="12 March 1677 OS"
}
ok=all(checks.values())
report={"schema":"agent-piracy-scientific-benchmark-v1","request_a_sha256":ha,"request_b_sha256":hb,"checks":checks,"passed":ok}
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(0 if ok else 1)
