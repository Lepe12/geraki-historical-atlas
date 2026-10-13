#!/usr/bin/env python3
"""Static audit for LLM scientific-safety invariants."""
from __future__ import annotations
import json
from pathlib import Path
from llm_router import load_policy,routing_summary

def audit()->dict:
    policy=load_policy()
    errors=[]
    roles=policy.get("roles",{})
    required={"planner","query_expander","evidence_extractor","synthesis","adversarial_reviewer","replanner"}
    missing=required-set(roles)
    if missing: errors.append("MISSING_ROLES:"+",".join(sorted(missing)))
    for role in ("evidence_extractor","synthesis","adversarial_reviewer"):
        if role in roles and not roles[role].get("requires_evidence"):
            errors.append("EVIDENCE_NOT_REQUIRED:"+role)
    rules=" ".join(policy.get("hard_rules",[])).lower()
    if "never historical verification" not in rules and "no llm role may emit or promote verified" not in rules:
        errors.append("NO_VERIFICATION_BARRIER")
    return {
      "schema":"pct-llm-scientific-audit-v1",
      "overall":"PASS" if not errors else "FAIL",
      "errors":errors,
      "routing":routing_summary(),
      "verified_promotion_allowed":False
    }

if __name__=="__main__":
    print(json.dumps(audit(),ensure_ascii=False,indent=2))
