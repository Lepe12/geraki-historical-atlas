#!/usr/bin/env python3
"""Three real, isolated two-file Qwen-Coder trial tasks.

Each task starts from the same committed frontend source and runs in a fresh
temp directory; failures never write a frontend file. The first successful,
checked proposal may be copied back to the working tree solely for a draft PR.
"""
from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from pathlib import Path

from nabou_coding_agent import AgentError
from nabou_coding_task import apply_atomically, make_patch, prepare_changes

TARGETS = (
    "jarvis-intelligence-chamber/navigation-rail.css",
    "jarvis-intelligence-chamber/photon-windows.css",
)
TRIALS = (
    (
        "forced-colors",
        "Add one small CSS @media(forced-colors:active) focus-visible rule in EACH file "
        "using an insert_after anchored to ONE existing, unique short rule. "
        "Use system Highlight color for visible keyboard focus. "
        "In navigation-rail.css target .nabou-rail-item:focus-visible; "
        "in photon-windows.css target .nx-workspace .nx-dock button:focus-visible. "
        "Keep all existing CSS untouched, including the 3D safety lock. "
        "Return JSON edits only; no full-file rewrite.",
        "forced-colors",
    ),
    (
        "more-contrast",
        "In each CSS file add ONE short @media(prefers-contrast:more) rule to improve "
        "focus outline visibility. In navigation-rail.css use .nabou-rail-item:focus-visible. "
        "In photon-windows.css use .nx-workspace .nx-dock button:focus-visible. "
        "Prefer a small unique insert_after anchor instead of copying long blocks. "
        "Do not delete any existing style or change 3D, layout, colors outside focus.",
        "prefers-contrast",
    ),
    (
        "less-transparency",
        "In each CSS file add ONE short @media(prefers-reduced-transparency:reduce) "
        "rule to reduce backdrop-filter/blur for keyboard-accessible surfaces. "
        "In navigation-rail.css target .nabou-rail; in photon-windows.css target "
        ".nx-workspace .photon-window. Only append short safe override CSS, "
        "keep existing styles and the 3D map lock unchanged. "
        "Use a unique exact anchor insert_after edit and return JSON only.",
        "prefers-reduced-transparency",
    ),
)


def run_trials(repo: Path, report_dir: Path, model: str, endpoint: str = "", token: str = "") -> dict:
    report_dir.mkdir(parents=True, exist_ok=True)
    overall: dict = {"model": model, "results": [], "selected_trial": None}
    selected = None
    for number, (name, task, required) in enumerate(TRIALS, 1):
        record: dict = {"number": number, "name": name, "status": "blocked"}
        with tempfile.TemporaryDirectory(prefix="nabou-coder-trial-") as temp:
            trial_repo = Path(temp)
            try:
                for target in TARGETS:
                    destination = trial_repo / target
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(repo / target, destination)
                changes = prepare_changes(
                    trial_repo, list(TARGETS), task, model=model,
                    endpoint=endpoint, token=token,
                )
                if any(required not in change["candidate"] for change in changes):
                    raise AgentError("TASK_POSTCONDITION_MISSING_" + required)
                original_lock = "#nxMediterranean{display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}"
                photon = changes[1]
                if original_lock not in photon["original"] or original_lock not in photon["candidate"]:
                    raise AgentError("PROTECTED_3D_CSS_LOCK_CHANGED")
                checks = apply_atomically(changes)
                if not all(entry["ok"] is True for entry in checks):
                    raise AgentError("UNKNOWN_SYNTAX_CHECK")
                patch = make_patch(changes)
                (report_dir / ("trial-%d.patch" % number)).write_text(patch, encoding="utf-8")
                record.update({"status": "passed", "files": [
                    {"target": c["target"], "edit_count": c["edit_count"],
                     "attempts": c["model_attempts"]} for c in changes]})
                if selected is None:
                    selected = changes
                    overall["selected_trial"] = number
            except (AgentError, OSError, ValueError, RuntimeError) as error:
                record["error"] = (type(error).__name__ + ": " + str(error))[:500]
        (report_dir / ("trial-%d.json" % number)).write_text(
            json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        overall["results"].append(record)
        print(json.dumps(record, ensure_ascii=False), flush=True)

    if selected is not None:
        for change in selected:
            (repo / change["target"]).write_text(change["candidate"], encoding="utf-8")
    overall["passed"] = sum(r["status"] == "passed" for r in overall["results"])
    overall["failed"] = len(TRIALS) - overall["passed"]
    (report_dir / "summary.json").write_text(
        json.dumps(overall, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "TRIALS_COMPLETED", "passed": overall["passed"],
                      "failed": overall["failed"], "selected_trial": overall["selected_trial"]}))
    return overall


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--report-dir", type=Path, default=Path("coder_trial_reports"))
    parser.add_argument("--model", default="Qwen/Qwen2.5-Coder-7B-Instruct-GGUF")
    args = parser.parse_args()
    report = run_trials(args.repo.resolve(), args.report_dir.resolve(), model=args.model)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
