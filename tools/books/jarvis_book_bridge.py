#!/usr/bin/env python3
"""Read-only local-book retrieval bridge for the JARVIS research pipeline.

Receives a research request JSON; returns provenance-rich candidate passages.
No database writes, no remote calls, no automatic historical verification.
"""
import argparse
import json
import sys
from pathlib import Path

from nabou_books import connect, search


def retrieve(db, request, max_results=15):
    if not isinstance(request, dict):
        raise ValueError("request must be an object")
    # Stable, request-scoped expansion; no inferred names or invented page claims.
    raw = [request.get("target"), *(request.get("aliases") or []), *(request.get("queries") or [])]
    if any(x is not None and not isinstance(x, str) for x in raw):
        raise ValueError("target, aliases and queries must be strings")
    if not all(isinstance(request.get(k) or [], list) for k in ("aliases", "queries")):
        raise ValueError("aliases and queries must be lists")
    terms = list(dict.fromkeys(x.strip() for x in raw if x and x.strip()))
    if not terms:
        raise ValueError("no search terms specified")
    candidates = {}
    for term in terms[:30]:
        for hit in search(db, term, max_results):
            key = (hit["source_id"], hit["printed_page"], hit["scan_page"])
            if key not in candidates:
                candidates[key] = {
                    "kind": "USER_BOOK_TRANSCRIPTION",
                    "connector_status": "EXECUTED_LOCAL",
                    "verification_status": "UNVERIFIED",
                    "evidence_status": "DISCOVERED",
                    "discovery_repository": "USER_SUPPLIED_BOOK_LIBRARY",
                    "discovery_lane": "local_book",
                    "source_id": hit["source_id"],
                    "title": hit["title"],
                    "author": hit["author"],
                    "printed_page": hit["printed_page"],
                    "scan_page": hit["scan_page"],
                    "source_reference": hit["source_reference"],
                    "transcription_status": hit["transcription_status"],
                    "transcription_sha256": hit["transcription_sha256"],
                    "excerpt": hit["snippet"],
                    "matched_terms": [term],
                    "requires_original_inspection": True
                }
            elif term not in candidates[key]["matched_terms"]:
                candidates[key]["matched_terms"].append(term)
    return {
        "schema": "nabou-local-book-discovery-v1",
        "status": "EXECUTED_LOCAL",
        "research_job_id": request.get("research_job_id"),
        "candidate_count": min(max_results, len(candidates)),
        "candidates": list(candidates.values())[:max_results],
        "gate": "Search matches are unverified transcription candidates, not historical facts."
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    parser.add_argument("--request", required=True, help="local UTF-8 research request JSON")
    parser.add_argument("--output", help="write result JSON to a local private path")
    parser.add_argument("--limit", type=int, default=15)
    args = parser.parse_args()
    if not (1 <= args.limit <= 100):
        parser.error("--limit must be from 1 to 100")
    try:
        request = json.loads(Path(args.request).read_text(encoding="utf-8"))
        if not Path(args.db).is_file():
            raise ValueError("book index missing; run ingestion first")
        db = connect(args.db)
        try:
            result = retrieve(db, request, args.limit)
        finally:
            db.close()
        rendered = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            Path(args.output).write_text(rendered + "\n", encoding="utf-8")
        else:
            print(rendered)
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
