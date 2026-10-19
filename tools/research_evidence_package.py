"""Portable research provenance. Unknown fields stay unknown; never verifies history.

Built from the existing durable run, not a second engine or database. Every
quotation is replayed against acquired text before being marked traceable.
"""
from __future__ import annotations
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit

SCHEMA='nabou-evidence-package-v1'
IDENTITY_HOLDS={'CONFLICTING_GIVEN_NAME','EXTENDED_NAME_REQUIRES_IDENTITY_REVIEW','SURNAME_IDENTITY_UNRESOLVED','LATER_NAMESAKE_REQUIRES_IDENTITY_REVIEW'}


def provider_failures(detail):
    """Expose provider access failures, including older persisted diagnostics."""
    try:data=json.loads(detail) if isinstance(detail,str) else detail
    except (ValueError,TypeError):return []
    if not isinstance(data,dict) or data.get('schema')!='pct-web-search-coverage-v1':return []
    return [{'provider':p.get('provider'),'status':p.get('status'),'code':p.get('code'),
             'meaning':'BILLING_OR_QUOTA_REQUIRED' if p.get('code')=='HTTP_402' else
                       'RATE_LIMITED_SEARCH_NOT_COMPLETED' if p.get('code')=='HTTP_429' else 'PROVIDER_SEARCH_NOT_COMPLETED'}
            for p in data.get('providers',[]) if p.get('status')!='EXECUTED']


def read(path):
    if not path.is_file():return {}
    return json.loads(path.read_text(encoding='utf-8'))


def sha(value):return hashlib.sha256(value).hexdigest()


def source_key(row):
    url=str(row.get('url') or row.get('identifier') or '')
    if url.startswith(('http://','https://')):
        u=urlsplit(url)
        # Preserve query: different catalogue records may share the same path.
        return urlunsplit((u.scheme.lower(),u.netloc.lower(),u.path.rstrip('/'),u.query,''))
    return str(row.get('repository') or row.get('discovery_repository') or '')+'|'+url


def bibliography(row):
    document=row.get('web_acquisition') or {}
    meta=document.get('bibliographic_metadata') or {}
    def field(*keys):
        for key in keys:
            value=meta.get(key)
            if value:return value[0] if isinstance(value,list) else value
        return None
    creator=row.get('creator') or row.get('author') or meta.get('citation_author') or meta.get('dc.creator') or []
    if not isinstance(creator,list):creator=[creator]
    return {'title':field('citation_title','dc.title') or row.get('title'),
            'creators':[str(c) for c in creator if c],
            'publication_date':field('citation_publication_date','dc.date') or row.get('publication_year') or row.get('year') or row.get('date'),
            'container_title':field('citation_journal_title') or row.get('container_title'),
            'doi':field('citation_doi') or row.get('doi'),
            'archive':row.get('archive'), 'call_number':row.get('call_number') or row.get('shelfmark') or row.get('signatura'),
            'url':row.get('url') or row.get('identifier'),
            'metadata_basis':'PUBLISHER_EMBEDDED_METADATA' if meta else 'DISCOVERY_RECORD',
            'metadata_verified':False}


def source_classification(row):
    kind=str(row.get('historical_source_type') or row.get('source_type') or '').upper()
    if kind in ('PRIMARY','PRIMARY_ORIGINAL','PRIMARY_FACSIMILE','CONTEMPORARY_PRINTED'):
        return {'category':'PRIMARY_SOURCE_REPORTED','basis':'EXPLICIT_UPSTREAM_CLASSIFICATION','confirmed':False}
    if kind in ('SECONDARY','SECONDARY_STUDY'):
        return {'category':'SECONDARY_STUDY_REPORTED','basis':'EXPLICIT_UPSTREAM_CLASSIFICATION','confirmed':False}
    if row.get('container_title') or (row.get('web_acquisition') or {}).get('bibliographic_metadata',{}).get('citation_journal_title'):
        return {'category':'SCHOLARLY_PUBLICATION_UNCLASSIFIED','basis':'JOURNAL_METADATA_DOES_NOT_DISTINGUISH_STUDY_FROM_SOURCE_EDITION','confirmed':False}
    host=urlsplit(str(row.get('url') or '')).hostname or ''
    if host.endswith(('wikipedia.org','wikimili.com')):
        return {'category':'UNVERIFIED_WEB_REFERENCE','basis':'WEB_ENCYCLOPEDIA','confirmed':False}
    return {'category':'UNCLASSIFIED','basis':'CONTENT_ASSESSMENT_REQUIRED','confirmed':False}


def replay(root, lane, finding):
    filename=Path(str(finding.get('file') or '')).name
    file=root/lane/'library_acquisition'/filename
    loc=finding.get('locator') or {}
    if not filename or not file.is_file():return 'ACQUIRED_FILE_MISSING'
    text=file.read_text(encoding='utf-8',errors='replace')
    start,end=loc.get('start_char'),loc.get('end_char')
    if not isinstance(start,int) or not isinstance(end,int) or not 0<=start<end<=len(text):return 'INVALID_TEXT_LOCATOR'
    if sha(text.encode())!=finding.get('source_text_sha256'):return 'SOURCE_CHECKSUM_MISMATCH'
    return 'EXACT_ACQUIRED_TEXT_MATCH' if text[start:end]==finding.get('evidence_excerpt') else 'QUOTE_LOCATOR_MISMATCH'


def build(root, request=None):
    root=Path(root);sources={};passages=[];coverage=[];manifests=[];inputs=[];acquisition=[];relationships=[];access_gaps=[]
    def register(row,lane):
        key=source_key(row)
        if key in ('|',''):return None
        sid='s-'+sha(key.encode())[:20]
        if sid not in sources:
            sources[sid]={'source_id':sid,'canonical_key':key,'bibliography':bibliography(row),
                         'classification':source_classification(row),'lanes':[],
                         'acquisition_statuses':[],'rights_or_access_note':row.get('rights') or row.get('license'),
                         'independence_status':'UNKNOWN','verified':False}
        item=sources[sid]
        if lane not in item['lanes']:item['lanes'].append(lane)
        # Prefer acquired embedded metadata over a sparse catalogue copy.
        if (row.get('web_acquisition') or {}).get('bibliographic_metadata'):
            item['bibliography']=bibliography(row);item['classification']=source_classification(row)
        elif not item['bibliography'].get('creators'):
            item['bibliography']['creators']=bibliography(row)['creators']
        incoming=bibliography(row)
        for field,value in incoming.items():
            if value and not item['bibliography'].get(field):item['bibliography'][field]=value
        classification=source_classification(row)
        if item['classification']['category']=='UNCLASSIFIED' and classification['category']!='UNCLASSIFIED':
            item['classification']=classification
        if row.get('status') and row['status'] not in item['acquisition_statuses']:item['acquisition_statuses'].append(row['status'])
        return sid
    for lane_root in sorted(root.iterdir()):
        if not lane_root.is_dir():continue
        lane=lane_root.name
        for relative in ('run_manifest/manifest.json','lane_discovery/'+lane+'.json',
                         'library_acquisition/acquisition_report.json','library_acquisition/acquisition_backlog.json',
                         'library_acquisition/citation_chase_report.json','structured_output/extracted_findings.json'):
            file=lane_root/relative
            if file.is_file():inputs.append({'path':str(file.relative_to(root)),'sha256':sha(file.read_bytes())})
        manifest=read(lane_root/'run_manifest/manifest.json')
        if manifest:manifests.append({'lane':lane,**manifest})
        discovery=read(lane_root/'lane_discovery'/f'{lane}.json')
        for row in discovery.get('results',[]):register(row,lane)
        for attempt in discovery.get('attempts',[]):
            coverage.append({'lane':lane,'repository':attempt.get('repository'),'status':attempt.get('status') or 'UNEXECUTED',
                             'queries':attempt.get('queries') or [],'hits':attempt.get('hits'),
                             'interpretation':'EXECUTION_STATUS_NOT_EXHAUSTIVE_ARCHIVE_COVERAGE'})
            for query in attempt.get('queries') or []:
                for failure in provider_failures(query.get('detail')):
                    access_gaps.append({'lane':lane,'repository':attempt.get('repository'),
                                        'query':query.get('query'),**failure})
        for row in read(lane_root/'library_acquisition/acquisition_report.json').get('results',[]):
            sid=register(row,lane)
            acquisition.append({'source_id':sid,'lane':lane,'status':row.get('status'),
                                'attempted':bool(row.get('web_acquisition_attempted') or row.get('files')),
                                'errors':row.get('errors') or ([row['error']] if row.get('error') else []),
                                'pdf_without_readable_text':row.get('status')=='PDF_ACQUIRED_NO_TEXT'})
            if row.get('parent_source_url'):
                parent=register({'url':row['parent_source_url']},lane)
                relationships.append({'from_source_id':parent,'to_source_id':sid,'relationship':'DISCOVERED_VIA_LINK_OR_CITATION',
                                      'independence_effect':'UNRESOLVED_NOT_CORROBORATION',
                                      'basis':row.get('citation_query') or row.get('source_genealogy')})
        backlog=read(lane_root/'library_acquisition/acquisition_backlog.json')
        for bucket in ('review_required','excluded_from_auto_acquisition','deferred'):
            for row in backlog.get(bucket,[]):
                sid=register(row,lane)
                acquisition.append({'source_id':sid,'lane':lane,'status':bucket.upper(),'attempted':False,
                                    'reasons':(row.get('relevance_assessment') or {}).get('reasons',[])})
        for f in read(lane_root/'structured_output/extracted_findings.json').get('findings',[]):
            sid=register(f,lane);loc=f.get('locator') or {};check=replay(root,lane,f)
            scans=loc.get('scan_indexes_0_based') or []
            missing=[k for k in ('title','creators','publication_date') if not (sources.get(sid,{}).get('bibliography') or {}).get(k)]
            if loc.get('printed_page') is None:missing.append('PRINTED_PAGE_OR_FOLIO_UNRESOLVED')
            holds=sorted(IDENTITY_HOLDS & set(f.get('uncertainties') or []))
            usable=bool(check=='EXACT_ACQUIRED_TEXT_MATCH' and not holds
                        and not {'FICTION_OR_BOOK_REVIEW_CONTEXT','DATE_OUTSIDE_SCOPE'} & set(f.get('uncertainties') or [])
                        and (f.get('target_entity') or {}).get('observed_names')
                        and (f.get('target_entity') or {}).get('association_basis')!='ADJACENT_TOPIC_UNRESOLVED')
            passages.append({'passage_id':lane+':'+str(f.get('finding_id')),'source_id':sid,'lane':lane,
                             'source_statement':None,'interpretation':None,'hypothesis':None,
                             'acquired_text_excerpt':f.get('evidence_excerpt'),'representation':'EXTRACTED_TEXT_NOT_ORIGINAL_TRANSCRIPTION',
                             'original_quote':None,'controlled_transcription':None,'translation':None,'summary':None,
                             'locator':loc,'pdf_pages_1_based':[i+1 for i in scans if isinstance(i,int) and i>=0] if loc.get('pdf_file') else [],
                             'citation_check':check,'citation_missing_fields':missing,
                             'source_text_sha256':f.get('source_text_sha256'),
                             'evidence_state':'ACQUIRED','original_inspected':False,'verified':False,
                             'identity_status':'HELD_FOR_IDENTITY_REVIEW' if holds else 'UNVERIFIED',
                             'usable_as_provisional_reference':usable,
                             'uncertainties':f.get('uncertainties') or [],'identity_holds':holds,
                             'reported_cited_pages':f.get('reported_cited_pages') or []})
    # Equal excerpts across sites/lanes provide dependence leads, not independent votes.
    repeated=defaultdict(list)
    for p in passages:
        quote=' '.join(str(p['acquired_text_excerpt'] or '').split())
        if len(quote)>=80:repeated[sha(quote.encode())].append(p)
    for digest,group in repeated.items():
        if len(group)>1:
            relationships.append({'relationship':'SAME_EXTRACTED_PASSAGE','basis':'NORMALIZED_EXACT_TEXT_MATCH',
                                  'passage_ids':[p['passage_id'] for p in group],
                                  'source_ids':sorted({p['source_id'] for p in group if p['source_id']}),
                                  'independence_effect':'DO_NOT_COUNT_AS_INDEPENDENT_CORROBORATION','text_sha256':digest})
    semantic=read(root/'research_answer/answer.json')
    assertions=[]
    for c in semantic.get('claims',[]):
        assertions.append({k:c.get(k) for k in ('claim_id','statement','kind','quote','source_occurrences','uncertainty','verified')})
    status_counts=Counter(str(c['status']) for c in coverage)
    return {'schema':SCHEMA,'run_id':root.name,'request':request or {},'sources':list(sources.values()),
            'passages':passages,'assertions':assertions,'source_relationships':relationships,
            'coverage':coverage,'coverage_summary':dict(status_counts),'acquisition':acquisition,
            'provider_access_gaps':access_gaps,
            'execution_manifests':manifests,'input_checksums':inputs,
            'analysis_status':semantic.get('status') or 'NOT_EXECUTED',
            'analysis_configuration':semantic.get('configuration') or {},
            'model_execution':{'configuration':semantic.get('model_configuration') or {},'calls':semantic.get('calls') or [],
                               'evidence_hash':semantic.get('evidence_hash')},
            'contradiction_candidates':(semantic.get('review') or {}).get('contradictions') or [],
            'quality':{'passages':len(passages),'exact_replayed_quotes':sum(p['citation_check']=='EXACT_ACQUIRED_TEXT_MATCH' for p in passages),
                       'identity_holds':sum(bool(p['identity_holds']) for p in passages),
                       'sources':len(sources),'provisional_references':sum(p['usable_as_provisional_reference'] for p in passages),
                       'verified_promotions':0},
            'limitations':['SEARCH_IS_NOT_EXHAUSTIVE','MISSING_METADATA_IS_NOT_INVENTED',
                          'EXTRACTED_TEXT_IS_NOT_A_CHECKED_ORIGINAL','INDEPENDENCE_REQUIRES_SOURCE_GENEALOGY',
                          'AUTOMATED_CLASSIFICATION_IS_PROVISIONAL'],
            'rights_policy':'Metadata and quotations exported for research; access conditions are retained when supplied. No access controls bypassed. Full source files are not included in browser exports.',
            'automatic_verified':False}
