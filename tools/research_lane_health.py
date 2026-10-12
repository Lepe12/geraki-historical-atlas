#!/usr/bin/env python3
"""Summarize one research lane after discovery/acquisition/search stages."""
import json,os,pathlib,datetime
lane=os.getenv("PCT_RESEARCH_LANE","travellers")
out=pathlib.Path("system_health");out.mkdir(exist_ok=True)

def read(p,default=None):
    p=pathlib.Path(p)
    if not p.exists():return default if default is not None else {}
    try:return json.loads(p.read_text(encoding="utf-8"))
    except Exception:return default if default is not None else {}

disc=read(pathlib.Path("lane_discovery")/f"{lane}.json",{})
attempts=disc.get("attempts",[])
executed=[a["repository"] for a in attempts if a.get("status")=="EXECUTED"]
blocked=[{"repository":a.get("repository"),"status":a.get("status")} for a in attempts if a.get("status") in ("AUTH_OR_BROWSER_REQUIRED","API_KEY_REQUIRED","CITATION_CHASE_WEB_OR_API_CONNECTOR_REQUIRED")]
errors=[a for a in attempts if a.get("status")=="ERROR"]
acq=read("library_acquisition/acquisition_report.json",{}).get("results",[])
events=read("event_first_hits/event_hits.json",{}).get("hits",[])
exact_page=read("exact_page_acquisition/exact_page_report.json",{})
pages=exact_page.get("results",[])
exact_page_complete=bool(exact_page.get("completed", True))
bsb=read("iiif_candidate_requests/bsb_iiif_candidates.json",{}).get("summary",{})
verification=read("verification/verification_gate.json",{})
qa=read("qa/qa_report.json",{})
required_files={
 "repository_plan":pathlib.Path(f"repository_plans/{lane}.json").exists(),
 "lane_discovery":pathlib.Path(f"lane_discovery/{lane}.json").exists(),
 "repository_candidates":pathlib.Path("citation_chase_candidates/repository_candidates.json").exists(),
 "acquisition_report":pathlib.Path("library_acquisition/acquisition_report.json").exists(),
 "ocr_hits":pathlib.Path("citation_chase_hits/ocr_hits.json").exists(),
 "event_hits":pathlib.Path("event_first_hits/event_hits.json").exists(),
 "exact_page_report":pathlib.Path("exact_page_acquisition/exact_page_report.json").exists(),
 "inspection_queue":pathlib.Path("original_inspection/inspection_queue.json").exists(),
 "genealogy_queue":pathlib.Path("source_genealogy/genealogy_queue.json").exists(),
 "corroboration_queue":pathlib.Path("corroboration/corroboration_queue.json").exists(),
 "human_review_queue":pathlib.Path("human_review/review_queue.json").exists(),
 "verification_gate":pathlib.Path("verification/verification_gate.json").exists(),
 "qa_report":pathlib.Path("qa/qa_report.json").exists(),
 "structured_output":pathlib.Path("structured_output/candidate_events.json").exists()
}
pipeline_complete=all(required_files.values()) and exact_page_complete
if executed and pipeline_complete:status="OPERATIONAL_WITH_EXPLICIT_BLOCKERS" if blocked else "OPERATIONAL"
elif executed:status="PIPELINE_INCOMPLETE"
else:status="NO_EXECUTED_REPOSITORY"
report={
 "schema":"pct-lane-health-v1","generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "lane":lane,"request_file":disc.get("request_file"),"status":status,
 "repositories_executed":executed,"repository_blockers":blocked,"repository_errors":errors,
 "pipeline_files":required_files,"repository_candidates":len(disc.get("results",[])),
 "acquisition_results":len(acq),"acquired_objects":sum(r.get("status") in ("TEXT_ACQUIRED","DIGITAL_METADATA_ACQUIRED") for r in acq),
 "located_citation_chase":sum(r.get("status")=="LOCATED_CITATION_CHASE" for r in acq),
 "event_first_hits":len(events),"exact_page_mappings":len(pages),
 "exact_page_images":sum(r.get("status")=="PAGE_IMAGE_ACQUIRED" for r in pages),"exact_page_stage_complete":exact_page_complete,
 "bsb_iiif_summary":bsb,"verification_status":verification.get("status"),"qa_decision":qa.get("decision"),"verified_events":verification.get("verified_events",0),
 "verification_gate":"Operational means the research lane and pipeline ran through QA gates. It does NOT mean any historical claim is VERIFIED."
}
(out/"lane_health.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("LANE HEALTH",lane,status,"executed",len(executed),"blocked",len(blocked),"errors",len(errors),"events",len(events),"pages",len(pages))
