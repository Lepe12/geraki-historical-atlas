#!/usr/bin/env python3
"""Deterministic adversarial scientific benchmark for Agent Piracy evidence rules."""
import json,sys
from evidence_model import EVIDENCE_STATES,can_advance,evidence_weight,verification_assessment,toponym_identity,normalize_date

checks={}

# Evidence-state integrity: no skipping straight from discovery to verification.
checks["no_discovered_to_verified_skip"] = not can_advance("DISCOVERED","VERIFIED")
checks["state_chain_complete"] = EVIDENCE_STATES == [
    "DISCOVERED","LOCATED","ACQUIRED","ORIGINAL_INSPECTED","EXTRACTED","CORROBORATED","VERIFIED"
]

# Metadata/citation trap: an uninspected catalogue record must never become VERIFIED.
checks["metadata_only_never_verified"] = verification_assessment(
    False, True, evidence_weight("PRIMARY",False,"UNKNOWN","UNKNOWN"), True, True
) != "VERIFIED"

# Human-review gate: even strong inspected primary evidence is only machine-checked without review.
strong = evidence_weight("PRIMARY",True,"EYEWITNESS","INDEPENDENT")
checks["strong_primary_without_human_review_not_verified"] = (
    verification_assessment(True,True,strong,False,False) == "MACHINE_CHECKED"
)
checks["strong_primary_with_human_review_can_verify"] = (
    verification_assessment(True,True,strong,False,True) == "VERIFIED"
)

# Derivative-source trap: dependence must lower evidence weight rather than add confidence.
ind = evidence_weight("PRIMARY",True,"CONTEMPORARY_NEAR","INDEPENDENT")
der = evidence_weight("PRIMARY",True,"CONTEMPORARY_NEAR","DERIVATIVE")
checks["derivative_source_scores_lower_than_independent"] = der < ind

# Toponym/name-collision traps: similar spellings are unresolved unless explicitly supplied.
checks["similar_toponym_not_auto_equivalent"] = not toponym_identity(
    "Melo","Milos",["Melos","Milo","Millo"]
)["auto_equivalence"]
checks["explicit_alias_is_provisional_not_proven"] = not toponym_identity(
    "Melos","Milos",["Melos","Milo","Millo"]
)["auto_equivalence"]

# Date traps: preserve original wording and do not invent calendar conversions.
d1=normalize_date("12 March 1677 OS")
checks["old_style_date_text_preserved"] = d1["original_date_text"]=="12 March 1677 OS"
checks["old_style_calendar_not_guessed"] = d1["calendar"]=="UNDETERMINED" and not d1["conversion_applied"]
d2=normalize_date("1677 or 1678")
checks["ambiguous_years_not_collapsed_to_exact"] = d2["normalized_year"] is None and d2["normalized_range"]==[1677,1678]

# Unsupported-claim trap: inspected-but-unextracted material cannot be advanced.
checks["unextracted_original_not_verified"] = verification_assessment(
    True,False,strong,True,True
)=="NEEDS_EXTRACTION"

passed=all(checks.values())
report={
  "schema":"agent-piracy-adversarial-scientific-benchmark-v1",
  "checks":checks,
  "passed":passed,
  "interpretation":"These deterministic controls test evidence-state, citation, source-dependence, date, and toponym safeguards. They do not replace live historical precision/recall evaluation."
}
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(0 if passed else 1)
