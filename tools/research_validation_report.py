"""Read actual durable research outputs and fail closed on incomplete e2e work."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
from research_focus import decompose

def read(path):
    return json.loads(path.read_text()) if path.is_file() else {}

def replay_citations(root, answer, cited):
    """Check stored citations against durable original bytes, not model labels."""
    cache={};results=[];base=root.resolve()
    for claim in answer.get('claims',[]):
        if claim.get('claim_id') not in cited:continue
        occurrences=claim.get('source_occurrences') or []
        if not occurrences:
            results.append({'claim_id':claim.get('claim_id'),'status':'FAILED','reason':'SOURCE_OCCURRENCES_MISSING'})
        for occurrence in occurrences:
            row={'claim_id':claim.get('claim_id'),'url':occurrence.get('url'),'status':'FAILED'}
            try:
                relative=occurrence.get('acquired_text_path')
                if not isinstance(relative,str) or not relative:raise ValueError('DURABLE_TEXT_PATH_MISSING')
                file=(base/relative).resolve()
                if not file.is_relative_to(base):raise ValueError('UNSAFE_DURABLE_TEXT_PATH')
                if file not in cache:
                    raw=file.read_bytes();cache[file]=(raw.decode('utf-8',errors='replace'),hashlib.sha256(raw).hexdigest())
                text,sha=cache[file]
                if sha!=occurrence.get('source_text_sha256'):raise ValueError('SOURCE_TEXT_CHECKSUM_MISMATCH')
                loc=occurrence.get('locator') or {};a=loc.get('start_char');b=loc.get('end_char')
                if type(a) is not int or type(b) is not int or a<0 or b<=a:raise ValueError('EXACT_QUOTE_LOCATOR_MISSING')
                quote=claim.get('quote')
                if not isinstance(quote,str) or not quote or text[a:b]!=quote:raise ValueError('SOURCE_QUOTE_REPLAY_MISMATCH')
                # Uploaded private PDFs have stable urn:nabou identifiers. A
                # physical archival reference need not have a public web URL.
                reference=str(occurrence.get('url') or '')
                if (urlsplit(reference).scheme not in ('http','https','urn','doi')
                    and not occurrence.get('reported_archival_reference')):
                    raise ValueError('SOURCE_IDENTIFIER_MISSING')
                row.update(status='PASS',text_path=relative,text_sha256=sha,
                           start_char=a,end_char=b,offset_unit='UNICODE_CODE_POINTS',original_inspected=False)
            except ValueError as error:row['reason']=str(error)
            except (OSError,TypeError):row['reason']='DURABLE_SOURCE_TEXT_UNAVAILABLE'
            results.append(row)
    return results

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
    reused=answer.get('reused_semantic_calls',[]);resume=answer.get('resume_context') or {}
    valid_reuse=False
    if reused:
        try:
            import hashlib
            from semantic_research_answer import digest
            original_path=(root/resume['original_record_path']).resolve()
            if not original_path.is_relative_to(root.resolve()):raise ValueError('UNSAFE_RESUME_RECORD')
            original_bytes=original_path.read_bytes();original=json.loads(original_bytes)
            if hashlib.sha256(original_bytes).hexdigest()!=resume['original_record_sha256'] or original.get('question')!=answer.get('question'):raise ValueError('RESUME_RECORD_CHANGED')
            needed=set(resume['retained_claim_ids']);covered=set()
            if not needed or needed!={c['claim_id'] for c in answer.get('claims',[])}:raise ValueError('RESUME_CLAIM_SET_CHANGED')
            for entry in reused:
                file=(root/entry['response_file']).resolve()
                if not file.is_relative_to(root.resolve()):raise ValueError('UNSAFE_RESUME_RESPONSE')
                raw=file.read_bytes();value=json.loads(raw)
                if type(entry['original_call_index']) is not int or entry['original_call_index']<1:raise ValueError('INVALID_RESUME_CALL_INDEX')
                old=original['calls'][entry['original_call_index']-1]
                if (entry.get('role')!='evidence_extractor' or entry.get('status')!='COMPLETED' or value.get('status')!='COMPLETED'
                    or old.get('role')!='evidence_extractor' or value.get('role','evidence_extractor')!='evidence_extractor'
                    or hashlib.sha256(raw).hexdigest()!=entry['response_file_sha256'] or digest(value)!=old['response_sha256']):raise ValueError('RESUME_RESPONSE_CHANGED')
                covered.update(entry['supported_claim_ids_replayed'])
            if covered!=needed:raise ValueError('RESUME_CLAIMS_NOT_COVERED_BY_EXTRACTOR_RECEIPTS')
            valid_reuse=True;completed.add('evidence_extractor')
        except (ValueError,OSError,KeyError,IndexError,TypeError):valid_reuse=False
    required={'evidence_extractor','adversarial_reviewer','synthesis'}
    blockers=[]
    if reused and not valid_reuse:blockers.append('REUSED_EXTRACTION_RECEIPTS_NOT_VALIDATED')
    if answer_origin!='FINAL_ANSWER_RECORD':blockers.append(answer_origin)
    if not sources:blockers.append('NO_ACQUIRED_SOURCE_TEXT')
    if not answer.get('evidence'):blockers.append('NO_REPLAYED_EVIDENCE')
    if not required<=completed:blockers.append('SEMANTIC_STAGES_INCOMPLETE')
    if answer.get('status')!='MODEL_ANSWER_PENDING_HUMAN_REVIEW':blockers.append('CITED_MODEL_ANSWER_INCOMPLETE')
    request_kind=decompose(request['target'],request.get('aliases',[]))['kind'] if request.get('target') else 'UNKNOWN'
    if request_kind!='person' and not geographic.get('findings'):blockers.append('NO_SUPPORTED_PLACE_FINDINGS')
    supported=set((answer.get('review') or {}).get('supported_claim_ids',[]))
    cited={cid for section in answer.get('answer_sections',[]) for cid in section.get('claim_ids',[])}
    from semantic_research_answer import person_passage_hold_reason, valid_synthesis
    # Revalidate stored output with today's content gate. A historical success
    # label and completed model calls do not make placeholder prose an answer.
    if not valid_synthesis(answer, supported):
        blockers.append('INVALID_OR_PLACEHOLDER_CITED_SYNTHESIS')
    claim_ids={claim.get('claim_id') for claim in answer.get('claims',[])}
    if not cited or not cited<=supported or not cited<=claim_ids:
        blockers.append('ANSWER_CITATIONS_NOT_BOUND_TO_SUPPORTED_CLAIMS')
    citation_replays=replay_citations(root,answer,cited)
    if cited and (not citation_replays or any(row['status']!='PASS' for row in citation_replays)):
        blockers.append('DURABLE_CITATION_BYTE_REPLAY_FAILED')
    evidence_by_id={row.get('evidence_id'):row for row in answer.get('evidence',[])}
    quality_rejections=[]
    for claim in answer.get('claims',[]):
        if claim.get('claim_id') not in cited:continue
        row=evidence_by_id.get(claim.get('evidence_id'),{})
        title=(row.get('occurrences') or [{}])[0].get('title')
        from historical_source_admissibility import hold_reason
        source_hold=hold_reason({**(row.get('source_bibliography') or {}),'title':title})
        if source_hold:quality_rejections.append({'claim_id':claim['claim_id'],'reason':source_hold,'gate':'SOURCE_ADMISSIBILITY'})
        reason=person_passage_hold_reason(row.get('text',''),title,request,row.get('uncertainties',[]),row.get('source_bibliography'),row.get('years_in_scope'))
        if reason:quality_rejections.append({'claim_id':claim['claim_id'],'reason':reason})
    if any(r.get('gate')=='SOURCE_ADMISSIBILITY' for r in quality_rejections):blockers.append('ANSWER_CITES_NON_HISTORICAL_OR_GENERATED_SOURCE')
    if any(r.get('gate')!='SOURCE_ADMISSIBILITY' for r in quality_rejections):blockers.append('ANSWER_CONTAINS_UNRESOLVED_PERSON_OR_BIBLIOGRAPHIC_LEADS')
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
        'semantic_calls':answer.get('calls',[]),'reused_semantic_calls':reused,
        'reused_extraction_receipts_validated':valid_reuse,'model_configuration':answer.get('model_configuration'),
        'query_expansion':queries,'research_connector_attempts':attempts,
        'latest_connector_probe_run':latest.get('run_id'),
        'native_connector_tests':latest.get('native_connector_tests',[]),
        'connector_endpoint_tests':latest.get('connectors',[]),
        'blockers':blockers,'quality_gate_rejections':quality_rejections,'verification_violations':violations,
        'durable_citation_replays':citation_replays,
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
