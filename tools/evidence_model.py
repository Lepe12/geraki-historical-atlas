#!/usr/bin/env python3
"""Scientific evidence model for Agent Piracy."""
from __future__ import annotations
import re, datetime

EVIDENCE_STATES=[
 "DISCOVERED","LOCATED","ACQUIRED","ORIGINAL_INSPECTED","EXTRACTED","CORROBORATED","VERIFIED"
]
EVENT_TYPES=[
 "PIRATE_ATTACK","CORSAIR_OPERATION","BOARDING","CAPTIVITY","RANSOM","PILLAGE",
 "PIRATE_PRESENCE_ONLY","RUMOUR_OR_REPORT","DIPLOMATIC_REPORT","UNKNOWN"
]

def state_rank(state):
    try:return EVIDENCE_STATES.index(state)
    except ValueError:return -1

def can_advance(current,target):
    return state_rank(target)==state_rank(current)+1

def normalize_date(raw):
    raw=str(raw or "").strip()
    years=[int(x) for x in re.findall(r"\b(1[0-9]{3}|20[0-9]{2})\b",raw)]
    return {
      "original_date_text":raw,
      "normalized_year":years[0] if len(years)==1 else None,
      "normalized_range":[min(years),max(years)] if len(years)>=2 else None,
      "calendar":"UNDETERMINED",
      "conversion_applied":False,
      "conversion_reason":None,
      "certainty":"EXACT_YEAR" if len(years)==1 else ("RANGE" if len(years)>=2 else "UNRESOLVED")
    }

def toponym_identity(observed,canonical,aliases):
    obs=str(observed or "").strip()
    variants=[str(canonical or "").strip()]+[str(x).strip() for x in aliases or []]
    matches=[v for v in variants if v and obs.casefold()==v.casefold()]
    return {
      "observed_name":obs,
      "canonical_name":canonical,
      "match_basis":"EXACT_SUPPLIED_VARIANT" if matches else "UNRESOLVED",
      "confidence":1.0 if matches else 0.0,
      "auto_equivalence":bool(matches)
    }

def evidence_weight(source_kind="UNKNOWN",original_inspected=False,proximity="UNKNOWN",independence="UNKNOWN"):
    score=0
    if original_inspected: score+=4
    if source_kind=="PRIMARY": score+=3
    elif source_kind=="CONTEMPORARY_PRINTED": score+=2
    elif source_kind=="SECONDARY": score+=1
    if proximity=="EYEWITNESS": score+=2
    elif proximity=="CONTEMPORARY_NEAR": score+=1
    if independence=="INDEPENDENT": score+=2
    elif independence=="DERIVATIVE": score-=2
    return score

def verification_assessment(original_inspected,extracted,source_quality_score,corroborated=False,human_reviewed=False):
    # No mechanical source-count rule. A strong inspected primary source may support
    # a narrow claim; corroboration raises confidence but is not always mandatory.
    if not original_inspected:return "NOT_ORIGINAL_VERIFIED"
    if not extracted:return "NEEDS_EXTRACTION"
    if source_quality_score>=7 and human_reviewed:return "VERIFIED"
    if source_quality_score>=5:return "MACHINE_CHECKED"
    if corroborated and source_quality_score>=4:return "MACHINE_CHECKED"
    return "NEEDS_MORE_EVIDENCE"
