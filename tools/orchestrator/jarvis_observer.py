#!/usr/bin/env python3
"""JARVIS observer adapter for the live Piratecartography evidence stream.

Reads the real 11-lane run artifacts already written under evidence/runs/.
It performs NO network calls, NO database writes, NO agent dispatch and NO
VERIFIED promotion. Output is a deterministic observer report.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from jarvis import AgentStatus, JarvisOrchestrator, ResearchTask


EXPECTED_LANES = [
    "greek",
    "travellers",
    "spanish_simancas",
    "venetian",
    "french",
    "british",
    "dutch",
    "german",
    "italian_states",
    "ottoman",
    "north_african",
]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def discover_runs(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(
        [p for p in root.iterdir() if p.is_dir() and p.name.isdigit()],
        key=lambda p: int(p.name),
    )


def latest_run_with_health(root: Path) -> Path:
    candidates = [p for p in discover_runs(root) if (p / "SYSTEM_HEALTH.json").is_file()]
    if not candidates:
        raise FileNotFoundError("NO_SYSTEM_HEALTH_RUN")
    return candidates[-1]


def build_agent_statuses(health: dict[str, Any]) -> list[AgentStatus]:
    by_lane = {r.get("lane"): r for r in health.get("lane_reports", [])}
    statuses: list[AgentStatus] = []
    for lane in EXPECTED_LANES:
        report = by_lane.get(lane, {})
        status = str(report.get("status", "MISSING"))
        available = status.startswith("OPERATIONAL")
        specialties = {lane}
        statuses.append(
            AgentStatus(
                agent_id=lane,
                available=available,
                specialties=specialties,
                active_jobs=0,
            )
        )
    return statuses


def lane_summary(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "lane": report.get("lane"),
        "status": report.get("status"),
        "repository_candidates": int(report.get("repository_candidates", 0) or 0),
        "acquisition_results": int(report.get("acquisition_results", 0) or 0),
        "event_first_hits": int(report.get("event_first_hits", 0) or 0),
        "verified_events": int(report.get("verified_events", 0) or 0),
        "verification_status": report.get("verification_status"),
        "qa_decision": report.get("qa_decision"),
        "blockers": report.get("repository_blockers", []),
        "errors": report.get("repository_errors", []),
    }


def observe(run_dir: Path) -> dict[str, Any]:
    health = load_json(run_dir / "SYSTEM_HEALTH.json")
    storage_path = run_dir / "MARIADB_STORAGE_INTENT.json"
    storage = load_json(storage_path) if storage_path.is_file() else {}

    agents = build_agent_statuses(health)
    lane_reports = [lane_summary(r) for r in health.get("lane_reports", [])]

    # Observer-only workload recommendation: if a lane is unavailable, hold it.
    # If operational, JARVIS may recommend it for future dispatch. It does not
    # dispatch anything in this mode.
    jarvis = JarvisOrchestrator(mode="observer")
    recommendations = []
    for lane in EXPECTED_LANES:
        task = ResearchTask(
            job_id=f"observer:{run_dir.name}:{lane}",
            objective=f"Assess lane readiness for {lane}",
            scope="observer-only",
            preferred_agent=lane,
        )
        decision = jarvis.choose_agent(task, agents)
        recommendations.append({
            "lane": lane,
            "decision": asdict(decision),
        })

    verified_total = sum(int(r.get("verified_events", 0) or 0) for r in lane_reports)
    candidate_total = sum(int(r.get("repository_candidates", 0) or 0) for r in lane_reports)
    blockers_total = sum(len(r.get("blockers", [])) for r in lane_reports)
    errors_total = sum(len(r.get("errors", [])) for r in lane_reports)

    return {
        "schema": "pct-jarvis-observer-report-v1",
        "run_id": run_dir.name,
        "mode": "observer",
        "source": {
            "system_health": str((run_dir / "SYSTEM_HEALTH.json").as_posix()),
            "mariadb_storage_intent": (
                str(storage_path.as_posix()) if storage_path.is_file() else None
            ),
        },
        "storage": {
            "backend": storage.get("backend"),
            "database": storage.get("database"),
            "status": storage.get("status"),
            "durable_lane_indexes": storage.get("durable_lane_indexes", []),
            "missing_lane_indexes": storage.get("missing_lane_indexes", []),
        },
        "metrics": {
            "expected_agents": len(EXPECTED_LANES),
            "operational_agents": sum(1 for a in agents if a.available),
            "candidate_sources": candidate_total,
            "verified_events": verified_total,
            "repository_blockers": blockers_total,
            "repository_errors": errors_total,
        },
        "lane_reports": lane_reports,
        "recommendations": recommendations,
        "guardrails": {
            "dispatch_performed": False,
            "database_write_performed": False,
            "verified_promotion_performed": False,
            "wordpress_touched": False,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs-root", type=Path, default=Path("evidence/runs"))
    parser.add_argument("--run-id")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    run_dir = (
        args.runs_root / args.run_id
        if args.run_id
        else latest_run_with_health(args.runs_root)
    )
    if not (run_dir / "SYSTEM_HEALTH.json").is_file():
        raise FileNotFoundError("SYSTEM_HEALTH_MISSING")

    report = observe(run_dir)
    payload = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    else:
        print(payload, end="")


if __name__ == "__main__":
    main()
