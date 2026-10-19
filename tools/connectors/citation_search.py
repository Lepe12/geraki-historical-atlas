"""Citation lookup through existing web and public catalogue connectors.

Public catalogue discovery complements unavailable web providers. It requires
neither a new service nor a new credential, and never verifies a citation.
"""
from concurrent.futures import ThreadPoolExecutor
import json
from . import web_search
from .repository_connectors import crossref_works,bnf_sru,openalex_works

PUBLIC_CATALOGUES=(('Crossref',crossref_works),('BnF',bnf_sru),('OpenAlex',openalex_works))

def _lookup(item,query,lane):
    name,connector=item
    try:
        status,rows,_=connector(query,lane)
        return {'repository':name,'status':status,'returned_records':len(rows)},rows
    except Exception as error:
        code=getattr(error,'code',None)
        return {'repository':name,'status':'ACCESS_FAILED','error_type':type(error).__name__,
                'code':'HTTP_'+str(code) if isinstance(code,int) else None,'returned_records':0},[]

def search(query,lane,repository='Citation Chase'):
    status,rows,detail=web_search.search(query,lane,repository)
    if rows:return status,rows,detail
    query=str(query).strip('" ')
    with ThreadPoolExecutor(max_workers=len(PUBLIC_CATALOGUES)) as pool:
        results=list(pool.map(lambda item:_lookup(item,query,lane),PUBLIC_CATALOGUES))
    try:diagnostic=json.loads(detail)
    except (ValueError,TypeError):diagnostic={'schema':'pct-web-search-coverage-v1','providers':[]}
    diagnostic['public_catalogues']=[attempt for attempt,_ in results]
    diagnostic['fallback_reason']='WEB_SEARCH_EMPTY_OR_UNAVAILABLE'
    diagnostic['coverage']='BOUNDED_WEB_AND_PUBLIC_CATALOGUES_NOT_EXHAUSTIVE'
    seen=set();out=[]
    for attempt,records in results:
        for row in records:
            key=row.get('url') or row.get('identifier') or row.get('title')
            if not key or key in seen:continue
            seen.add(key);out.append({**row,'citation_lookup_route':'PUBLIC_CATALOGUE_FALLBACK',
                'original_inspected':False,'verification_status':'NEEDS_EVIDENCE'})
    diagnostic['unique_records']=len(out)
    if any(attempt['status']=='EXECUTED' for attempt,_ in results):status='EXECUTED'
    return status,out,json.dumps(diagnostic,ensure_ascii=False)
