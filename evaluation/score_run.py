#!/usr/bin/env python3
"""Offline scorer for NABOU//X research runs against evaluation/research_eval_set.v1.json.

Reads an existing run output (command-center/live/runs/<run_id>.json snapshot, or a bare
research_answer answer.json) and scores it against one or more eval items. It never contacts
the network or the backend.

Usage:
  python3 evaluation/score_run.py --run 39477311589 --item ID-01-lantzas-aliases
  python3 evaluation/score_run.py --run path/to/run.json --item SY-01-milos-1660-1680 --out report.json
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_EVAL = ROOT / "evaluation" / "research_eval_set.v1.json"
RUNS_DIR = ROOT / "command-center" / "live" / "runs"

# Statuses where the system does NOT present a final answer (honest "not enough evidence"/"not done").
NON_ASSERTIVE_STATUSES = {
    "INSUFFICIENT_ACQUIRED_EVIDENCE",
    "INSUFFICIENT_EVIDENCE",
    "EXTRACTION_FAILED_OR_UNSUPPORTED",
    "BLOCKED_CONFIGURATION",
    "RESEARCH_COVERAGE_PENDING",
    "SYNTHESIS_REJECTED_INVALID_CITATIONS",
    "FINAL_ANSWER_REVIEW_FAILED",
    "NO_EVIDENCE",
}
HEDGES = [
    "possibl", "perhaps", "may be", "might", "unresolved", "uncertain", "not established", "unverified",
    "whether", "unclear", "unknown", "πιθαν", "ισως", "αβεβαι", "δεν ειναι βεβαιο", "αγνωστ", "ασαφ",
    "δεν εχει επιβεβαιωθ", "ανεπιβεβαιωτ", "εαν", "αν προκειται",
]


def norm(text) -> str:
    if text is None:
        return ""
    if not isinstance(text, str):
        text = json.dumps(text, ensure_ascii=False)
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.lower().replace("ς", "σ").replace("ſ", "s")
    text = re.sub(r"-\s*\n\s*", "", text)
    return re.sub(r"\s+", " ", text).strip()


def matches(text_norm: str, groups) -> bool:
    """Every group must have at least one needle present (needles normalised the same way)."""
    if not groups:
        return False
    return all(any(norm(n) in text_norm for n in g) for g in groups)


def has_hedge(text_norm: str) -> bool:
    return any(h in text_norm for h in HEDGES)


def _urls(obj, out: set):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("url", "identifier", "source_url", "pdf_url") and isinstance(v, str) and v:
                out.add(v.strip())
            else:
                _urls(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _urls(v, out)


def load_run(path_or_id: str) -> dict:
    p = pathlib.Path(path_or_id)
    if not p.exists() and re.fullmatch(r"\d+", path_or_id):
        p = RUNS_DIR / f"{path_or_id}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    return normalise_run(data, run_ref=str(path_or_id))


def normalise_run(data: dict, run_ref: str = "") -> dict:
    """Turn a run snapshot or a bare research_answer into the fields the scorer uses."""
    if "research_answer" in data or "discoveries" in data:
        ra = data.get("research_answer") or {}
        discoveries = data.get("discoveries") or []
        mission = data.get("mission") or {}
        contradictions = (data.get("contradictions") or {}).get("records") or []
        run_id = data.get("run_id") or run_ref
    else:
        ra = data
        discoveries = []
        mission = {}
        contradictions = []
        run_id = run_ref
    evidence = ra.get("evidence") or []
    evidence_text = {e.get("evidence_id"): norm(e.get("text")) for e in evidence if e.get("evidence_id")}
    evidence_meta = {
        e.get("evidence_id"): norm([e.get("text"), [o.get("title") for o in (e.get("occurrences") or [])]])
        for e in evidence if e.get("evidence_id")
    }
    source_urls: set = set()
    _urls(discoveries, source_urls)
    _urls(evidence, source_urls)
    unknowns = ra.get("unknowns") or []
    limitations = ra.get("limitations") or []
    sections = ra.get("answer_sections") or []
    return {
        "run_id": str(run_id),
        "target": mission.get("target"),
        "status": ra.get("status"),
        "claims": ra.get("claims") or [],
        "sections": [norm(s.get("text", "")) for s in sections if isinstance(s, dict)],
        "sections_text": norm(" ".join(s.get("text", "") for s in sections if isinstance(s, dict))),
        "unknowns_text": norm(unknowns),
        "limitations": limitations,
        "evidence_text": evidence_text,
        "evidence_meta": evidence_meta,
        "has_evidence_list": bool(evidence),
        "source_urls": source_urls,
        "discoveries": discoveries,
        "corpus_text": norm([
            [{k: d.get(k) for k in ("title", "url", "identifier", "repository")} for d in discoveries],
            [[{k: o.get(k) for k in ("title", "url")} for o in (e.get("occurrences") or [])] for e in evidence],
            [[{k: o.get(k) for k in ("title", "url")} for o in (c.get("source_occurrences") or [])] for c in (ra.get("claims") or [])],
        ]),
        "contradictions_text": norm(contradictions),
    }


def claim_text(c: dict) -> str:
    parts = [c.get("statement"), c.get("quote"), c.get("actors"), c.get("places"), c.get("dates")]
    return norm(" ".join(p if isinstance(p, str) else json.dumps(p, ensure_ascii=False) for p in parts if p))


def check_claim(c: dict, run: dict) -> dict:
    occ = c.get("source_occurrences") or []
    urls = [o.get("url") or (o.get("locator") or {}).get("url") for o in occ]
    urls = [u for u in urls if u]
    ev_id = c.get("evidence_id")
    cited = bool(urls or ev_id)
    problems = []
    if not cited:
        problems.append("UNCITED")
    if ev_id and run["has_evidence_list"] and ev_id not in run["evidence_text"]:
        problems.append("EVIDENCE_ID_NOT_IN_RUN")
    for u in urls:
        if u.strip() not in run["source_urls"]:
            problems.append(f"URL_NOT_IN_RUN:{u}")
    quote = norm(c.get("quote"))
    quote_found = None
    if quote and ev_id in run["evidence_text"]:
        quote_found = quote in run["evidence_text"][ev_id]
        if not quote_found:
            problems.append("QUOTE_NOT_IN_EVIDENCE")
    hallucinated = any(p == "EVIDENCE_ID_NOT_IN_RUN" or p.startswith("URL_NOT_IN_RUN") for p in problems)
    return {
        "claim_id": c.get("claim_id"),
        "statement": (c.get("statement") or "")[:300],
        "kind": c.get("kind"),
        "excerpt_only": c.get("kind") == "acquired_excerpt",
        "cited": cited,
        "hallucinated_citation": hallucinated,
        "quote_found": quote_found,
        "valid_citation": cited and not hallucinated and quote_found is not False,
        "problems": problems,
        "text": claim_text(c),
    }


def score_item(run: dict, item: dict, sources: dict | None = None) -> dict:
    sources = sources or {}
    checked = [check_claim(c, run) for c in run["claims"]]
    valid_all = [c for c in checked if c["valid_citation"]]
    # Raw source excerpts ("acquired_excerpt") are evidence, not assertions: they count for
    # evidence recall and for namesake contamination, but not for claim recall/precision.
    valid = [c for c in valid_all if not c["excerpt_only"]]
    asserted = [c for c in checked if not c["excerpt_only"]]
    aliases = (item.get("entity") or {}).get("aliases") or []
    alias_groups = [aliases] if aliases else []

    # identity: namesake contamination (merge errors)
    namesake_hits = []
    for c in checked:
        for m in item.get("namesake_markers", []):
            if matches(c["text"], m["match"]):
                namesake_hits.append({"claim_id": c["claim_id"], "marker": m["id"]})
    # Diagnostic only: namesake material that reached the evidence passages fed to extraction.
    evidence_namesakes = sorted({
        eid for eid, txt in run["evidence_meta"].items()
        for m in item.get("namesake_markers", []) if matches(txt, m["match"])
    })
    unresolved_asserted, unresolved_flagged = [], []
    for pair in item.get("unresolved_pairs", []):
        groups = [pair["a"], pair["b"]]
        for c in checked:
            if matches(c["text"], groups) and not has_hedge(c["text"]):
                unresolved_asserted.append({"claim_id": c["claim_id"], "pair": pair["a"][0] + "~" + pair["b"][0]})
        for k, sec in enumerate(run["sections"]):
            if matches(sec, groups) and not has_hedge(sec):
                unresolved_asserted.append({"claim_id": f"answer_sections[{k}]", "pair": pair["a"][0] + "~" + pair["b"][0]})
        if matches(run["unknowns_text"], groups):
            unresolved_flagged.append(pair["a"][0] + "~" + pair["b"][0])
    split_errors = []
    for grp in item.get("same_entity", []):
        present = [a for a in grp if norm(a) in run["unknowns_text"]]
        if len(present) >= 2 and has_hedge(run["unknowns_text"]):
            split_errors.append({"aliases": present, "where": "unknowns"})

    relevant = [c for c in asserted if alias_groups and matches(c["text"], alias_groups)]
    forbidden_hits = []
    for f in item.get("forbidden_claims", []):
        for c in checked:
            if matches(c["text"], f["match"]):
                forbidden_hits.append({"claim_id": c["claim_id"], "forbidden": f["id"]})
        for k, sec in enumerate(run["sections"]):
            if matches(sec, f["match"]) and not has_hedge(sec):
                forbidden_hits.append({"claim_id": f"answer_sections[{k}]", "forbidden": f["id"]})

    must = item.get("expected_claims", [])
    found = []
    for e in must:
        hit = [c["claim_id"] for c in valid if matches(c["text"], e["match"])]
        ex = [c["claim_id"] for c in valid_all if c["excerpt_only"] and matches(c["text"], e["match"])]
        found.append({"id": e["id"], "found": bool(hit), "by_claims": hit, "in_excerpts": ex})
    optional = [{"id": e["id"], "found": any(matches(c["text"], e["match"]) for c in valid)} for e in item.get("optional_claims", [])]
    recall = (sum(f["found"] for f in found) / len(found)) if found else None
    evidence_recall = (sum(f["found"] or bool(f["in_excerpts"]) for f in found) / len(found)) if found else None

    contradiction = None
    if item.get("contradiction"):
        ct = item["contradiction"]
        def side(s):
            in_claims = any(matches(c["text"], s["match"]) for c in valid_all)
            in_records = matches(run["contradictions_text"], s["match"])
            return in_claims or in_records
        a, b = side(ct["side_a"]), side(ct["side_b"])
        contradiction = {"side_a_found": a, "side_b_found": b, "both_sides": a and b,
                         "result": "BOTH_SIDES" if a and b else ("ONE_SIDE" if a or b else "NONE")}

    bad = {c["claim_id"] for c in checked if not c["valid_citation"]}
    bad |= {h["claim_id"] for h in namesake_hits} | {h["claim_id"] for h in forbidden_hits}
    good_relevant = [c for c in relevant if c["claim_id"] not in bad]
    n = len(asserted)
    status = run["status"]
    non_assertive = status in NON_ASSERTIVE_STATUSES
    if item.get("expect_insufficient"):
        honest = not forbidden_hits and (non_assertive or not relevant or bool(run["unknowns_text"]))
        honesty_label = "HONEST_INSUFFICIENT" if honest else "OVERCLAIM_ON_UNSUPPORTED_PREMISE"
    elif recall == 0 or recall is None and not relevant:
        honest = non_assertive or n == 0
        honesty_label = "HONEST_EMPTY" if honest else "ASSERTIVE_WITHOUT_EXPECTED_CONTENT"
    else:
        honest = True
        honesty_label = "ANSWERED"

    # Retrieval diagnostics: did the run at least discover the gold sources?
    wanted = []
    for e in must + item.get("optional_claims", []):
        wanted += e.get("sources", [])
    for side_key in ("side_a", "side_b"):
        if item.get("contradiction"):
            wanted += item["contradiction"][side_key].get("sources", [])
    gold_sources = {}
    for sid in dict.fromkeys(wanted):
        det = (sources.get(sid) or {}).get("detect") or []
        gold_sources[sid] = any(norm(x) in run["corpus_text"] for x in det) if det else None

    metrics = {
        "claims_total": n,
        "excerpts_total": len(checked) - n,
        "claims_cited": sum(c["cited"] for c in asserted),
        "claims_valid_citation": len(valid),
        "claims_relevant_to_entity": len(relevant),
        "cited_claim_precision": (len(good_relevant) / n) if n else None,
        "hallucinated_citations": sum(c["hallucinated_citation"] for c in checked),
        "uncited_claims": sum(not c["cited"] for c in asserted),
        "quotes_not_in_evidence": sum(c["quote_found"] is False for c in checked),
        "must_find_recall": recall,
        "must_find_recall_incl_excerpts": evidence_recall,
        "must_find_found": sum(f["found"] for f in found),
        "must_find_total": len(found),
        "identity_merge_errors": len(namesake_hits) + len(unresolved_asserted),
        "identity_split_errors": len(split_errors),
        "evidence_passages_total": len(run["evidence_text"]),
        "evidence_passages_namesake": len(evidence_namesakes),
        "forbidden_claims": len(forbidden_hits),
        "honest_insufficiency": honest,
    }
    pc = item.get("pass_criteria", {})
    failures = []
    if "min_must_find_recall" in pc and (recall or 0) < pc["min_must_find_recall"]:
        failures.append(f"must_find_recall {recall} < {pc['min_must_find_recall']}")
    if metrics["forbidden_claims"] > pc.get("max_forbidden", 0):
        failures.append("forbidden claim asserted")
    if metrics["hallucinated_citations"] > pc.get("max_hallucinated_citations", 0):
        failures.append("hallucinated citation")
    if len(namesake_hits) > pc.get("max_namesake_errors", 0):
        failures.append("namesake merged into target")
    if pc.get("unresolved_pairs_must_not_be_asserted") and unresolved_asserted:
        failures.append("unresolved identity asserted as fact")
    if pc.get("honest_insufficiency") and not honest:
        failures.append("did not report insufficient evidence")
    if pc.get("contradiction_both_sides") and not (contradiction or {}).get("both_sides"):
        failures.append(f"contradiction not surfaced ({(contradiction or {}).get('result')})")
    return {
        "item_id": item["id"],
        "item_type": item["type"],
        "run_id": run["run_id"],
        "run_target": run["target"],
        "run_status": status,
        "honesty_label": honesty_label,
        "metrics": metrics,
        "must_find": found,
        "optional_found": optional,
        "contradiction": contradiction,
        "namesake_hits": namesake_hits,
        "unresolved_identity_asserted": unresolved_asserted,
        "unresolved_identity_flagged_in_unknowns": unresolved_flagged,
        "split_errors": split_errors,
        "evidence_namesake_passages": evidence_namesakes,
        "forbidden_hits": forbidden_hits,
        "gold_sources_discovered": gold_sources,
        "claims": [{k: v for k, v in c.items() if k != "text"} for c in checked],
        "passed": not failures,
        "failures": failures,
    }


def load_eval(path=DEFAULT_EVAL) -> dict:
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--eval", default=str(DEFAULT_EVAL))
    ap.add_argument("--run", required=True, help="run id (looked up in command-center/live/runs) or path to JSON")
    ap.add_argument("--item", action="append", required=True, help="eval item id (repeatable)")
    ap.add_argument("--out", help="write JSON report here")
    ap.add_argument("--strict", action="store_true", help="exit 1 if any item fails")
    a = ap.parse_args(argv)
    ev = load_eval(a.eval)
    items = {i["id"]: i for i in ev["items"]}
    run = load_run(a.run)
    reports = []
    for iid in a.item:
        if iid not in items:
            print(f"unknown item {iid}", file=sys.stderr)
            return 2
        reports.append(score_item(run, items[iid], ev.get("sources")))
    out = {"schema": "nabou-research-eval-report-v1", "eval_version": ev.get("version"), "run_id": run["run_id"], "reports": reports}
    text = json.dumps(out, ensure_ascii=False, indent=2)
    if a.out:
        pathlib.Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        pathlib.Path(a.out).write_text(text + "\n", encoding="utf-8")
    for r in reports:
        m = r["metrics"]
        print(f"{r['run_id']} {r['item_id']}: {'PASS' if r['passed'] else 'FAIL'} status={r['run_status']} "
              f"claims={m['claims_total']} excerpts={m['excerpts_total']} precision={m['cited_claim_precision']} recall={m['must_find_recall']} ev_recall={m['must_find_recall_incl_excerpts']} "
              f"halluc={m['hallucinated_citations']} merge_err={m['identity_merge_errors']} split_err={m['identity_split_errors']} "
              f"forbidden={m['forbidden_claims']} honesty={r['honesty_label']} gold_sources={r['gold_sources_discovered']} "
              f"failures={r['failures']}")
    return 1 if a.strict and any(not r["passed"] for r in reports) else 0


if __name__ == "__main__":
    sys.exit(main())
