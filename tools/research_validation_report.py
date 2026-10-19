"""Read actual durable research outputs and fail closed on incomplete e2e work."""
import argparse
import datetime
import json
from pathlib import Path

def read(path):
    return json.loads(path.read_text()) if path.is_file() else {}

def build(root,validation_root=Path('evidence/engine_validation')):
    answer=read(root/'research_answer/answer.json')
    geographic=read(root/'research_answer/geographic_findings.json')
    acquisitions=[];attempts=[];raw_candidates=[];queries=[]
    for lane in root.iterdir():
        if not lane.is_dir():continue
        acquisitions.extend(read(lane/'library_acquisition/acquisition_report.json').get('results',[]))
        attempts.extend(read(lane/'lane_discovery'/f'{lane.name}.json').get('attempts',[]))
        raw_candidates.extend(read(lane/'structured_output/candidate_events.json').get('events',[]))
        expansion=read(lane/'repository_plans'/f'{lane.name}.json').get('semantic_query_expansion')
        if expansion and not queries:queries.append(expansion)
    acquired=[r for r in acquisitions if r.get('status')=='TEXT_ACQUIRED' and any(str(f).endswith('.txt') for f in r.get('files',[]))]
    sources={str(r.get('acquired_source_url') or r.get('url') or r.get('identifier')):{
        'title':r.get('title'),'url':r.get('acquired_source_url') or r.get('url'),
        'repository':r.get('discovery_repository'),'status':r.get('status'),'files':r.get('files')}
        for r in acquired}
    probes=[]
    for p in sorted(validation_root.glob('*/endpoint-report.json')):
        probes.append(read(p))
    latest=probes[-1] if probes else {}
    completed={c['role'] for c in answer.get('calls',[]) if c.get('status')=='COMPLETED'}
    required={'evidence_extractor','adversarial_reviewer','synthesis'}
    blockers=[]
    if not sources:blockers.append('NO_ACQUIRED_SOURCE_TEXT')
    if not answer.get('evidence'):blockers.append('NO_REPLAYED_EVIDENCE')
    if not required<=completed:blockers.append('SEMANTIC_STAGES_INCOMPLETE')
    if answer.get('status')!='MODEL_ANSWER_PENDING_HUMAN_REVIEW':blockers.append('CITED_MODEL_ANSWER_INCOMPLETE')
    if not geographic.get('findings'):blockers.append('NO_SUPPORTED_PLACE_FINDINGS')
    if not any(q.get('output_status')=='MODEL_QUERIES_AVAILABLE' for q in queries):blockers.append('LIVE_MODEL_QUERY_EXPANSION_NOT_DEMONSTRATED')
    violations=[c.get('claim_id') for c in answer.get('claims',[]) if c.get('verified') or c.get('verification_status')=='VERIFIED']
    if violations:blockers.append('UNSUPPORTED_VERIFICATION_PROMOTION')
    return {'schema':'nabou-e2e-validation-v1','research_run_id':root.name,
        'generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'status':'INCOMPLETE' if blockers else 'PROVISIONAL_RESEARCH_PIPELINE_PASSED',
        'research_question':answer.get('question'),'sources_acquired':list(sources.values()),
        'counts':{'unique_acquired_source_urls':len(sources),'raw_candidate_events':len(raw_candidates),
                  'replayed_evidence':len(answer.get('evidence',[])),
                  'model_claims':len(answer.get('claims',[])),
                  'candidate_place_findings':len(geographic.get('findings',[])),
                  'verified':0,'rejected_model_items':len(answer.get('rejected',[])),
                  'deferred_passages':len(answer.get('coverage',{}).get('deferred',[]))},
        'semantic_calls':answer.get('calls',[]),'model_configuration':answer.get('model_configuration'),
        'query_expansion':queries,'research_connector_attempts':attempts,
        'latest_connector_probe_run':latest.get('run_id'),
        'native_connector_tests':latest.get('native_connector_tests',[]),
        'connector_endpoint_tests':latest.get('connectors',[]),
        'blockers':blockers,'verification_violations':violations,
        'limits':['BOUNDED_SEARCH_NOT_ALL_RELEVANT_SOURCES','MODEL_ANALYSIS_NOT_HISTORICAL_VERIFICATION',
                  'ORIGINAL_INSPECTION_AND_GENEALOGY_MAY_REMAIN_PENDING',
                  'AUTHENTICATED_ARCHIVES_NOT_SEARCHED_WITHOUT_AUTHORIZED_SESSION']}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run-id',required=True);a=p.parse_args()
    root=Path('evidence/runs')/a.run_id
    result=build(root)
    (root/'research_answer/validation_report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('RESEARCH_E2E_VALIDATION',result['status'],json.dumps(result['counts']))
