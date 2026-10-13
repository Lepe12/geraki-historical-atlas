#!/usr/bin/env python3
"""Generic JARVIS recovery policy for Piratecartography.

Deterministic, auditable, and evidence-safe. It decides RETRY / REPLAN /
ESCALATE / ABORT from structured lane outcomes. It never promotes evidence.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
from enum import Enum
import json

class RecoveryAction(str, Enum):
    RETRY="RETRY"
    REPLAN="REPLAN"
    ESCALATE="ESCALATE"
    ABORT="ABORT"
    ACCEPT="ACCEPT"

@dataclass
class RecoveryDecision:
    action: RecoveryAction
    reason: str
    max_retries: int = 0
    route: str | None = None
    human_review: bool = False
    def to_dict(self): return asdict(self)

TRANSIENT_MARKERS=("timeout","timed out","temporarily","remote disconnected","connection reset","502","503","504")
BLOCKER_MARKERS=("AUTH_OR_BROWSER_REQUIRED","ARCHIVE_NOT_CONFIRMED","BROWSER_AGENT_REQUIRED","LOGIN_REQUIRED","CAPTCHA")

def decide(status: str, error: str="", candidate_events: int=0, verified_events: int=0, attempts: int=1) -> RecoveryDecision:
    blob=(status+" "+error).lower()
    if verified_events>0 or candidate_events>0:
        return RecoveryDecision(RecoveryAction.ACCEPT,"research produced reviewable evidence")
    if any(x.lower() in blob for x in BLOCKER_MARKERS):
        return RecoveryDecision(RecoveryAction.ESCALATE,"archive/tool access blocker with zero candidates",route="archive_specialist")
    if any(x in blob for x in TRANSIENT_MARKERS):
        if attempts < 2:
            return RecoveryDecision(RecoveryAction.RETRY,"transient execution failure",max_retries=1)
        return RecoveryDecision(RecoveryAction.REPLAN,"transient failure repeated; change route")
    if status in {"NO_EVENT_CANDIDATES","NO_CANDIDATE_TO_VERIFY","ZERO_CANDIDATES"}:
        return RecoveryDecision(RecoveryAction.REPLAN,"zero candidates without explicit access blocker")
    if status in {"FAILED","ERROR"}:
        return RecoveryDecision(RecoveryAction.REPLAN,"lane failed; alternate method required")
    return RecoveryDecision(RecoveryAction.ABORT,"unclassified state requires human review",human_review=True)

if __name__=="__main__":
    import argparse
    p=argparse.ArgumentParser()
    p.add_argument("--status",required=True); p.add_argument("--error",default="")
    p.add_argument("--candidate-events",type=int,default=0); p.add_argument("--verified-events",type=int,default=0); p.add_argument("--attempts",type=int,default=1)
    a=p.parse_args()
    print(json.dumps(decide(a.status,a.error,a.candidate_events,a.verified_events,a.attempts).to_dict(),indent=2))
