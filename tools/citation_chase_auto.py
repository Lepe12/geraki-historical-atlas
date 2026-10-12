#!/usr/bin/env python3
"""Piratecartography autonomous citation-chase planner.
Reads acquisition results and emits next-stage machine-readable state.
It never upgrades an event to VERIFIED merely from acquisition success.
"""
import json, pathlib, sys, datetime

ROOT=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else "iiif_acquisition")
report_path=ROOT/"report.json"
request_path=ROOT/"request.json"
if not report_path.exists():
    raise SystemExit("Missing acquisition report.json")
report=json.loads(report_path.read_text(encoding="utf-8"))
request=json.loads(request_path.read_text(encoding="utf-8")) if request_path.exists() else {}
status=report.get("status","")
acquired=report.get("matches", report.get("results", []))
state={
 "protocol":"PCT-CITATION-CHASE-AUTO-v1",
 "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "source_id":request.get("source_id"),
 "acquisition_status":status,
 "verification_status":"NEEDS_EVIDENCE",
 "original_inspected":False,
 "exact_pages_acquired": bool(acquired),
 "human_visual_gate_required":True,
 "next_stage":"VISUAL_ORIGINAL_INSPECTION" if "ACQUIRED" in status else "PAGINATION_OR_ACCESS_REVIEW",
 "rule":"Acquisition is not historical verification. VERIFIED requires claim extraction, source genealogy/independence, and the project verification gates."
}
(ROOT/"citation_chase_state.json").write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(state,ensure_ascii=False,indent=2))
