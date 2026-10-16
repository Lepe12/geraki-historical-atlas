#!/usr/bin/env python3
from __future__ import annotations
import json,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/"orchestrator"))
from build_command_center_snapshot import build,publish_latest

def main():
    with tempfile.TemporaryDirectory() as t:
        r=Path(t);run="123";base=r/"evidence/runs"/run
        (base/"travellers/structured_output").mkdir(parents=True)
        (base/"travellers/structured_output/candidate_events.json").write_text(json.dumps({"events":[{"candidate_id":"c1","title":"lead","verified":False}]}))
        (base/"travellers/research_lanes").mkdir(parents=True)
        (base/"travellers/research_lanes/travellers.json").write_text(json.dumps({"normalized_request":{"target":"Milos","date_range":"1660-1680","purpose":"test"}}))
        (base/"travellers/research_request_identity.json").write_text(json.dumps({"request_id":"ui-test"}))
        (base/"travellers/research_discovery").mkdir()
        (base/"travellers/research_discovery/all_findings.json").write_text(json.dumps({"findings":[{"identifier":"lead-1","title":"Unresolved source","url":"https://example.org/source","relevance_assessment":{"status":"EXCLUDE_FROM_ACQUISITION","reasons":["TOPIC_COLLISION"],"research_value":{"score":10},"evidence_confidence":{"score":5}}}]}))
        (base/"travellers/lane_discovery").mkdir()
        (base/"travellers/lane_discovery/travellers.json").write_text(json.dumps({"attempts":[{"repository":"Catalogue","status":"REMOTE_RATE_LIMITED","hits":0,"queries":[{"query":"Milos","status":"REMOTE_RATE_LIMITED","hits":0}]}]}))
        (base/"JARVIS_STATE_BOARD.json").write_text(json.dumps({"generated_utc":"2026-10-14T00:00:00+00:00","summary":{"selected_lanes":1},"lanes":[{"lane":"travellers","status":"NO_CANDIDATE_TO_VERIFY","candidate_events":1,"verified_events":0,"blockers":[]}]}))
        sroot=r/"evidence/specialist_runs"/run;sroot.mkdir(parents=True)
        (sroot/"SPECIALIST_AGGREGATE.json").write_text(json.dumps({"agents":[{"agent_id":"contradiction","label":"Contradiction","search_runs":2,"records":3,"blockers":[],"requested_outputs":[]}]}))
        out=build(r,run)
        assert out["mission"]["target"]=="Milos"
        assert out["metrics"]["agents"]==2
        assert out["metrics"]["candidate_claims"]==1
        assert out["metrics"]["contradiction_search_records"]==3
        assert out["claims"][0]["verified"] is False
        assert out["safety"]["automatic_verified"] is False
        assert out["request_id"]=="ui-test"
        assert out["discoveries"][0]["triage_status"]=="EXCLUDE_FROM_ACQUISITION"
        assert out["discoveries"][0]["verified"] is False
        assert out["coverage"][0]["queries"][0]["status"]=="REMOTE_RATE_LIMITED"
        assert out["metrics"]["retained_discoveries"]==1
        (base/"travellers/structured_output/candidate_events.json").write_text('{"events":[]}')
        out=build(r,run)
        assert not out["claims"] and len(out["discoveries"])==1 and len(out["coverage"])==1
        latest=r/"latest.json";latest.write_text('{"run_id":"200"}')
        assert not publish_latest(latest,{"run_id":"123"},'{"run_id":"123"}')
        assert json.loads(latest.read_text())["run_id"]=="200"
        print("COMMAND CENTER SNAPSHOT TEST PASS")

if __name__=="__main__":main()
