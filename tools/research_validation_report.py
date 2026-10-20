"""Read actual durable research outputs and fail closed on incomplete e2e work."""
import argparse
import datetime
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
from research_focus import decompose

def read(path):
    return json.loads(path.read_text()) if path.is_file() else {}

def build(root,validation_root=Path('evidence/engine_validation'),analysis_root=None):
    analysis_root=analysis_root or root
    answer=read(analysis_root/'research_answer/answer.json')
    answer_origin='FINAL_ANSWER_RECORD'
    if not answer:
        answer=read(analysis_root/'research_answer/progress.json')
        answer_origin='PARTIAL_PROGRESS_ONLY_NO_FINAL_ANSWER' if answer else 'NO_ANSWER_OR_PROGRESS_RECORD'
    geographic=read(analysis_root/'research_answer/geographic_findings.json')
    acquisitions=[];attempts=[];raw_candidates=[];queries=[];request={}
    for lane in root.iterdir():
        if not lane.is_dir():continue
        if not request:request=read(lane/'run_manifest/manifest.json').get('normalized_request',{})
        acquisitions.extend(read(lane/'library_acquisition/acquisition_report.json').get('results',[]))
        attempts.extend(read(lane/'lane_discovery'/f'{lane.name}.json').get('attempts',[]))
        raw_candidates.extend(read(lane/'structured_output/candidate_events.json').get('events',[]))
        expansion=read(lane/'repository_plans'/f'{lane.name}.json').get('semantic_query_expansion')
        if expansion and not queries:queries.append(expansion)
    acquired=[];challenge_pages=[]
    for r in acquisitions:
        if r.get('status')!='TEXT_ACQUIRED' or not any(str(f).endswith('.txt') for f in r.get('files',[])):continue
        files=r.get('files',[]);web=r.get('web_acquisition') or {}
        url=str(r.get('acquired_source_url') or r.get('url') or '')
        host=(urlsplit(url).hostname or '').lower()
        kind=('PDF_DOCUMENT_TEXT' if any(str(f).endswith('.pdf') for f in files) else
              'OCR_DOCUMENT_TEXT' if any(str(f).endswith('_djvu.txt') for f in files) else
              'PAGE_IMAGE_OCR' if web.get('source_type')=='IMAGE_OCR' else
              'CATALOGUE_METADATA_TEXT' if host in ('catalogue.bnf.fr','www.openarchives.gr','www.searchculture.gr','pares.cultura.gob.es') or '/server/api/core/items/' in url else 'WEB_PAGE_TEXT')
        if kind=='WEB_PAGE_TEXT':
            for lane in root.iterdir():
                for filename in files:
                    file=lane/str(filename)
                    if str(filename).endswith('.txt') and file.is_file():
                        text=file.read_text(errors='replace')[:5000]
                        if re.search(r'verify.{0,80}(?:not.{0,10}robot|human)|checking your browser|enable javascript.{0,80}continue',text,re.I|re.S):
                            kind='ACCESS_CHALLENGE_NOT_SOURCE'
                        break
        if kind=='ACCESS_CHALLENGE_NOT_SOURCE':
            challenge_pages.append({'url':url,'reason':'CHALLENGE_PAGE_IN_LEGACY_ACQUISITION_NOT_HISTORICAL_TEXT'});continue
        acquired.append({**r,'content_kind':kind})
    sources={str(r.get('acquired_source_url') or r.get('url') or r.get('identifier')):{
        'title':r.get('title'),'url':r.get('acquired_source_url') or r.get('url'),
        'repository':r.get('discovery_repository'),'status':r.get('status'),'files':r.get('files'),
        'content_kind':r['content_kind']}
        for r in acquired}
    probes=[]
    for p in sorted(validation_root.glob('*/endpoint-report.json')):
        probes.append(read(p))
    latest=probes[-1] if probes else {}
    completed={c['role'] for c in answer.get('calls',[]) if c.get('status')=='COMPLETED'}
    required={'evidence_extractor','adversarial_reviewer','synthesis'}
    blockers=[]
    if answer_origin!='FINAL_ANSWER_RECORD':blockers.append(answer_origin)
    if not sources:blockers.append('NO_ACQUIRED_SOURCE_TEXT')
    if not answer.get('evidence'):blockers.append('NO_REPLAYED_EVIDENCE')
    if not required<=completed:blockers.append('SEMANTIC_STAGES_INCOMPLETE')
    if answer.get('status')!='MODEL_ANSWER_PENDING_HUMAN_REVIEW':blockers.append('CITED_MODEL_ANSWER_INCOMPLETE')
    request_kind=decompose(request['target'],request.get('aliases',[]))['kind'] if request.get('target') else 'UNKNOWN'
    if request_kind!='person' and not geographic.get('findings'):blockers.append('NO_SUPPORTED_PLACE_FINDINGS')
    supported=set((answer.get('review') or {}).get('supported_claim_ids',[]))
    cited={cid for section in answer.get('answer_sections',[]) for cid in section.get('claim_ids',[])}
    if request_kind=='person' and not cited.intersection(supported):blockers.append('NO_SUPPORTED_PERSON_RESEARCH_CLAIMS')
    if not any(q.get('output_status')=='MODEL_QUERIES_AVAILABLE' for q in queries):blockers.append('LIVE_MODEL_QUERY_EXPANSION_NOT_DEMONSTRATED')
    violations=[c.get('claim_id') for c in answer.get('claims',[]) if c.get('verified') or c.get('verification_status')=='VERIFIED']
    if violations:blockers.append('UNSUPPORTED_VERIFICATION_PROMOTION')
    return {'schema':'nabou-e2e-validation-v1','research_run_id':root.name,
        'generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'status':'INCOMPLETE' if blockers else 'PROVISIONAL_RESEARCH_PIPELINE_PASSED',
        'research_question':answer.get('question'),'answer_record_origin':answer_origin,'request_kind':request_kind,'sources_acquired':list(sources.values()),
        'counts':{'unique_acquired_source_urls':len(sources),
                  'document_or_page_ocr_urls':sum(s['content_kind'] in ('PDF_DOCUMENT_TEXT','OCR_DOCUMENT_TEXT','PAGE_IMAGE_OCR') for s in sources.values()),
                  'catalogue_metadata_urls':sum(s['content_kind']=='CATALOGUE_METADATA_TEXT' for s in sources.values()),
                  'other_webpage_urls':sum(s['content_kind']=='WEB_PAGE_TEXT' for s in sources.values()),
                  'excluded_access_challenge_pages':len(challenge_pages),'raw_candidate_events':len(raw_candidates),
                  'replayed_evidence':len(answer.get('evidence',[])),
                  'model_claims':len(answer.get('claims',[])),
                  'review_supported_claims':len(supported),'answer_cited_claims':len(cited),
                  'candidate_place_findings':len(geographic.get('findings',[])),
                  'verified':0,'rejected_model_items':sum(r.get('reason')!='UNSUPPORTED_DATE_ATTRIBUTE_REMOVED' for r in answer.get('rejected',[])),
                  'rejected_model_attributes':sum(r.get('reason')=='UNSUPPORTED_DATE_ATTRIBUTE_REMOVED' for r in answer.get('rejected',[])),
                  'deferred_passages':len(answer.get('coverage',{}).get('deferred',[]))},
        'semantic_calls':answer.get('calls',[]),'model_configuration':answer.get('model_configuration'),
        'query_expansion':queries,'research_connector_attempts':attempts,
        'latest_connector_probe_run':latest.get('run_id'),
        'native_connector_tests':latest.get('native_connector_tests',[]),
        'connector_endpoint_tests':latest.get('connectors',[]),
        'blockers':blockers,'verification_violations':violations,
        'excluded_access_challenges':challenge_pages,
        'limits':['BOUNDED_SEARCH_NOT_ALL_RELEVANT_SOURCES','MODEL_ANALYSIS_NOT_HISTORICAL_VERIFICATION',
                  'ORIGINAL_INSPECTION_AND_GENEALOGY_MAY_REMAIN_PENDING',
                  'AUTHENTICATED_ARCHIVES_NOT_SEARCHED_WITHOUT_AUTHORIZED_SESSION']}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run-id',required=True);p.add_argument('--require-complete',action='store_true');a=p.parse_args()
    root=Path('evidence/runs')/a.run_id
    (root/'research_answer').mkdir(parents=True,exist_ok=True)
    result=build(root)
    (root/'research_answer/validation_report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('RESEARCH_E2E_VALIDATION',result['status'],json.dumps(result['counts']))
    if a.require_complete and result['status']=='INCOMPLETE':raise SystemExit(1)
