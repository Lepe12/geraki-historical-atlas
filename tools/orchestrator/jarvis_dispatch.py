#!/usr/bin/env python3
"""Guarded JARVIS controlled-dispatch preflight.

The user supplies the research problem. JARVIS owns agent selection unless an
explicit manual override is supplied.
"""
from __future__ import annotations
import argparse, hashlib, json, re
from pathlib import Path
from typing import Any

from jarvis_agent_planner import plan_agents
from jarvis_runtime_guard import validate_runtime_policy
from research_query import split_research_query

POLICY_PATH = Path("tools/orchestrator/jarvis_policy.json")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_request(req: dict[str, Any]) -> dict[str, Any]:
    target = str(req.get("target", "")).strip()
    target, date_range, purpose = split_research_query(target, req.get("date_range", ""), req.get("purpose", ""))
    aliases = req.get("aliases", [])
    if isinstance(aliases, str):
        aliases = [x.strip() for x in aliases.split("|") if x.strip()]
    selected = req.get("selected_agents", req.get("selected_lanes", []))
    if isinstance(selected, str):
        selected = [x.strip() for x in selected.split(",") if x.strip()]
    return {
        "target": target,
        "aliases": [str(x).strip() for x in aliases if str(x).strip()],
        "date_range": date_range,
        "purpose": purpose,
        "selected_agents": [str(x).strip() for x in selected if str(x).strip()],
    }


def fingerprint(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _dedupe(values: list[str]) -> list[str]:
    seen = set()
    out = []
    for value in values:
        if value not in seen:
            out.append(value)
            seen.add(value)
    return out


def validate(req: dict[str, Any], policy: dict[str, Any]) -> dict[str, Any]:
    dispatch = policy.get("dispatch", {})
    if policy.get("mode") != "controlled_dispatch":
        raise ValueError("JARVIS_NOT_IN_CONTROLLED_DISPATCH_MODE")
    try:
        validate_runtime_policy(policy)
    except RuntimeError as exc:
        raise ValueError("RUNTIME_POLICY_REJECTED:" + str(exc)) from exc
    if not dispatch.get("dispatch_enabled"):
        raise ValueError("DISPATCH_DISABLED")
    if dispatch.get("kill_switch"):
        raise ValueError("KILL_SWITCH_ACTIVE")

    payload = canonical_request(req)
    if dispatch.get("require_explicit_target", True) and not payload["target"]:
        raise ValueError("TARGET_REQUIRED")

    allowed_list = list(dispatch.get("allowed_agents", []))
    allowed = set(allowed_list)
    max_parallel = int(dispatch.get("max_parallel", len(allowed_list) or 1))
    if max_parallel < 1:
        raise ValueError("INVALID_MAX_PARALLEL")

    requested = _dedupe(payload["selected_agents"])
    if requested:
        if not dispatch.get("manual_override_allowed", True):
            raise ValueError("MANUAL_AGENT_OVERRIDE_DISABLED")
        unknown = [a for a in requested if a not in allowed]
        if unknown:
            raise ValueError("AGENT_NOT_ALLOWED:" + ",".join(unknown))
        selected = requested
        selection = {
            "schema": "pct-jarvis-agent-selection-v1",
            "authority": "HUMAN_OVERRIDE",
            "strategy": "manual_override",
            "confidence": "EXPLICIT",
            "matched_profiles": [],
            "selected_agents": selected,
            "ranking": [{"agent_id": a, "score": None, "reasons": ["manual_override"]} for a in selected],
            "rule": "Manual override supplied explicitly; JARVIS records but does not expand it.",
        }
    else:
        if dispatch.get("require_explicit_selected_agents", False):
            raise ValueError("SELECTED_AGENTS_REQUIRED")
        if not dispatch.get("auto_select_agents", True):
            raise ValueError("JARVIS_AUTO_SELECTION_DISABLED")
        selection = plan_agents(payload, policy)
        selected = _dedupe(selection.get("selected_agents", []))
        unknown = [a for a in selected if a not in allowed]
        if unknown:
            raise ValueError("PLANNER_SELECTED_DISALLOWED_AGENT:" + ",".join(unknown))
        if not selected:
            raise ValueError("JARVIS_SELECTED_NO_AGENTS")

    if len(selected) > max_parallel:
        raise ValueError("TOO_MANY_SELECTED_AGENTS:%d>%d" % (len(selected), max_parallel))

    payload["selected_agents"] = selected
    payload["agent_selection"] = selection
    payload["workflow_selected_agents"] = (
        "" if len(selected) == len(allowed_list) and set(selected) == allowed
        else ",".join(selected)
    )
    return payload


def existing_fingerprints(audit_root: Path) -> dict[str, str]:
    found = {}
    if not audit_root.exists():
        return found
    for path in audit_root.glob("*.json"):
        try:
            data = load_json(path)
        except Exception:
            continue
        fp, run_id = data.get("request_fingerprint"), data.get("run_id")
        if isinstance(fp, str) and isinstance(run_id, str):
            found[fp] = run_id
    return found


def build_audit(req_path: Path, payload: dict[str, Any], run_id: str, request_id: str="") -> dict[str, Any]:
    if request_id and not re.fullmatch(r'[A-Za-z0-9._:-]{1,128}',request_id):
        raise ValueError('INVALID_REQUEST_ID')
    return {
        "schema": "pct-jarvis-dispatch-audit-v2",
        "run_id": run_id,
        "request_id":request_id or None,
        "request_file": req_path.as_posix(),
        "request_fingerprint": fingerprint(payload),
        "mode": "controlled_dispatch",
        "agent_selection": payload["agent_selection"],
        "selected_agents": payload["selected_agents"],
        "workflow_selected_agents": payload["workflow_selected_agents"],
        "target": payload["target"],
        "date_range": payload["date_range"],
        "purpose": payload["purpose"],
        "decision": "DISPATCH_APPROVED",
        "verified_promotion_allowed": False,
        "wordpress_access": False,
        "server_credentials_access": False,
    }


def duplicate_submission(audit: dict[str, Any], root: Path) -> bool:
    if not audit.get('request_id'):
        return audit['request_fingerprint'] in existing_fingerprints(root)
    for path in root.glob('*.json'):
        try:previous=load_json(path)
        except (OSError,ValueError):continue
        if previous.get('request_id')==audit['request_id']:return True
    return False


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--request", type=Path, required=True)
    p.add_argument("--run-id", required=True)
    p.add_argument("--request-id", default="")
    p.add_argument("--audit-root", type=Path, default=Path("evidence/jarvis/dispatch_audit"))
    p.add_argument("--github-output", type=Path)
    p.add_argument("--write-audit", type=Path)
    args = p.parse_args()
    if not args.run_id.isdigit():
        raise ValueError("INVALID_RUN_ID")

    policy = load_json(POLICY_PATH)
    payload = validate(load_json(args.request), policy)
    audit = build_audit(args.request, payload, args.run_id,args.request_id)
    if duplicate_submission(audit,args.audit_root):
        raise ValueError("DUPLICATE_DISPATCH_REQUEST")

    matrix = json.dumps(payload["selected_agents"], separators=(",", ":"))
    if args.github_output:
        def one_line(value):
            return str(value).replace("\r", " ").replace("\n", " ").strip()
        with args.github_output.open("a", encoding="utf-8") as fh:
            fh.write("matrix=%s\n" % matrix)
            fh.write("request_fingerprint=%s\n" % audit["request_fingerprint"])
            fh.write("target=%s\n" % one_line(payload["target"]))
            fh.write("aliases=%s\n" % one_line("|".join(payload["aliases"])))
            fh.write("date_range=%s\n" % one_line(payload["date_range"]))
            fh.write("purpose=%s\n" % one_line(payload["purpose"]))
            fh.write("selected_agents=%s\n" % one_line(",".join(payload["selected_agents"])))
            fh.write("workflow_selected_agents=%s\n" % one_line(payload["workflow_selected_agents"]))
            fh.write("selection_authority=%s\n" % one_line(payload["agent_selection"]["authority"]))
            fh.write("selection_strategy=%s\n" % one_line(payload["agent_selection"]["strategy"]))

    if args.write_audit:
        args.write_audit.parent.mkdir(parents=True, exist_ok=True)
        args.write_audit.write_text(json.dumps(audit, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")

    print(json.dumps({
        "status": "CONTROLLED_DISPATCH_APPROVED",
        "authority": payload["agent_selection"]["authority"],
        "strategy": payload["agent_selection"]["strategy"],
        "matrix": payload["selected_agents"],
        "request_fingerprint": audit["request_fingerprint"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
