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
        reference={'finding_id':'ref-1','title':'Letters','url':'https://example.org/book.pdf',
                   'context_excerpt':'A letter mentions the requested historical person.',
                   'target_entity':{'observed_names':['Requested Person'],'association_basis':'EXPLICIT_NAME'},
                   'locator':{'pdf_file':'book.pdf','scan_indexes_0_based':[8]},
                   'decision':'REVIEW_CONTEXT','uncertainties':['ACTION_UNRESOLVED','EVENT_DATE_UNRESOLVED']}
        adjacent={**reference,'finding_id':'adjacent','target_entity':{'observed_names':[],'association_basis':'ADJACENT_TOPIC_UNRESOLVED'}}
        conflict={**reference,'finding_id':'conflict','uncertainties':['CONFLICTING_GIVEN_NAME']}
        (base/'travellers/structured_output/extracted_findings.json').write_text(json.dumps({'findings':[reference,adjacent,conflict]}))
        out=build(r,run)
        refs=[d for d in out['discoveries'] if d.get('reference_kind')=='ACQUIRED_TEXT_REFERENCE']
        assert len(refs)==1 and refs[0]['finding_id']=='ref-1'
        assert refs[0]['text_locator']['scan_indexes_0_based']==[8]
        assert refs[0]['topical_match']['category']=='POSSIBLE_TARGET'
        assert refs[0]['verified'] is False and not out['claims']
        (base/'travellers/library_acquisition').mkdir()
        (base/'travellers/library_acquisition/acquisition_report.json').write_text(json.dumps({'results':[{'url':reference['url'],'source_lead':True}]}))
        out=build(r,run)
        assert out['discoveries'][0]['request_source_lead'] is False
        assert out['evidence_package']['quality']['verified_promotions']==0
        assert not out['claims']
        (base/'research_answer').mkdir()
        (base/'research_answer/answer.json').write_text(json.dumps({'claims':[{'claim_id':'a','quote':'First passage'},{'claim_id':'b','quote':'Different passage'}],
            'review':{'contradictions':[{'claim_ids':['a','b'],'explanation':'Different reported dates'},{'claim_ids':['a'],'explanation':'Invalid self conflict'}]}}))
        out=build(r,run)
        assert len(out['contradictions']['records'])==1
        assert len(out['contradictions']['records'][0]['claims'])==2
        assert out['contradictions']['records'][0]['verified'] is False
        # Completed lane jobs and retained raw claims cannot mask failed
        # synthesis or a failed research acceptance report.
        (base/'travellers/structured_output/candidate_events.json').write_text(json.dumps({'events':[{'candidate_id':'retained','title':'Raw retained lead','verified':False}]}))
        (base/'research_answer/answer.json').write_text(json.dumps({'status':'FINAL_ANSWER_REVIEW_FAILED','claims':[{'claim_id':'a'}]}))
        (base/'research_answer/validation_report.json').write_text(json.dumps({'status':'INCOMPLETE','blockers':['CITED_MODEL_ANSWER_INCOMPLETE']}))
        board=json.loads((base/'JARVIS_STATE_BOARD.json').read_text());board['lanes'][0]['execution_status']='COMPLETED'
        (base/'JARVIS_STATE_BOARD.json').write_text(json.dumps(board))
        out=build(r,run)
        assert out['mission']['execution_status']=='COMPLETED'
        assert out['mission']['status']=='PARTIAL'
        assert out['mission']['research_validation_status']=='INCOMPLETE'
        assert out['mission']['research_validation_blockers']==['CITED_MODEL_ANSWER_INCOMPLETE']
        assert out['metrics']['candidate_claims']==1
        (base/'research_answer/answer.json').write_text(json.dumps({'status':'MODEL_ANSWER_PENDING_HUMAN_REVIEW','claims':[{'claim_id':'a'}]}))
        (base/'research_answer/validation_report.json').write_text(json.dumps({'status':'PROVISIONAL_RESEARCH_PIPELINE_PASSED','blockers':[]}))
        assert build(r,run)['mission']['status']=='COMPLETED'
        (base/'research_answer/validation_report.json').write_text(json.dumps({'status':'INCOMPLETE','blockers':['NO_SUPPORTED_PLACE_FINDINGS']}))
        assert build(r,run)['mission']['status']=='PARTIAL'
        latest=r/"latest.json";latest.write_text('{"run_id":"200"}')
        assert not publish_latest(latest,{"run_id":"123"},'{"run_id":"123"}')
        assert json.loads(latest.read_text())["run_id"]=="200"
        print("COMMAND CENTER SNAPSHOT TEST PASS")

if __name__=="__main__":main()
