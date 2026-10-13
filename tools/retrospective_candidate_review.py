"""Append machine reassessment; never rewrite preserved research or human review."""
import hashlib
import json
from pathlib import Path
import re
from collections import Counter
from candidate_context import review_preserved, POLICY


def review(root=Path('evidence/runs')):
    decisions=[]; failures=[]; files=0; retained_sources={}
    for path in sorted(root.glob('*/*/structured_output/candidate_events.json')):
        try:
            raw=path.read_bytes();data=json.loads(raw)
            lane_root=path.parent.parent
            lane=lane_root.name
            identity=lane_root/'research_lanes'/f'{lane}.json'
            if not identity.exists(): identity=lane_root/'research_request_identity.json'
            identity_data=json.loads(identity.read_text(encoding='utf-8'))
            request=next((identity_data[key] for key in ('normalized_request','normalized_context','research_request')
                          if isinstance(identity_data.get(key),dict) and identity_data[key].get('target')),None)
            if request is None: raise KeyError('PRESERVED_REQUEST_CONTEXT_MISSING')
            years=[int(y) for y in re.findall(r'\b(?:1[0-9]{3}|20[0-9]{2})\b',request.get('date_range',''))]
            lo,hi=(min(years),max(years)) if years else (0,9999)
            files+=1
            for candidate in data.get('events',[]):
                decision=review_preserved(candidate,request['target'],request.get('aliases',[]),lo,hi)
                decisions.append({**decision,'run_id':lane_root.parent.name,'lane':lane,
                                  'candidate_id':candidate.get('candidate_id'),
                                  'preserved_source_path':path.as_posix(),
                                  'preserved_source_sha256':hashlib.sha256(raw).hexdigest(),
                                  'original_verified_flag':candidate.get('verified',False)})
                if decision['decision']=='RETAIN_CANDIDATE':
                    source=candidate.get('identifier') or candidate.get('url') or candidate.get('source_file')
                    key=str(source or path.as_posix())
                    if key not in retained_sources:
                        retained_sources[key]={'source_key':key,'title':candidate.get('title'),
                            'url':candidate.get('url'),'source_file':candidate.get('source_file'),
                            'grouping_basis':'CATALOGUE_ID_OR_FILENAME_NOT_PROOF_OF_INDEPENDENCE',
                            'context_sample':(candidate.get('context_excerpt') or '')[:1800],
                            'exact_page_candidates':candidate.get('exact_page_candidates',[]),
                            'request_context':request,'candidate_references':[]}
                    retained_sources[key]['candidate_references'].append({
                        'run_id':lane_root.parent.name,'lane':lane,'candidate_id':candidate.get('candidate_id'),
                        'preserved_source_path':path.as_posix()})
        except (ValueError,KeyError,OSError,TypeError) as error:
            failures.append({'path':path.as_posix(),'status':'NOT_REASSESSED','reason':type(error).__name__})
    return {'schema':'pct-retrospective-context-review-v1','policy':POLICY,
            'review_type':'MACHINE_ROUTING_REASSESSMENT_NOT_HUMAN_VERIFICATION',
            'candidate_files_reviewed':files,'candidate_records_reviewed':len(decisions),
            'decision_counts':dict(Counter(d['decision'] for d in decisions)),
            'review_decisions':decisions,'not_reassessed':failures,
            'retained_source_groups':list(retained_sources.values()),
            'originals_modified':False,'rule':'Original records and human decisions remain authoritative. This append-only machine routing review neither deletes nor verifies historical evidence.'}
