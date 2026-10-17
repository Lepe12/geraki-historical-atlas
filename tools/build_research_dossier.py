#!/usr/bin/env python3
"""Build a self-contained lane research dossier from durable pipeline outputs."""
import json,os,pathlib,datetime
lane=os.getenv("PCT_RESEARCH_LANE","travellers")
def read(p,d=None):
 q=pathlib.Path(p)
 if not q.exists():return {} if d is None else d
 try:return json.loads(q.read_text(encoding="utf-8"))
 except Exception:return {} if d is None else d
request=read(f"research_lanes/{lane}.json")
disc=read(f"lane_discovery/{lane}.json")
acq=read("library_acquisition/acquisition_report.json")
events=read("structured_output/candidate_events.json")
gene=read("source_genealogy/genealogy_queue.json")
review=read("human_review/review_queue.json")
verify=read("verification/verification_gate.json")
qa=read("qa/qa_report.json")
discovery_inventory=read("research_discovery/all_findings.json")
event_first=read("event_first_hits/event_hits.json")
claim_matrix=read("claim_evidence_matrix/claims.json")
manifest=read("run_manifest/manifest.json")
d={
 "schema":"agent-piracy-research-dossier-v2",
 "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "lane":lane,
 "research_job_id":request.get("research_job_id"),
 "request_sha256":request.get("request_sha256"),
 "request":request.get("normalized_request") or request.get("normalized_context"),
 "methodology":{
  "catalogue_is_evidence":False,
  "ocr_is_exact_quote":False,
  "original_inspection_required":True,
  "source_genealogy_required":True,
  "fixed_source_count_rule":False,
  "human_review_distinct":True,
  "research_value_separate_from_evidence_confidence":True,
  "discovery_retention_required":True
 },
 "repositories_attempted":disc.get("attempts",[]),
 "acquisition_summary":{"results":len(acq.get("results",[]))},
 "research_discovery":discovery_inventory,
 "event_first_discovery":event_first,
 "research_answer":read('research_dossier/answer.json'),
 "extracted_findings":read('structured_output/extracted_findings.json'),
 "candidate_events":events.get("events",[]),
 "claim_evidence_matrix":claim_matrix,
 "source_genealogy":gene.get("sources",[]),
 "human_review":review.get("items",[]),
 "verification":verify,
 "qa":qa,
 "execution_manifest":manifest,
 "limitations":[
  "Catalogue metadata does not prove an event.",
  "OCR/event proximity is a discovery lead only.",
  "Blocked repositories remain explicit research gaps.",
  "No candidate is VERIFIED without original inspection, extraction, genealogy assessment and human review.",
  "Low Evidence Confidence never removes a finding from Research Discovery; it only limits claim use and automation."
 ]
}
out=pathlib.Path("research_dossier");out.mkdir(exist_ok=True)
(out/f"{lane}.json").write_text(json.dumps(d,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("RESEARCH DOSSIER",lane,"candidates",len(d["candidate_events"]))
