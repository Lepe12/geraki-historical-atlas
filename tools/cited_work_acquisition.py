"""Continue relevant acquired bibliography into bounded source acquisition.

Uses the existing connectors and reader. Search/acquisition receipts are discovery
provenance; a title match never establishes identity, independence or verification.
"""
import json
import hashlib
from pathlib import Path
import re
import time
import unicodedata
from web_acquisition import acquire, citation_title_match


def candidate_title_match(query, record):
    """Conservative download triage; keep rejected results as discovery leads.

    Generic congress titles must not substitute geography for Americanists.
    Full token coverage still does not prove author, edition or downloaded bytes.
    """
    def tokens(value):
        value=''.join(c for c in unicodedata.normalize('NFD',str(value or '').casefold())
                      if not unicodedata.combining(c))
        return set(re.findall(r'[^\W\d_]{4,}',value))
    return citation_title_match(query,record) and tokens(query)<=tokens(record.get('title'))


def identity_review_holds(report):
    """Re-evaluate legacy receipts rather than trusting their old pending list."""
    return [{'query':s.get('query'),'query_key':s.get('query_key'),
             'status':'CITATION_IDENTITY_REVIEW_REQUIRED',
             'candidate_urls':[a.get('url') for a in s.get('acquisitions',[])
                               if a.get('status')=='TEXT_ACQUIRED']}
            for s in report.get('searches',[])
            if any(a.get('status')=='TEXT_ACQUIRED' for a in s.get('acquisitions',[]))]


def reference_queries(text):
    """Read citation-only paragraphs, including line-wrapped OCR and containers."""
    text=re.sub(r'(?<=\w)[-\u00ad]\s*\n\s*(?=\w)', '', text)
    text=' '.join(text.split())
    if len(text)>800 or not re.search(r'\b(?:1[5-9]|20)\d{2}\b',text):return []
    # A full author-initial-year bibliography entry can cite a whole book
    # without quotation marks or a page range. It remains a discovery lead.
    entry=re.match(r"^[^\W\d_][^,;\d]{1,70},\s*(?:[^\W\d_]\.\s*){1,4}(?:1[5-9]|20)\d{2}\.\s+(.+)",text)
    if entry:
        title=re.split(r'\.\s+|,\s+[^,]{2,50}\.?$',entry[1],maxsplit=1)[0].strip(' .,;')
        if 20<=len(title)<=240 and len(title.split())>=4 and '…' not in title and '...' not in title:return [title]
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


def cited_bibliography_entries(root, results, findings):
    """Locate full entries only for author-years cited in relevant passages.

    Bibliography discovery is not independent corroboration or edition identity.
    Original source text and exact character ranges remain unchanged.
    """
    root=Path(root).resolve();out=[]
    prefix=re.compile(r'(?m)^(?P<author>[^\W\d_][^,;\d\n]{1,70}),\s*(?:[^\W\d_]\.[ \t]*){1,4}(?P<year>(?:1[5-9]|20)\d{2})\.\s+')
    for source in results:
        url=source.get('acquired_source_url') or source.get('url')
        contexts='\n'.join(f.get('evidence_excerpt','') for f in findings if f.get('url') in (url,source.get('url'))).casefold()
        if not contexts:continue
        for name in dict.fromkeys([*source.get('files',[]),*(source.get('web_acquisition') or {}).get('files',[])]):
            if not str(name).endswith('.txt'):continue
            path=(root/name).resolve()
            if not path.is_relative_to(root) or not path.is_file() or path.stat().st_size>10_000_000:continue
            raw=path.read_bytes();text=raw.decode('utf-8',errors='replace');entries=list(prefix.finditer(text))
            for n,entry in enumerate(entries):
                if not re.search(re.escape(entry['author'].casefold())+r'\s+'+entry['year']+r'(?!\d)',contexts):continue
                start=entry.start();end=min(entries[n+1].start() if n+1<len(entries) else len(text),start+800)
                block=text[start:end].strip();queries=reference_queries(block)
                if not queries:continue
                out.append({'finding_id':'bibliography-'+hashlib.sha256((str(url)+'\0'+block).encode()).hexdigest()[:20],
                            'url':url,'evidence_excerpt':block,'bibliographic_queries':queries,
                            'source_text_sha256':hashlib.sha256(raw).hexdigest(),
                            'locator':{'start_char':start,'end_char':start+len(block),'offset_unit':'UNICODE_CODE_POINTS'},
                            'discovery_basis':'AUTHOR_YEAR_CITED_IN_RELEVANT_ACQUIRED_PASSAGE',
                            'publication_year_hint':int(entry['year']),
                            'date_hint_role':'RETRIEVAL_PRIORITY_NOT_EVENT_DATE_OR_PRIMARY_SOURCE_VERIFICATION',
                            'source_independence':'NOT_ESTABLISHED','original_inspected':False})
    return out


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
    # Stop duplicate downloads, not bibliographic review. A candidate acquisition
    # is not resolution of the cited work, even when its title is an exact match.
    def query_acquired(search):
        return any(a.get('status')=='TEXT_ACQUIRED' for a in search.get('acquisitions',[]))
    seen={x['query_key'] for x in report['searches'] if query_acquired(x) or x.get('attempts',1)>=3}
    prior={x['query_key']:x for x in report['searches']}
    tried={a['url'] for s in report['searches'] for a in s.get('acquisitions',[]) if a.get('status')=='TEXT_ACQUIRED'}
    acquired_urls={r.get('acquired_source_url') or r.get('url') for r in results
        if r.get('files') and r.get('status')=='TEXT_ACQUIRED'
        and not (r.get('evidence_level')=='CATALOGUE_METADATA_ONLY'
            and (r.get('web_acquisition') or {}).get('source_type')=='WEB_PAGE_TEXT')}
    if findings is None:
        from section_extraction import build_findings
        findings=build_findings(root,ctx)['findings']
    findings=list(findings)
    book_leads=cited_bibliography_entries(root,results,findings)
    years=[int(y) for y in re.findall(r'(?<!\d)(?:1\d{3}|20\d{2})(?!\d)',ctx.get('date_range',''))]
    if years:book_leads.sort(key=lambda row:not min(years)<=row['publication_year_hint']<=max(years))
    findings=book_leads+findings
    # Preserve the reader's bibliography leads as well as citation-only
    # paragraphs. A missing locator stays missing; this is discovery, not proof.
    for source in results:
        acquired=source.get('web_acquisition') or {}
        if acquired.get('bibliographic_queries'):
            findings.append({'url':acquired.get('url') or source.get('url'),
                'bibliographic_queries':acquired['bibliographic_queries'],
                'source_text_sha256':acquired.get('text_sha256'),
                'evidence_excerpt':'','locator':None,'finding_id':None})
    started=clock();queries=0;documents=0;deferred=[]
    def save():
        pending=[s['query_key'] for s in report['searches'] if not query_acquired(s) and s.get('attempts',1)<3]
        unresolved=[s['query_key'] for s in report['searches']]
        for search in report['searches']:
            search['citation_resolution'] = ('CITATION_IDENTITY_REVIEW_REQUIRED' if query_acquired(search)
                else 'CITATION_SEARCH_EXHAUSTED' if search.get('attempts',1)>=3
                else 'CITATION_ACQUISITION_PENDING')
        report.update(deferred=deferred,pending=pending,unresolved=unresolved,budget_seconds=budget,
                      identity_review_required=[s['query_key'] for s in report['searches'] if query_acquired(s)],
                      rule='ACQUIRED_TEXT_IS_NOT_ORIGINAL_INSPECTION_OR_VERIFICATION')
        report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    for finding in findings:
        if set(finding.get('uncertainties',[])) & {'CONFLICTING_GIVEN_NAME',
                'LATER_NAMESAKE_REQUIRES_IDENTITY_REVIEW','FICTION_OR_BOOK_REVIEW_CONTEXT'}:continue
        excerpt=finding.get('evidence_excerpt') or ''
        for query in finding.get('bibliographic_queries',reference_queries(excerpt)):
            key=''.join(c for c in unicodedata.normalize('NFD',query.casefold()) if not unicodedata.combining(c))
            if key in seen:continue
            if queries>=max_queries or documents>=max_documents or clock()-started>=budget:
                deferred.append({'query':query,'finding_id':finding.get('finding_id'),'status':'BOUNDED_WAVE_DEFERRED'});continue
            seen.add(key);queries+=1
            search={'attempts':prior.get(key,{}).get('attempts',0)+1,'query':query,'query_key':key,'parent_source_url':finding.get('url'),
                    'parent_finding_id':finding.get('finding_id'),'parent_locator':finding.get('locator'),
                    'parent_text_sha256':finding.get('source_text_sha256'),
                    'citation_excerpt':excerpt,'acquisitions':[]}
            if key in prior:
                report.setdefault('attempt_history',[]).append(prior[key])
                report['searches']=[s for s in report['searches'] if s['query_key']!=key]
            report['searches'].append(search);save()
            try:diagnostics,rows=searcher(query,ctx.get('lane','travellers'))
            except Exception as error:
                search.update(status='SEARCH_FAILED',error_type=type(error).__name__);save();continue
            search.update(status='SEARCHED',diagnostics=diagnostics,results=rows)
            matched=[row for row in rows if candidate_title_match(query,row)]
            search['ambiguous_title_candidates']=[{'url':row.get('url'),'title':row.get('title'),
                'status':'TITLE_VARIANT_REQUIRES_IDENTITY_REVIEW'} for row in rows
                if citation_title_match(query,row) and not candidate_title_match(query,row)]
            search['title_matched_records']=len(matched)
            for row in matched:
                urls=[row.get('digital_url'),*[x.get('url') for x in row.get('fulltext_links',[]) if x.get('is_oa') is True],row.get('url')]
                for url in dict.fromkeys(u for u in urls if u):
                    if url in acquired_urls:
                        search['acquisitions'].append({'url':url,'status':'TEXT_ACQUIRED',
                            'basis':'ALREADY_ACQUIRED_SOURCE_RETAINED'})
                        continue
                    if url in tried:continue
                    if documents>=max_documents or clock()-started>=budget:
                        search['remaining_status']='ACQUISITION_BUDGET_EXHAUSTED';break
                    tried.add(url);documents+=1
                    receipt={'url':url,'title':row.get('title'),'basis':'TITLE_MATCH_DISCOVERY_ONLY',
                             'identity_status':'NOT_ESTABLISHED'}
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
            if not matched:search['outcome']=('CANDIDATE_TITLE_IDENTITY_REVIEW_REQUIRED'
                if search['ambiguous_title_candidates'] else 'CITATION_DEAD_END_IN_SEARCHED_CATALOGUES')
            save()
    save()
    return report

