#!/usr/bin/env python3
"""N7 research mission pilot: bounded, resumable specialist discovery.

This is NOT a historical verification engine. Its sole external action is
running preassigned JARVIS specialist searches behind their runtime guard.
No arbitrary commands, code-writing, database access or production deploys.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

SCHEMA = "n7-research-mission-v1"
PREFERRED = ("pirate_base", "timeline", "source_genealogy", "contradiction")
MAX_AGENTS = 4
MAX_ATTEMPTS = 2


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + "." + os.urandom(6).hex() + ".tmp")
    try:
        with tmp.open("x", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.write("\n")
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def read_json(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("INVALID_MISSION_DATA")
    return data


def mission_dir(root: Path, run_id: str) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", run_id):
        raise ValueError("INVALID_MISSION_ID")
    return root / run_id


def create_plan(target: str, purpose: str, date_range: str = "", aliases: list[str] | None = None,
                planner: Callable | None = None, policy: dict | None = None) -> dict:
    if not target.strip() or not purpose.strip() or len(target) > 300 or len(purpose) > 1200:
        raise ValueError("TARGET_AND_PURPOSE_REQUIRED")
    if policy is None:
        from jarvis_runtime_guard import load_policy
        policy = load_policy()
    from jarvis_runtime_guard import validate_runtime_policy
    validate_runtime_policy(policy)
    dispatch = policy.get("dispatch", {})
    if not dispatch.get("dispatch_enabled") or dispatch.get("kill_switch"):
        raise RuntimeError("JARVIS_DISPATCH_DISABLED")
    if planner is None:
        from jarvis_specialist_plan import build
        planner = build
    plan = planner(target.strip(), purpose.strip(), date_range.strip(), list(aliases or []), "place")
    if plan.get("routing_authority") != "JARVIS_PLANNER":
        raise RuntimeError("UNTRUSTED_PLANNER")
    available = {agent.get("agent_id"): agent for agent in plan.get("agents", [])}
    selected = [available[aid] for aid in PREFERRED if aid in available]
    if len(selected) != MAX_AGENTS or len({a["agent_id"] for a in selected}) != len(selected):
        raise RuntimeError("REQUIRED_SPECIALIST_ROLES_UNAVAILABLE")
    from jarvis_runtime_guard import validate_specialist_assignment
    for agent in selected:
        validate_specialist_assignment(plan, agent, policy)
    return {**plan, "agents": selected, "parallel_agent_count": len(selected),
            "mission_mode": "bounded_specialist_discovery", "verified_promotion_allowed": False}


def initialize(root: Path, run_id: str, target: str, purpose: str, date_range: str = "",
               aliases: list[str] | None = None, planner: Callable | None = None,
               policy: dict | None = None) -> dict:
    directory = mission_dir(root, run_id)
    checkpoint = directory / "mission.json"
    if checkpoint.exists():
        raise FileExistsError("MISSION_EXISTS_RESUME_INSTEAD")
    plan = create_plan(target, purpose, date_range, aliases, planner, policy)
    state = {"schema": SCHEMA, "run_id": run_id, "request_fingerprint": digest({
                 "target": target.strip(), "purpose": purpose.strip(), "date_range": date_range.strip(),
                 "aliases": aliases or []}),
             "created_at": utcnow(), "status": "PLANNED", "plan": plan, "steps": {
                 agent["agent_id"]: {"status": "PENDING", "attempts": 0} for agent in plan["agents"]},
             "historically_verified": False}
    atomic_json(checkpoint, state)
    return state


def load_state(root: Path, run_id: str) -> dict:
    state = read_json(mission_dir(root, run_id) / "mission.json")
    if state.get("schema") != SCHEMA or state.get("run_id") != run_id:
        raise ValueError("MISSION_IDENTITY_MISMATCH")
    if state.get("historically_verified") is not False:
        raise ValueError("UNSAFE_HISTORICAL_VERIFICATION_FLAG")
    plan = state.get("plan") or {}
    if plan.get("routing_authority") != "JARVIS_PLANNER" or plan.get("verified_promotion_allowed") is not False:
        raise ValueError("UNTRUSTED_STORED_PLAN")
    ids = [a.get("agent_id") for a in plan.get("agents", [])]
    if ids != list(PREFERRED) or set(state.get("steps", {})) != set(ids):
        raise ValueError("MISSION_AGENT_SET_CHANGED")
    return state


def summarize(state: dict) -> dict:
    steps = state["steps"]
    finished = all(row["status"] == "COMPLETED" for row in steps.values())
    any_failed = any(row["status"] == "FAILED" for row in steps.values())
    found = sum(int(row.get("candidate_records", 0)) for row in steps.values())
    contradiction_ok = steps["contradiction"]["status"] == "COMPLETED"
    pages_read = sum(int(row.get("inspected_pages", 0)) for row in steps.values())
    documents_read = sum(int(row.get("inspected_documents", 0)) for row in steps.values())
    cooccurrences = sum(int(row.get("cooccurrence_leads", 0)) for row in steps.values())
    return {"schema": "n7-research-mission-report-v1", "run_id": state["run_id"],
            "request_fingerprint": state["request_fingerprint"],
            "status": "DISCOVERY_FINISHED" if finished else ("INCOMPLETE" if any_failed else "IN_PROGRESS"),
            "agent_states": {aid: {k: row.get(k) for k in ("status", "attempts", "candidate_records", "inspected_documents", "inspected_pages", "cooccurrence_leads", "last_error") if k in row}
                             for aid, row in steps.items()},
            "discovered_record_count": found,
            "inspected_source_pages_count": pages_read,
            "inspected_source_documents_count": documents_read,
            "cooccurrence_leads_count": cooccurrences,
            "historical_attestations_verified": 0,
            "adversarial_search_completed": contradiction_ok,
            "review_status": "HUMAN_SOURCE_INSPECTION_REQUIRED",
            "historically_verified": False,
            "publication_allowed": False,
            "limitations": ["A search result is not inspected original evidence.",
                            "Contradiction-agent completion is not independent validation of factual claims.",
                            "No historical claim is promoted to VERIFIED by this mission."]}


def run(root: Path, run_id: str, worker: Callable | None = None, max_steps: int = MAX_AGENTS) -> dict:
    if not 1 <= max_steps <= MAX_AGENTS:
        raise ValueError("INVALID_STEP_BUDGET")
    directory = mission_dir(root, run_id)
    state = load_state(root, run_id)
    from jarvis_runtime_guard import load_policy, validate_specialist_assignment, validate_runtime_policy
    policy = load_policy()
    validate_runtime_policy(policy)
    if not policy.get("dispatch", {}).get("dispatch_enabled") or policy.get("dispatch", {}).get("kill_switch"):
        raise RuntimeError("JARVIS_DISPATCH_DISABLED")
    if worker is None:
        from jarvis_specialist_worker import run_one
        worker = run_one
    executed = 0
    for agent in state["plan"]["agents"]:
        aid = agent["agent_id"]
        step = state["steps"][aid]
        if step["status"] == "COMPLETED" or step["attempts"] >= MAX_ATTEMPTS:
            continue
        if executed >= max_steps:
            break
        # Re-read live policy before each unit of external work.
        policy = load_policy()
        validate_runtime_policy(policy)
        if not policy.get("dispatch", {}).get("dispatch_enabled") or policy.get("dispatch", {}).get("kill_switch"):
            raise RuntimeError("JARVIS_DISPATCH_DISABLED")
        validate_specialist_assignment(state["plan"], agent, policy)
        step["attempts"] += 1
        step["status"] = "RUNNING"
        step.pop("last_error", None)
        state["status"] = "IN_PROGRESS"
        atomic_json(directory / "mission.json", state)
        executed += 1
        try:
            # The validated worker is bounded to JARVIS-assigned search routes.
            result = worker(agent, state["plan"], run_id=run_id,
                            event_root=directory / "events", history_path=directory / "task_history.jsonl")
            if result.get("agent_id") != aid or result.get("verified_promotion_allowed") is not False:
                raise ValueError("UNTRUSTED_WORKER_RESULT")
            if not isinstance(result.get("search_runs"), list) or not result["search_runs"]:
                raise ValueError("INVALID_WORKER_RESULT")
            if not any(isinstance(row, dict) and row.get("status") in ("EXECUTED", "PARTIAL")
                       for row in result["search_runs"]):
                raise ValueError("NO_SUCCESSFUL_SEARCH_ROUTES")
            atomic_json(directory / "results" / f"{aid}.json", result)
            step["status"] = "COMPLETED"
            step["candidate_records"] = sum(len(row.get("records") or []) for row in result["search_runs"]
                                            if isinstance(row, dict) and isinstance(row.get("records"), list))
            inspected = (result.get("source_inspection") or {}).get("inspected_pages") or []
            readable=[row for row in inspected if row.get("status") in
                      ("PAGE_READ_NO_EVENT_MATCH", "CO_OCCURRENCE_NEEDS_REVIEW")]
            step["inspected_documents"] = len(readable)
            step["inspected_pages"] = sum(max(1,int(row.get("pages_read") or 1)) for row in readable)
            step["cooccurrence_leads"] = sum(row.get("status") == "CO_OCCURRENCE_NEEDS_REVIEW" for row in inspected)
            # Memory is private to the mission, learning search performance only.
            try:
                from tools.memory.naboux_memory import load, save, learn_specialist_result
                memory_path = directory / "routing_memory.json"
                memory = load(memory_path)
                learn_specialist_result(memory, result, run_id)
                save(memory, memory_path)
            except Exception as exc:
                step["memory_warning"] = type(exc).__name__
        except Exception as exc:
            step["status"] = "FAILED"
            step["last_error"] = type(exc).__name__ + ": " + str(exc)[:300]
        atomic_json(directory / "mission.json", state)
    report = summarize(state)
    # Produce the actual historical research artifact, not just a count of search hits.
    report["research_question"] = str(state["plan"].get("purpose") or state["plan"].get("target") or "")[:1200]
    from n7_research_dossier import write_dossier
    dossier = write_dossier(directory, report)
    report["research_dossier"] = "research_dossier.md"
    report["research_dossier_json"] = "research_dossier.json"
    report["readable_source_count"] = dossier["readable_source_count"]
    report["same_page_person_place_leads"] = len(dossier["same_page_person_place_leads"])
    report["historically_verified"] = False
    state["status"] = report["status"]
    atomic_json(directory / "mission.json", state)
    atomic_json(directory / "report.json", report)
    return report


def run_until_exhausted(root: Path, run_id: str, worker: Callable | None = None) -> dict:
    """Resume unfinished routes within the existing per-route attempt budget."""
    for _ in range(MAX_ATTEMPTS):
        report = run(root, run_id, worker=worker)
        if not any(
            step["status"] != "COMPLETED" and step["attempts"] < MAX_ATTEMPTS
            for step in report["agent_states"].values()
        ):
            break
    return report


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("action", choices=("init", "run", "run-until-exhausted", "status"))
    p.add_argument("--root", default=".n7_missions")
    p.add_argument("--run-id", required=True)
    p.add_argument("--target", default="")
    p.add_argument("--purpose", default="")
    p.add_argument("--date-range", default="")
    p.add_argument("--aliases", default="")
    p.add_argument("--max-steps", type=int, default=MAX_AGENTS)
    args = p.parse_args()
    root = Path(args.root)
    if args.action == "init":
        result = initialize(root, args.run_id, args.target, args.purpose, args.date_range,
                            [x.strip() for x in args.aliases.split("|") if x.strip()])
        print(json.dumps({"run_id": result["run_id"], "status": result["status"],
                          "agents": list(result["steps"])}, ensure_ascii=False))
    elif args.action == "run":
        print(json.dumps(run(root, args.run_id, max_steps=args.max_steps), ensure_ascii=False, indent=2))
    elif args.action == "run-until-exhausted":
        print(json.dumps(run_until_exhausted(root, args.run_id), ensure_ascii=False, indent=2))
    else:
        print(json.dumps(summarize(load_state(root, args.run_id)), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
