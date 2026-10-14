#!/usr/bin/env python3
from __future__ import annotations
import json,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/"orchestrator"))
from build_command_center_snapshot import build

def main():
    with tempfile.TemporaryDirectory() as t:
        r=Path(t);run="123";base=r/"evidence/runs"/run
        (base/"travellers/structured_output").mkdir(parents=True)
        (base/"travellers/structured_output/candidate_events.json").write_text(json.dumps({"events":[{"candidate_id":"c1","title":"lead","verified":False}]}))
        (base/"travellers/research_lanes").mkdir(parents=True)
        (base/"travellers/research_lanes/travellers.json").write_text(json.dumps({"normalized_request":{"target":"Milos","date_range":"1660-1680","purpose":"test"}}))
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
        print("COMMAND CENTER SNAPSHOT TEST PASS")

if __name__=="__main__":main()
