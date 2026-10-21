"""Continue relevant acquired bibliography into bounded source acquisition.

Uses the existing connectors and reader. Search/acquisition receipts are discovery
provenance; a title match never establishes identity, independence or verification.
"""
import json
from pathlib import Path
import re
import time
import unicodedata
from web_acquisition import acquire, citation_title_match


def reference_queries(text):
    """Read citation-only paragraphs, including line-wrapped OCR and containers."""
    text=re.sub(r'(?<=\w)[-\u00ad]\s*\n\s*(?=\w)', '', text)
    text=' '.join(text.split())
    if len(text)>800 or not re.search(r'\b(?:18|19|20)\d{2}\b',text):return []
    if not re.search(r'(?:\d{1,4}\s*[-–]\s*\d{1,4}|(?:pp?\.|σ\.|σελ\.)\s*\d{1,4})\s*[,.;]?$',text):return []
    quoted=re.findall(r'[«“]([^»”]{20,300})[»”]',text)
    out=[]
    for value in quoted:
        # A corrupted opening quote in an author's name must not swallow title.
        if '«' in value:value=value.rsplit('«',1)[-1]
        value=value.strip(' .,;"')
        if len(value.split())>=4 and '…' not in value and '...' not in value:
            out.append(value)
    # Article titles are often unquoted, followed by a quoted collected volume.
    if quoted and '«' in text:
        prefix=text.split('«',1)[0].strip(' .,;')
        prefix=re.sub(r'^\d+\.\s*','',prefix)
        prefix=re.split(r',\s*',prefix)[-1]
        if len(prefix)>=20 and len(prefix.split())>=4:out.insert(0,prefix)
    return list(dict.fromkeys(out))[:3]


def lookup(query,lane):
    from connectors.citation_search import search
    status,rows,detail=search(query,lane,'Cited Work Continuation')
    diagnostics=[{'route':'EXISTING_CITATION_SEARCH','status':status,'detail':detail}]
    # Greek older scholarship is often outside scholarly DOI catalogues. Use
    # the already supported anonymous collection search, without requiring keys.
    if re.search(r'[Α-ω]',query) and not any(citation_title_match(query,r) for r in rows):
        from connectors.repository_connectors import openarchives_public, anemi_public
        from concurrent.futures import ThreadPoolExecutor
        def one(connector):
            try:
                s,r,d=connector(query,lane)
                return {'route':connector.__name__,'status':s,'detail':d},r
            except Exception as error:
                return {'route':connector.__name__,'status':'ACCESS_FAILED',
                        'http_status':getattr(error,'code',None),'error_type':type(error).__name__},[]
        with ThreadPoolExecutor(max_workers=2) as pool:
            for receipt,found in pool.map(one,(openarchives_public,anemi_public)):
                diagnostics.append(receipt);rows.extend(found)
    return diagnostics,rows


def continue_citations(root,ctx,results,*,searcher=lookup,reader=acquire,
                       findings=None,max_queries=6,max_documents=8,budget=240,clock=time.monotonic,
                       on_acquired=lambda:None):
    """One bounded wave after ordinary acquisition, before normal page extraction.

    Reruns retain receipts and skip attempted queries. No recursive citation graph
    expansion and no mutation of acquired source text or previous run directories.
    """
    root=Path(root);out=root/'library_acquisition';out.mkdir(parents=True,exist_ok=True)
    report_path=out/'cited_work_continuation.json'
    report=json.loads(report_path.read_text()) if report_path.exists() else {
        'schema':'pct-cited-work-continuation-v1','searches':[],
        'original_inspected':False,'verified':False}
    seen={x['query_key'] for x in report['searches']}
    tried={a['url'] for s in report['searches'] for a in s.get('acquisitions',[])}
    acquired_urls={r.get('acquired_source_url') or r.get('url') for r in results if r.get('files')}
    if findings is None:
        from section_extraction import build_findings
        findings=build_findings(root,ctx)['findings']
    started=clock();queries=0;documents=0;deferred=[]
    def save():
        report.update(deferred=deferred,budget_seconds=budget,
                      rule='ACQUIRED_TEXT_IS_NOT_ORIGINAL_INSPECTION_OR_VERIFICATION')
        report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    for finding in findings:
        if set(finding.get('uncertainties',[])) & {'CONFLICTING_GIVEN_NAME',
                'LATER_NAMESAKE_REQUIRES_IDENTITY_REVIEW','FICTION_OR_BOOK_REVIEW_CONTEXT'}:continue
        excerpt=finding.get('evidence_excerpt') or ''
        for query in reference_queries(excerpt):
            key=''.join(c for c in unicodedata.normalize('NFD',query.casefold()) if not unicodedata.combining(c))
            if key in seen:continue
            if queries>=max_queries or documents>=max_documents or clock()-started>=budget:
                deferred.append({'query':query,'finding_id':finding.get('finding_id'),'status':'BOUNDED_WAVE_DEFERRED'});continue
            seen.add(key);queries+=1
            search={'query':query,'query_key':key,'parent_source_url':finding.get('url'),
                    'parent_finding_id':finding.get('finding_id'),'parent_locator':finding.get('locator'),
                    'parent_text_sha256':finding.get('source_text_sha256'),
                    'citation_excerpt':excerpt,'acquisitions':[]}
            report['searches'].append(search);save()
            try:diagnostics,rows=searcher(query,ctx.get('lane','travellers'))
            except Exception as error:
                search.update(status='SEARCH_FAILED',error_type=type(error).__name__);save();continue
            search.update(status='SEARCHED',diagnostics=diagnostics,results=rows)
            matched=[row for row in rows if citation_title_match(query,row)]
            search['title_matched_records']=len(matched)
            for row in matched:
                urls=[row.get('digital_url'),*[x.get('url') for x in row.get('fulltext_links',[]) if x.get('is_oa') is True],row.get('url')]
                for url in dict.fromkeys(u for u in urls if u):
                    if url in tried or url in acquired_urls:continue
                    if documents>=max_documents or clock()-started>=budget:
                        search['remaining_status']='ACQUISITION_BUDGET_EXHAUSTED';break
                    tried.add(url);documents+=1
                    receipt={'url':url,'title':row.get('title'),'basis':'TITLE_MATCH_DISCOVERY_ONLY'}
                    search['acquisitions'].append(receipt);save()
                    try:
                        document=reader(url,out,follow=True)
                        receipt.update(status=document['status'],source_url=document['url'],
                                       sha256=document.get('sha256'),files=document['files'],
                                       linked_errors=document.get('errors',[]))
                        for acquired in [document,*document.get('linked_documents',[])]:
                            if (acquired is document and row.get('evidence_level')=='CATALOGUE_METADATA_ONLY'
                                    and acquired.get('source_type')=='WEB_PAGE_TEXT'):
                                receipt['status']='CATALOGUE_METADATA_ACQUIRED_NOT_CITED_WORK'
                                continue
                            if acquired['url'] in acquired_urls:continue
                            acquired_urls.add(acquired['url'])
                            results.append({**row,'identifier':acquired['url'],'url':acquired['url'],
                                'acquired_source_url':acquired['url'],'files':acquired['files'],
                                'web_acquisition':acquired,'status':acquired['status'],
                                'source_origin':'CITED_WORK_CONTINUATION','citation_query':query,
                                'parent_source_url':finding.get('url'),
                                'parent_finding_id':finding.get('finding_id'),
                                'source_genealogy':'CITED_DOCUMENT_NOT_INDEPENDENCE_PROOF',
                                'original_inspected':False,'verification_status':'NEEDS_EVIDENCE'})
                            on_acquired()
                    except Exception as error:
                        receipt.update(status='ACCESS_FAILED',http_status=getattr(error,'code',None),
                                       error_type=type(error).__name__)
                    save()
            if not matched:search['outcome']='CITATION_DEAD_END_IN_SEARCHED_CATALOGUES'
            save()
    save()
    return report
