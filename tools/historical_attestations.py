"""Evidence-first historical attestations for NABOU//X.

Inspired by PLATO: candidates are software suggestions, never historical facts.
No dependency on the production UI or database.
"""
from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass, asdict, replace
from datetime import datetime, timezone


def _id(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]


@dataclass(frozen=True)
class Citation:
    source_id: str
    locator: str
    exact_excerpt: str
    attribution: str = "stated"

    def __post_init__(self):
        if not all((self.source_id.strip(), self.locator.strip(), self.exact_excerpt.strip())):
            raise ValueError("source_id, locator and exact_excerpt required")
        if self.attribution not in ("stated", "inferred"):
            raise ValueError("invalid attribution")


@dataclass(frozen=True)
class Attestation:
    entity_id: str
    predicate: str
    value: str
    citations: tuple[Citation, ...]
    start_year: int | None = None
    end_year: int | None = None
    status: str = "UNREVIEWED"
    reviewer: str | None = None
    reviewed_at: str | None = None

    def __post_init__(self):
        if not all((self.entity_id, self.predicate, self.value)) or not self.citations:
            raise ValueError("attestation requires entity/predicate/value/citations")
        if self.start_year is not None and self.end_year is not None and self.start_year > self.end_year:
            raise ValueError("invalid date interval")
        if self.status not in ("UNREVIEWED", "OPERATOR_ACCEPTED", "REJECTED", "RETRACTED"):
            raise ValueError("invalid status")
        if self.status != "UNREVIEWED" and not self.reviewer:
            raise ValueError("reviewer required")

    @property
    def id(self):
        return "att_" + _id((self.entity_id, self.predicate, self.value, [asdict(c) for c in self.citations], self.start_year, self.end_year))

    def review(self, decision: str, reviewer: str):
        if self.status != "UNREVIEWED":
            raise ValueError("review is append-only; preserve old attestation")
        if decision not in ("OPERATOR_ACCEPTED", "REJECTED") or not reviewer.strip():
            raise ValueError("explicit decision and reviewer required")
        return replace(self, status=decision, reviewer=reviewer, reviewed_at=datetime.now(timezone.utc).isoformat())

    def to_record(self):
        return {**asdict(self), "id": self.id, "historically_verified": False}


@dataclass(frozen=True)
class MatchCandidate:
    subject_id: str
    object_id: str
    score: float
    algorithm: str

    def __post_init__(self):
        if not (0 <= self.score <= 1) or not self.algorithm or not self.subject_id or not self.object_id:
            raise ValueError("invalid candidate")


def freeze_candidate_set(candidates: list[MatchCandidate], run_id: str, parameters: dict):
    """Immutable JSON-ready snapshot: reruns must create a different run_id."""
    if not run_id:
        raise ValueError("run_id required")
    records = [dict(asdict(c), id="cand_" + _id([run_id, asdict(c), parameters])) for c in candidates]
    return {"schema": "nabou-candidate-set-v1", "run_id": run_id,
            "parameters": parameters, "candidates": records, "frozen": True}


def render_attestation_jsonl(attestations: list[Attestation]):
    """Lossless export of source-backed records; never labels claims VERIFIED."""
    return "".join(json.dumps(a.to_record(), ensure_ascii=False, sort_keys=True) + "\n" for a in attestations)
