#!/usr/bin/env python3
"""Opt-in fast evaluation mode for the PCT research workflow.

Production behaviour is unchanged: with eval fast mode off, the lane matrix is
exactly the previous inline logic (blank selection = all eleven lanes) and the
specialist wave always runs.

With eval fast mode on (workflow input ``eval_fast_mode``):
  * an explicit selection of 1..3 lanes is required (taken per question from
    evaluation/eval_fast_lane_map.json by the evaluation orchestrator);
  * the specialist wave runs only when ``travellers`` is selected, because its
    normalized output is consumed only by the travellers lane;
  * an INCOMPLETE end-to-end validation is reported as a warning (and recorded
    in research_answer/eval_fast_mode.json) instead of failing the run.
"""
import argparse, json, os, pathlib, sys

ALLOWED_LANES = ["greek", "travellers", "spanish_simancas", "venetian", "french", "british",
                 "dutch", "german", "italian_states", "ottoman", "north_african"]
FAST_MODE_MAX_LANES = 3
REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_LANE_MAP = REPO_ROOT / "evaluation" / "eval_fast_lane_map.json"
DEFAULT_EVAL_SET = REPO_ROOT / "evaluation" / "research_eval_set.v2.pending.json"


def truthy(value):
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def parse_selection(raw):
    """Previous inline matrix logic, unchanged: validate, de-duplicate, keep order."""
    raw = (raw or "").strip()
    if not raw:
        return list(ALLOWED_LANES)
    selected = []
    for lane in [x.strip() for x in raw.split(",") if x.strip()]:
        if lane not in ALLOWED_LANES:
            raise SystemExit("UNKNOWN_RESEARCH_LANE:" + lane)
        if lane not in selected:
            selected.append(lane)
    if not selected:
        raise SystemExit("EMPTY_RESEARCH_LANE_SELECTION")
    return selected


def resolve_plan(raw, fast_mode):
    if not fast_mode:
        return {"matrix": parse_selection(raw), "run_specialists": True, "eval_fast_mode": False}
    if not (raw or "").strip():
        raise SystemExit("EVAL_FAST_MODE_REQUIRES_EXPLICIT_LANES")
    selected = parse_selection(raw)
    if len(selected) > FAST_MODE_MAX_LANES:
        raise SystemExit("EVAL_FAST_MODE_TOO_MANY_LANES:%d>%d" % (len(selected), FAST_MODE_MAX_LANES))
    return {"matrix": selected, "run_specialists": "travellers" in selected, "eval_fast_mode": True}


def scorable_item_ids(eval_path=DEFAULT_EVAL_SET):
    data = json.loads(pathlib.Path(eval_path).read_text(encoding="utf-8"))
    return [i["id"] for i in data["items"] if i.get("review_status") != "NEEDS_HISTORIAN"]


def load_lane_map(path=DEFAULT_LANE_MAP, eval_path=DEFAULT_EVAL_SET):
    """Load and validate the per-question lane map; returns {item_id: [lanes]}."""
    data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    items = data.get("items")
    if not isinstance(items, dict) or not items:
        raise ValueError("LANE_MAP_NO_ITEMS")
    out = {}
    for item_id, entry in items.items():
        lanes = entry.get("lanes") or []
        if not 2 <= len(lanes) <= FAST_MODE_MAX_LANES:
            raise ValueError("LANE_MAP_LANE_COUNT:" + item_id)
        if len(set(lanes)) != len(lanes):
            raise ValueError("LANE_MAP_DUPLICATE_LANE:" + item_id)
        for lane in lanes:
            if lane not in ALLOWED_LANES:
                raise ValueError("LANE_MAP_UNKNOWN_LANE:%s:%s" % (item_id, lane))
        if not str(entry.get("rationale") or "").strip():
            raise ValueError("LANE_MAP_MISSING_RATIONALE:" + item_id)
        out[item_id] = list(lanes)
    if eval_path is not None:
        expected = set(scorable_item_ids(eval_path))
        missing, extra = sorted(expected - set(out)), sorted(set(out) - expected)
        if missing or extra:
            raise ValueError("LANE_MAP_ITEM_MISMATCH missing=%s extra=%s" % (missing, extra))
    return out


def validation_warning(run_id, root="evidence/runs"):
    """Fast mode only: report an INCOMPLETE validation without failing the job."""
    answer_dir = pathlib.Path(root) / str(run_id) / "research_answer"
    report_path = answer_dir / "validation_report.json"
    if not report_path.exists():
        print("EVAL_FAST_MODE_VALIDATION_REPORT_MISSING", report_path)
        return 1
    report = json.loads(report_path.read_text(encoding="utf-8"))
    status = report.get("status")
    marker = {"schema": "pct-eval-fast-mode-v1", "eval_fast_mode": True, "validation_status": status,
              "validation_gate": "REPORTED_AS_WARNING" if status == "INCOMPLETE" else "PASSED",
              "blockers": report.get("blockers", []),
              "rule": "Eval fast mode reports INCOMPLETE as a warning; production runs still fail on it."}
    (answer_dir / "eval_fast_mode.json").write_text(json.dumps(marker, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if status == "INCOMPLETE":
        print("::warning title=RESEARCH_E2E_VALIDATION INCOMPLETE (eval fast mode)::"
              "Reported, not failing. Blockers: " + ", ".join(map(str, marker["blockers"])) )
    print("EVAL_FAST_MODE_VALIDATION", status)
    return 0


def main(argv=None):
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("matrix", help="print GitHub outputs for the lane matrix")
    v = sub.add_parser("validation-warning")
    v.add_argument("--run-id", required=True)
    lk = sub.add_parser("lanes", help="print the comma-separated lanes for one eval item")
    lk.add_argument("item_id")
    a = p.parse_args(argv)
    if a.cmd == "matrix":
        plan = resolve_plan(os.environ.get("PCT_SELECTED_AGENTS", ""), truthy(os.environ.get("PCT_EVAL_FAST_MODE")))
        print("matrix=" + json.dumps(plan["matrix"], separators=(",", ":")))
        print("run_specialists=" + ("true" if plan["run_specialists"] else "false"))
        print("eval_fast_mode=" + ("true" if plan["eval_fast_mode"] else "false"))
        return 0
    if a.cmd == "validation-warning":
        return validation_warning(a.run_id)
    print(",".join(load_lane_map()[a.item_id]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
