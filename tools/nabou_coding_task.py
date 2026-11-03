#!/usr/bin/env python3
"""NABOU multi-file coding task: plan -> validate -> atomically apply -> review.

Uses the original NABOU Coding Agent's pinned local Qwen/HTTPS inference and
strict frontend path allowlist. No arbitrary commands, merge, or deployment.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

from nabou_coding_agent import (
    AgentError, DEFAULT_ENDPOINT, DEFAULT_MODEL,
    build_candidate, check_syntax, infer_model, parse_proposal, validate_target,
)

MAX_FILES = 3
MAX_TOTAL_DELTA = 7500


def selected_files(value: str) -> list[str]:
    """Caller gives a bounded explicit scope; the model may not expand it."""
    paths = [part.strip() for part in value.split(",")]
    if not (2 <= len(paths) <= MAX_FILES):
        raise AgentError("Multi-file tasks require 2 or 3 explicit targets")
    if any(not path for path in paths) or len(set(paths)) != len(paths):
        raise AgentError("Target paths must be unique and nonempty")
    return paths


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def prepare_changes(
    repo: Path,
    targets: list[str],
    task: str,
    *,
    model: str,
    endpoint: str,
    token: str,
    proposals: dict | None = None,
) -> list[dict]:
    """Plan/validate *all* files before touching a single original."""
    paths = [(target, validate_target(repo, target)) for target in targets]
    if proposals is not None and set(proposals) != set(targets):
        raise AgentError("Offline proposal file keys must match the selected files exactly")

    changes: list[dict] = []
    for target, path in paths:
        original = path.read_text(encoding="utf-8")
        if proposals is not None:
            raw = json.dumps(proposals[target], ensure_ascii=False)
        else:
            coordinated_task = (
                task + "\nThis is a coordinated task for these approved files: "
                + ", ".join(targets)
                + ". You are editing ONLY " + target
                + ". Make the smallest correct change in this file; "
                + "any peer-file modifications will be reviewed separately. "
                + "Return precise JSON old/new edits matching this file verbatim."
            )
            raw = infer_model(coordinated_task, original, target, endpoint, model, token)
        proposal = parse_proposal(raw)
        candidate = build_candidate(original, proposal)
        changes.append({
            "target": target, "path": path, "original": original,
            "candidate": candidate, "summary": str(proposal.get("summary", ""))[:200],
            "edit_count": len(proposal["edits"]),
        })

    if sum(abs(len(c["candidate"]) - len(c["original"])) for c in changes) > MAX_TOTAL_DELTA:
        raise AgentError("Combined diff exceeds multi-file change budget")
    return changes


def check_css_structure(path: Path) -> dict:
    """Conservative CSS delimiter/comment check (NOT a complete CSS parser)."""
    src = path.read_text(encoding="utf-8")
    depth = 0
    quote = None
    in_comment = False
    i = 0
    while i < len(src):
        c = src[i]
        nxt = src[i + 1] if i + 1 < len(src) else ""
        if in_comment:
            if c == "*" and nxt == "/":
                in_comment = False
                i += 2
                continue
        elif quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
        elif c == "/" and nxt == "*":
            in_comment = True
            i += 2
            continue
        elif c in ("'", '"'):
            quote = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth < 0:
                return {"command": "CSS delimiter check", "ok": False, "stderr": "unmatched }"}
        i += 1
    ok = depth == 0 and not quote and not in_comment
    return {"command": "CSS delimiter check (not full parser)", "ok": ok,
            "stderr": "" if ok else "unclosed CSS block, string or comment"}


def check_file(path: Path) -> dict:
    if path.suffix == ".css":
        return check_css_structure(path)
    return check_syntax(path)


def apply_atomically(changes: list[dict]) -> list[dict]:
    """Every permitted file is restored if ANY syntax/IO validation fails."""
    originals = [(change["path"], change["original"]) for change in changes]
    written: list[Path] = []
    try:
        for change in changes:
            written.append(change["path"])
            change["path"].write_text(change["candidate"], encoding="utf-8")
        checks: list[dict] = []
        for change in changes:
            check = check_file(change["path"])
            checks.append({"target": change["target"], **check})
            if check["ok"] is False:
                raise AgentError("Syntax check failed for " + change["target"])
        return checks
    except BaseException:
        failures: list[str] = []
        for path, original in originals:
            if path not in written:
                continue
            try:
                path.write_text(original, encoding="utf-8")
            except OSError:
                failures.append(str(path))
        if failures:
            raise AgentError("ROLLBACK_FAILED: " + ", ".join(failures))
        raise


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--files", required=True, help="2-3 comma-separated approved frontend files")
    parser.add_argument("--task", required=True, help="One coordinated development task")
    parser.add_argument("--model", default=os.environ.get("NABOU_CODE_MODEL", DEFAULT_MODEL))
    parser.add_argument("--endpoint", default=os.environ.get("NABOU_CODE_ENDPOINT", DEFAULT_ENDPOINT))
    parser.add_argument("--proposals-file", type=Path, help="Offline test fixture; never passed by production workflow")
    parser.add_argument("--apply", action="store_true", help="Write only after all proposals validate")
    parser.add_argument("--report", type=Path, default=Path("agent_task_result.json"))
    args = parser.parse_args(argv)

    report: dict = {
        "agent": "NABOU Multi-file Coding Agent v0.2",
        "status": "blocked", "mode": "apply" if args.apply else "preview",
        "model": args.model,
    }
    try:
        if not 8 <= len(args.task.strip()) <= 2000:
            raise AgentError("Task description must be 8-2000 characters")
        targets = selected_files(args.files)
        repo = args.repo.resolve()
        proposals = None
        if args.proposals_file:
            content = json.loads(args.proposals_file.read_text(encoding="utf-8"))
            if not isinstance(content, dict):
                raise AgentError("Offline proposals must be an object keyed by target")
            proposals = content
        changes = prepare_changes(
            repo, targets, args.task, model=args.model, endpoint=args.endpoint,
            token=os.environ.get("NABOU_CODE_API_KEY", ""), proposals=proposals,
        )
        report["files"] = [
            {
                "target": c["target"], "edit_count": c["edit_count"],
                "summary": c["summary"],
                "before_sha256": _sha(c["original"]),
                "after_sha256": _sha(c["candidate"]),
            }
            for c in changes
        ]
        if args.apply:
            report["checks"] = apply_atomically(changes)
            report["status"] = "applied"
        else:
            report["status"] = "preview_only"
    except (AgentError, OSError, UnicodeError, ValueError, KeyError,
            subprocess.TimeoutExpired) as exc:
        report.update({"status": "blocked", "error": str(exc)[:700]})

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] in ("applied", "preview_only") else 1


if __name__ == "__main__":
    sys.exit(main())
