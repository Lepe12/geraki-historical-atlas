#!/usr/bin/env python3
"""Public-safe N7 recovery receipt; never includes OCR text, candidate URLs or claims.

Original evidence stays in source run's checksum-bound GitHub Actions artifacts
when public repository push protection blocks raw evidence publication.
"""
from __future__ import annotations
import argparse,datetime,json,re
from pathlib import Path

LANES=frozenset(("greek","travellers","spanish_simancas","venetian","french",
                 "british","dutch","german","italian_states","ottoman","north_african"))

def build(root:Path,run_id:str)->dict:
    if not re.fullmatch(r"[0-9]{8,20}",run_id):
        raise ValueError("INVALID_ORIGINAL_RUN_ID")
    path=root/"evidence"/"runs"/run_id
    handoff=json.loads((path/"LANE_HANDOFF.json").read_text(encoding="utf-8"))
    genealogy=json.loads((path/"SOURCE_GENEALOGY.json").read_text(encoding="utf-8"))
    health=json.loads((path/"SYSTEM_HEALTH.json").read_text(encoding="utf-8"))
    if (handoff.get("schema")!="research-lane-handoff-v1" or str(handoff.get("run_id"))!=run_id
            or set(handoff.get("received_lanes",[]))!=LANES or handoff.get("missing_lanes")):
        raise ValueError("RECOVERY_NOT_COMPLETE")
    if str(genealogy.get("run_id"))!=run_id or str(health.get("run_id"))!=run_id:
        raise ValueError("CROSS_RUN_EVIDENCE_FORBIDDEN")
    if not health.get("request_fingerprint_ok"):
        raise ValueError("RESEARCH_FINGERPRINT_MISMATCH")
    if not health.get("all_lanes_pipeline_reports_present"):
        raise ValueError("MISSING_PIPELINE_REPORT")
    manifests=handoff.get("manifests",[])
    if len(manifests)!=11 or len({x.get("lane") for x in manifests})!=11:
        raise ValueError("MISSING_CHECKSUM_MANIFEST")
    digests={}
    for manifest in manifests:
        lane=manifest["lane"]
        sha=manifest.get("archive_sha256")
        if lane not in LANES or not isinstance(sha,str) or not re.fullmatch(r"[a-f0-9]{64}",sha):
            raise ValueError("UNSAFE_MANIFEST_DIGEST")
        digests[lane]=sha
    return {
        "schema":"n7-recovery-public-safe-summary-v1",
        "original_research_run_id":run_id,
        "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "evidence_storage":"ORIGINAL_GITHUB_ACTIONS_ARTIFACTS",
        "artifact_run_url":f"https://github.com/Lepe12/geraki-historical-atlas/actions/runs/{run_id}",
        "archive_sha256_by_lane":dict(sorted(digests.items())),
        "recovered_lanes":sorted(LANES),
        "complete_lanes":len(LANES),
        "source_records":int(genealogy.get("source_count",0)),
        "exact_duplicate_groups":int(genealogy.get("exact_duplicate_groups",0)),
        "possible_derivative_groups":int(genealogy.get("possible_derivative_groups",0)),
        "research_fingerprint_consistent":True,
        "all_lanes_operational":bool(health.get("all_lanes_operational")),
        "full_raw_evidence_publication":"BLOCKED_BY_GITHUB_REPOSITORY_RULE",
        "reason_for_metadata_only":"No raw/source content is copied to public GitHub to bypass push protection",
        "verified_historical_claims":0,
        "historically_verified":False,
        "publication_allowed":False,
        "semantic_synthesis_status":"NOT_RUN_FROM_UNPUBLISHED_RAW_EVIDENCE",
        "human_original_page_review_required":True,
    }

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--run-id",required=True)
    parser.add_argument("--root",default=".")
    a=parser.parse_args()
    root=Path(a.root)
    report=build(root,a.run_id)
    dest=root/"evidence"/"runs"/a.run_id/"RECOVERY_SUMMARY.json"
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("N7_RULE_SAFE_RECOVERY_SUMMARY",a.run_id,report["complete_lanes"],
          report["source_records"],"HISTORICALLY_VERIFIED=false")

if __name__=="__main__":
    main()
