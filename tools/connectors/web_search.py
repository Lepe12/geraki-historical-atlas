"""Bounded Google (SerpAPI) and Brave web discovery; never historical verification."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
import urllib.error
import urllib.parse
import urllib.request


PROVIDERS=(('google','SERPAPI_API_KEY'),('brave','BRAVE_SEARCH_API_KEY'))


def _request_json(url,headers):
    req=urllib.request.Request(url,headers={'User-Agent':'Piratecartography-Research/3.0',
                                          'Accept':'application/json',**headers})
    with urllib.request.urlopen(req,timeout=18) as response:
        return json.loads(response.read(4_000_001).decode('utf-8'))


def _url(value,domain=None):
    if not isinstance(value,str):return None
    try:p=urllib.parse.urlsplit(value)
    except ValueError:return None
    if p.scheme not in ('http','https') or not p.hostname or p.username or p.password:return None
    host=p.hostname.casefold()
    if domain and host!=domain.casefold() and not host.endswith('.'+domain.casefold()):return None
    # A fragment does not identify a separate source document.
    return urllib.parse.urlunsplit((p.scheme,p.netloc,p.path,p.query,''))


def _provider_search(provider,key,query):
    """One request per provider/query. Diagnostics never include keys or raw errors."""
    attempt={'provider':provider,'status':'API_KEY_REQUIRED','request_performed':False,
             'pagination':'NOT_EXECUTED','returned_records':0}
    if not key:return attempt,[]
    attempt['request_performed']=True
    try:
        if provider=='google':
            url='https://serpapi.com/search.json?'+urllib.parse.urlencode(
                {'engine':'google','q':query,'api_key':key,'start':0})
            data=_request_json(url,{})
            if not isinstance(data,dict):raise ValueError('INVALID_RESPONSE')
            state=(data.get('search_metadata') or {}).get('status')
            if data.get('error') or state=='Error':
                attempt.update(status='FAILED',code='PROVIDER_ERROR')
                return attempt,[]
            items=data.get('organic_results')
            # Empty search results are valid only with explicit provider evidence.
            if items is None and state=='Success' and (data.get('search_information') or {}).get('organic_results_state')=='Fully empty':
                items=[]
            if not isinstance(items,list):raise ValueError('UNRECOGNIZED_RESULTS')
            more=bool((data.get('serpapi_pagination') or {}).get('next')) or None
            rows=[{'url':x.get('link'),'title':x.get('title'),'snippet':x.get('snippet')}
                  for x in items if isinstance(x,dict)]
            attempt['service']='SerpAPI / Google organic results'
        else:
            url='https://api.search.brave.com/res/v1/web/search?'+urllib.parse.urlencode(
                {'q':query,'count':10,'offset':0})
            data=_request_json(url,{'X-Subscription-Token':key})
            if not isinstance(data,dict) or data.get('error'):raise ValueError('PROVIDER_ERROR')
            items=(data.get('web') or {}).get('results')
            # An absent web block isn't proof that a web search completed empty.
            if not isinstance(items,list):raise ValueError('UNRECOGNIZED_RESULTS')
            more=(data.get('query') or {}).get('more_results_available')
            rows=[{'url':x.get('url'),'title':x.get('title'),'snippet':x.get('description')}
                  for x in items if isinstance(x,dict)]
            attempt['service']='Brave Search API'
        attempt.update(status='EXECUTED',pagination='FIRST_PAGE_ONLY',
                       more_results_available=more,returned_records=len(rows))
        return attempt,rows
    except urllib.error.HTTPError as exc:
        attempt.update(status='REMOTE_RATE_LIMITED' if exc.code==429 else 'REMOTE_ACCESS_BLOCKED' if exc.code in (401,403) else 'FAILED',
                       code='HTTP_'+str(exc.code))
    except Exception as exc:
        attempt.update(status='FAILED',code=type(exc).__name__)
    return attempt,[]


def search(q,lane,repository,domain=None,max_records=20):
    """Query both configured providers and retain provider-level coverage failures."""
    query=('site:'+domain+' ' if domain else '')+str(q)
    with ThreadPoolExecutor(max_workers=2) as pool:
        outputs=list(pool.map(lambda p:_provider_search(p[0],os.getenv(p[1],''),query),PROVIDERS))
    attempts=[attempt for attempt,_ in outputs]
    by_url={}
    for attempt,items in outputs:
        for item in items:
            url=_url(item.get('url'),domain)
            if not url or not item.get('title'):continue
            provider=attempt['provider']
            if url in by_url:
                if provider not in by_url[url]['search_providers']:by_url[url]['search_providers'].append(provider)
                continue
            by_url[url]={
                'discovery_repository':repository,'discovery_lane':lane,'connector_status':'EXECUTED',
                'identifier':url,'url':url,'title':item['title'],'description':item.get('snippet') or '',
                'date':[],'search_providers':[provider],'search_query':query,
                'discovery_route':'WEB_SEARCH_API','description_provenance':'SEARCH_ENGINE_SNIPPET_NOT_INSPECTED_TEXT',
                'evidence_level':'WEB_DISCOVERY_ONLY','verification_status':'UNVERIFIED_DISCOVERY',
                'acquisition_policy':'PUBLIC_ACCESS_ONLY_NO_LOGIN_OR_PAYWALL_BYPASS',
                'digital_url':url if urllib.parse.urlsplit(url).path.casefold().endswith('.pdf') else None,
            }
    rows=list(by_url.values())
    diagnostic={'schema':'pct-web-search-coverage-v1','query':query,'providers':attempts,
                'coverage':'BOUNDED_FIRST_PAGE_ONLY','unique_records':len(rows),
                'truncated_records':max(0,len(rows)-max_records),
                'source_independence':'PROVIDER_AGREEMENT_IS_NOT_SOURCE_CORROBORATION'}
    for row in rows:row['search_provider_attempts']=attempts
    executed=any(a['status']=='EXECUTED' for a in attempts)
    status='EXECUTED' if executed else 'API_KEY_REQUIRED' if all(a['status']=='API_KEY_REQUIRED' for a in attempts) else 'REMOTE_ACCESS_BLOCKED'
    if status=='API_KEY_REQUIRED':diagnostic['code']='WEB_SEARCH_PROVIDER_NOT_CONFIGURED'
    return status,rows[:max_records],json.dumps(diagnostic,ensure_ascii=False)
