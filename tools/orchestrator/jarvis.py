#!/usr/bin/env python3
"""JARVIS orchestration core for Piratecartography.

Safe scaffold only:
- no database credentials
- no network calls
- no agent writes
- observer mode by default

The live storage adapter and agent transport must be supplied separately.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from hashlib import sha256
from typing import Iterable, Optional


class ResultState(str, Enum):
    CANDIDATE = "CANDIDATE"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    DUPLICATE = "DUPLICATE"
    UNRESOLVED = "UNRESOLVED"


@dataclass(frozen=True)
class ResearchTask:
    job_id: str
    objective: str
    scope: str = ""
    preferred_agent: Optional[str] = None

    @property
    def fingerprint(self) -> str:
        normalized = " ".join((self.objective + " " + self.scope).lower().split())
        return sha256(normalized.encode("utf-8")).hexdigest()


@dataclass
class AgentStatus:
    agent_id: str
    available: bool = True
    specialties: set[str] = field(default_factory=set)
    active_jobs: int = 0


@dataclass
class ResearchResult:
    job_id: str
    agent_id: str
    state: ResultState = ResultState.CANDIDATE
    source_name: str = ""
    retrieved_at: str = ""
    evidence_count: int = 0


@dataclass
class Decision:
    action: str
    reason: str
    agent_id: Optional[str] = None
    duplicate_of: Optional[str] = None


class JarvisOrchestrator:
    """Deterministic orchestration logic with no external side effects."""

    def __init__(self, mode: str = "observer") -> None:
        self.mode = mode

    def detect_duplicate(
        self,
        task: ResearchTask,
        existing_tasks: Iterable[ResearchTask],
    ) -> Optional[ResearchTask]:
        for existing in existing_tasks:
            if existing.fingerprint == task.fingerprint:
                return existing
        return None

    def choose_agent(
        self,
        task: ResearchTask,
        agents: Iterable[AgentStatus],
    ) -> Decision:
        available = [a for a in agents if a.available]

        if task.preferred_agent:
            for agent in available:
                if agent.agent_id == task.preferred_agent:
                    return Decision(
                        action="ASSIGN",
                        reason="preferred_agent_available",
                        agent_id=agent.agent_id,
                    )

        if not available:
            return Decision(action="HOLD", reason="no_agent_available")

        selected = min(available, key=lambda a: (a.active_jobs, a.agent_id))
        return Decision(
            action="ASSIGN",
            reason="lowest_active_job_count",
            agent_id=selected.agent_id,
        )

    def plan(
        self,
        task: ResearchTask,
        existing_tasks: Iterable[ResearchTask],
        agents: Iterable[AgentStatus],
    ) -> Decision:
        duplicate = self.detect_duplicate(task, existing_tasks)
        if duplicate:
            return Decision(
                action="SKIP_DUPLICATE",
                reason="identical_task_fingerprint",
                duplicate_of=duplicate.job_id,
            )

        return self.choose_agent(task, agents)

    def quality_gate(self, result: ResearchResult) -> Decision:
        if not result.source_name or not result.retrieved_at:
            return Decision(action="NEEDS_REVIEW", reason="missing_provenance")

        if result.evidence_count <= 0:
            return Decision(action="NEEDS_REVIEW", reason="no_evidence")

        if result.state == ResultState.VERIFIED:
            return Decision(
                action="NEEDS_REVIEW",
                reason="automatic_verified_promotion_disabled",
            )

        return Decision(action="ACCEPT_CANDIDATE", reason="minimum_gate_passed")


if __name__ == "__main__":
    print("JARVIS scaffold loaded in observer mode; no live actions performed.")
