#!/usr/bin/env python3
"""Fail-closed runtime capability gate for Piratecartography JARVIS.

The planner may choose research sources, but workers are permitted to execute
only bounded SEARCH operations over preassigned connector/repository routes.
This module deliberately has no shell, subprocess, eval, exec, dynamic import,
secret resolution, network, or filesystem mutation capability.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

POLICY_PATH = Path(__file__).with_name("jarvis_policy.json")

HARD_ALLOWED_ROUTE_TYPES = {"registered_connector", "repository_dispatch"}
HARD_ALLOWED_OPERATIONS = {"search"}
HARD_CAPS = {
    "max_sources_per_assignment": 8,
    "max_queries_per_assignment": 12,
    "max_search_budget": 48,
}
DEFAULT_FORBIDDEN_KEYS = {
    "command",
    "commands",
    "shell",
    "script",
    "code",
    "python",
    "system_command",
    "subprocess",
    "env",
    "environment",
    "secret",
    "secrets",
    "credentials",
    "token",
    "api_key",
    "api_token",
}


def load_policy(path: Path = POLICY_PATH) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_runtime_policy(policy: dict[str, Any]) -> dict[str, Any]:
    guard = policy.get("runtime_guard")
    if not isinstance(guard, dict) or not guard.get("enabled"):
        raise RuntimeError("RUNTIME_GUARD_DISABLED")

    for key in ("allow_arbitrary_code", "allow_shell", "allow_subprocess"):
        if guard.get(key) is not False:
            raise RuntimeError("UNSAFE_RUNTIME_POLICY:" + key)

    allowed_operations = set(guard.get("allowed_operations") or [])
    if not allowed_operations or not allowed_operations <= HARD_ALLOWED_OPERATIONS:
        raise RuntimeError("UNSAFE_RUNTIME_OPERATIONS")

    allowed_route_types = set(guard.get("allowed_route_types") or [])
    if not allowed_route_types or not allowed_route_types <= HARD_ALLOWED_ROUTE_TYPES:
        raise RuntimeError("UNSAFE_RUNTIME_ROUTE_TYPES")

    for key, hard_max in HARD_CAPS.items():
        try:
            value = int(guard.get(key, 0))
        except (TypeError, ValueError):
            raise RuntimeError("INVALID_RUNTIME_CAP:" + key)
        if value < 1 or value > hard_max:
            raise RuntimeError("UNSAFE_RUNTIME_CAP:" + key)

    if guard.get("require_planner_authority") is not True:
        raise RuntimeError("PLANNER_AUTHORITY_NOT_REQUIRED")
    if guard.get("audit_required") is not True:
        raise RuntimeError("RUNTIME_AUDIT_NOT_REQUIRED")
    if guard.get("allow_direct_secret_values") is not False:
        raise RuntimeError("DIRECT_SECRET_VALUES_NOT_BLOCKED")
    return guard


def _scan_forbidden_keys(value: Any, forbidden: set[str], path: str = "assignment") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            normalized = str(key).strip().casefold()
            if normalized in forbidden:
                raise RuntimeError(f"FORBIDDEN_ASSIGNMENT_KEY:{path}.{key}")
            _scan_forbidden_keys(item, forbidden, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _scan_forbidden_keys(item, forbidden, f"{path}[{index}]")


def _canonical_hash(value: dict[str, Any]) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def validate_specialist_assignment(
    plan: dict[str, Any],
    agent: dict[str, Any],
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    policy = policy or load_policy()
    guard = validate_runtime_policy(policy)

    if plan.get("routing_authority") != "JARVIS_PLANNER":
        raise RuntimeError("JARVIS_PLANNER_AUTHORITY_REQUIRED")

    forbidden = set(DEFAULT_FORBIDDEN_KEYS)
    forbidden.update(str(x).strip().casefold() for x in guard.get("forbidden_assignment_keys", []))
    _scan_forbidden_keys(agent, forbidden)

    agent_id = str(agent.get("agent_id") or "").strip()
    assignment_id = str(agent.get("assignment_id") or "").strip()
    if not agent_id or not assignment_id:
        raise RuntimeError("ASSIGNMENT_IDENTITY_REQUIRED")

    routes = agent.get("assigned_sources")
    queries = agent.get("assigned_queries")
    if not isinstance(routes, list) or not routes:
        raise RuntimeError("JARVIS_ASSIGNMENT_REQUIRED_NO_ASSIGNED_SOURCES")
    if not isinstance(queries, list) or not queries:
        raise RuntimeError("JARVIS_ASSIGNMENT_REQUIRED_NO_ASSIGNED_QUERIES")

    max_sources = int(guard["max_sources_per_assignment"])
    max_queries = int(guard["max_queries_per_assignment"])
    max_budget = int(guard["max_search_budget"])
    if len(routes) > max_sources:
        raise RuntimeError(f"ASSIGNMENT_SOURCE_LIMIT_EXCEEDED:{len(routes)}>{max_sources}")
    if len(queries) > max_queries:
        raise RuntimeError(f"ASSIGNMENT_QUERY_LIMIT_EXCEEDED:{len(queries)}>{max_queries}")

    allowed_route_types = set(guard["allowed_route_types"])
    route_ids: list[str] = []
    for route in routes:
        if not isinstance(route, dict):
            raise RuntimeError("INVALID_JARVIS_ASSIGNED_ROUTE")
        route_type = str(route.get("route_type") or "")
        if route_type not in allowed_route_types:
            raise RuntimeError("RUNTIME_ROUTE_NOT_ALLOWED:" + route_type)
        route_id = str(route.get("route_id") or "").strip()
        if not route_id:
            raise RuntimeError("ROUTE_ID_REQUIRED")
        if route_type == "registered_connector":
            if not str(route.get("connector_id") or "").strip():
                raise RuntimeError("CONNECTOR_ID_REQUIRED")
            if route.get("repository"):
                raise RuntimeError("AMBIGUOUS_ROUTE_TARGET")
        elif route_type == "repository_dispatch":
            if not str(route.get("repository") or "").strip():
                raise RuntimeError("REPOSITORY_REQUIRED")
            if route.get("connector_id"):
                raise RuntimeError("AMBIGUOUS_ROUTE_TARGET")
        route_ids.append(route_id)

    clean_queries: list[str] = []
    for query in queries:
        text = str(query or "").strip()
        if not text:
            raise RuntimeError("EMPTY_ASSIGNED_QUERY")
        if len(text) > 1000:
            raise RuntimeError("ASSIGNED_QUERY_TOO_LONG")
        clean_queries.append(text)

    budget = len(routes) * len(clean_queries)
    if budget > max_budget:
        raise RuntimeError(f"ASSIGNMENT_SEARCH_BUDGET_EXCEEDED:{budget}>{max_budget}")

    declared = agent.get("query_budget")
    if isinstance(declared, dict):
        declared_total = int(declared.get("total", budget) or 0)
        declared_max = int(declared.get("max_total", max_budget) or 0)
        if declared_total != budget:
            raise RuntimeError("ASSIGNMENT_BUDGET_MISMATCH")
        if declared_max > max_budget:
            raise RuntimeError("ASSIGNMENT_DECLARED_MAX_EXCEEDS_POLICY")

    permit_payload = {
        "policy_version": int(guard.get("version", 1)),
        "routing_authority": "JARVIS_PLANNER",
        "agent_id": agent_id,
        "assignment_id": assignment_id,
        "assignment_wave": int(agent.get("assignment_wave", 1) or 1),
        "route_ids": route_ids,
        "queries": clean_queries,
        "operation": "search",
        "search_budget": budget,
    }
    permit_id = _canonical_hash(permit_payload)
    return {
        "schema": "pct-jarvis-runtime-permit-v1",
        "status": "PERMITTED",
        "permit_id": permit_id,
        **permit_payload,
        "arbitrary_code_allowed": False,
        "shell_allowed": False,
        "subprocess_allowed": False,
        "direct_secret_values_allowed": False,
    }
