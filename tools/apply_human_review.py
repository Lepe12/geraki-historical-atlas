#!/usr/bin/env python3
"""Apply an explicit human review decision to one lane candidate.

This tool never silently promotes a candidate to VERIFIED. An accepted review
may only mark it HUMAN_REVIEWED and verification_eligible.
"""
from __future__ import annotations
import argparse,datetime,json,pathlib,sys

ap=argparse.ArgumentParser()
ap.add_argument("--lane",required=True)
ap.add_argument("--review-file",required=True)
args=ap.parse_args()

candidate_path=pathlib.Path("structured_output/candidate_events.json")
if not candidate_path.exists():raise SystemExit("CANDIDATE_FILE_NOT_FOUND")
data=json.loads(candidate_path.read_text(encoding="utf-8"))
review=json.loads(pathlib.Path(args.review_file).read_text(encoding="utf-8"))

cid=str(review.get("candidate_id") or "").strip()
reviewer=str(review.get("reviewer") or "").strip()
decision=str(review.get("decision") or "").strip().upper()
allowed={"ACCEPT","REJECT","NEEDS_MORE_EVIDENCE"}
if not cid:raise SystemExit("REVIEW_REQUIRES_CANDIDATE_ID")
if not reviewer:raise SystemExit("REVIEW_REQUIRES_REVIEWER")
if decision not in allowed:raise SystemExit("INVALID_REVIEW_DECISION")

candidate=next((x for x in data.get("events",[]) if x.get("candidate_id")==cid),None)
if candidate is None:raise SystemExit("CANDIDATE_NOT_FOUND")
if candidate.get("lane")!=args.lane:raise SystemExit("LANE_MISMATCH")

inspected=bool(review.get("original_inspected"))
examined=review.get("evidence_examined") or []
locator=review.get("exact_locator") or {}
source_says=str(review.get("source_says") or "").strip()
quality=review.get("source_quality_score")
try:quality=float(quality) if quality is not None else None
except Exception:raise SystemExit("INVALID_SOURCE_QUALITY_SCORE")

eligible=False
requirements={
 "reviewer_present":bool(reviewer),
 "evidence_examined":bool(examined),
 "original_inspected":inspected,
 "exact_locator_present":bool(locator),
 "source_says_present":bool(source_says),
 "quality_score_present":quality is not None
}
if decision=="ACCEPT":
    missing=[k for k,v in requirements.items() if not v]
    if missing:raise SystemExit("ACCEPT_REVIEW_MISSING_REQUIREMENTS: "+",".join(missing))
    eligible=True

record={
 "schema":"agent-piracy-human-review-decision-v1",
 "candidate_id":cid,
 "lane":args.lane,
 "reviewer":reviewer,
 "reviewed_utc":review.get("reviewed_utc") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "decision":decision,
 "original_inspected":inspected,
 "evidence_examined":examined,
 "exact_locator":locator,
 "archival_reference":review.get("archival_reference"),
 "source_says":source_says or None,
 "researcher_inference":review.get("researcher_inference"),
 "original_quote":review.get("original_quote"),
 "controlled_transcription":review.get("controlled_transcription"),
 "translation":review.get("translation"),
 "source_quality_score":quality,
 "notes":review.get("notes"),
 "verification_eligible":eligible,
 "verified":False,
 "rule":"HUMAN_REVIEWED is distinct from VERIFIED. Final verification requires a separate explicit gate."
}

out=pathlib.Path("human_review");out.mkdir(exist_ok=True)
dp=out/"decisions.json"
existing={"schema":"agent-piracy-human-review-decisions-v1","items":[]}
if dp.exists():
    try:existing=json.loads(dp.read_text(encoding="utf-8"))
    except Exception:pass
items=[x for x in existing.get("items",[]) if x.get("candidate_id")!=cid]
items.append(record)
existing["items"]=items
dp.write_text(json.dumps(existing,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

candidate["human_review_status"]="HUMAN_REVIEWED"
candidate["human_review_decision"]=decision
candidate["verification_eligible"]=eligible
candidate["verified"]=False
candidate["source_says"]=source_says or candidate.get("source_says")
candidate["researcher_inference"]=review.get("researcher_inference")
candidate["original_quote"]=review.get("original_quote")
candidate["controlled_transcription"]=review.get("controlled_transcription")
candidate["translation"]=review.get("translation")
candidate["original_inspected"]=inspected
candidate["exact_locator"]=locator
candidate_path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

print("HUMAN REVIEW",args.lane,cid,decision,"eligible",eligible,"verified",False)
