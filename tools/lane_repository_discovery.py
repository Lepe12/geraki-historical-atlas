#!/usr/bin/env python3
"""Execute lane-specific archive/library discovery and emit normalized provenance."""
import os,json,pathlib,urllib.parse,urllib.request,sys,time
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from connectors.bsb_sru import search_bsb
from connectors.repository_connectors import audited_dispatch as dispatch
from research_relevance import discovery_queries
from research_focus import decompose, focused_queries
from historical_query_expansion import EVENT_TERMS
lane=os.getenv("PCT_RESEARCH_LANE","travellers")
plan=json.loads(pathlib.Path(f"repository_plans/{lane}.json").read_text(encoding="utf-8"))
out=pathlib.Path("lane_discovery");out.mkdir(exist_ok=True)
UA={"User-Agent":"PCT-Historical-Research/3.0"}

def getjson(url):
    req=urllib.request.Request(url,headers=UA)
    with urllib.request.urlopen(req,timeout=25) as r:return json.load(r)

def ia(q):
    u="https://archive.org/advancedsearch.php?"+urllib.parse.urlencode({"q":"mediatype:texts AND ("+q+")","fl[]":["identifier","title","creator","date","year","description","subject","mediatype"],"rows":20,"page":1,"output":"json"},doseq=True)
    d=getjson(u);out=[]
    for x in d.get("response",{}).get("docs",[]):
        ident=x.get("identifier")
        out.append({"discovery_repository":"Internet Archive","discovery_lane":lane,"connector_status":"EXECUTED","identifier":ident,"title":x.get("title"),"description":x.get("description"),"subject":x.get("subject"),"mediatype":x.get("mediatype"),"creator":x.get("creator"),"date":[x.get("date") or x.get("year")] if (x.get("date") or x.get("year")) else [],"url":("https://archive.org/details/"+ident) if ident else None,"acquisition_route":"INTERNET_ARCHIVE"})
    return out

def tna(q):
    url="https://discovery.nationalarchives.gov.uk/API/search/records?"+urllib.parse.urlencode({"SearchQuery":q,"ResultsPageSize":20,"Page":0})
    d=getjson(url);records=d.get("Records",d.get("Results",[]));out=[]
    for x in records[:20]:
        ident=x.get("Id") or x.get("id") or x.get("Reference") or x.get("reference")
        title=x.get("Title") or x.get("title") or x.get("Description") or x.get("description")
        out.append({"discovery_repository":"The National Archives Discovery","discovery_lane":lane,"connector_status":"EXECUTED","identifier":ident,"title":title,"date":[x.get("Date")] if x.get("Date") else [],"url":("https://discovery.nationalarchives.gov.uk/details/r/"+str(ident)) if ident else None,"raw":x})
    return out

def bsb(q):
    raw=search_bsb(q);out=[]
    for x in raw:
        ids=x.get("identifier") or []; ident=ids[0] if isinstance(ids,list) and ids else None
        links=x.get("digital_links") or []
        out.append({"discovery_repository":"BSB","discovery_lane":lane,"connector_status":"EXECUTED","identifier":ident,"title":x.get("title"),"creator":x.get("creator"),"date":x.get("date") or [],"url":links[0] if links else None,"digital_url":links[0] if links else None,"iiif_manifest_candidates":x.get("iiif_manifest_candidates") or [],"bsb_digital_ids":x.get("bsb_digital_ids") or [],"raw":x})
    return out

# Use the auditable expanded query set produced for this lane.
terms=list(plan.get("expanded_queries") or [])
if not terms:
    terms=[str(plan.get("target","")).strip()]
limit=int(os.getenv("PCT_REPOSITORY_QUERY_LIMIT","0"))
if limit>0: terms=terms[:limit]
results=[]
attempts=[{"repository":r['name'],"status":"UNEXECUTED","hits":0,"queries":[],"base_url":r['base_url']} for r in plan['repositories']]
def save_partial(active_records=()):
    checkpoint={"schema":"pct-lane-discovery-v3","lane":lane,"request_file":plan.get("request_file"),"target":plan.get("target"),"aliases":plan.get("aliases",[]),"date_range":plan.get("date_range"),"attempts":attempts,"results":results+list(active_records),"partial":True,"gate":"Partial discovery metadata is not evidence."}
    (out/f"{lane}.json").write_text(json.dumps(checkpoint,ensure_ascii=False,indent=2),encoding="utf-8")
previous=json.loads((out/f"{lane}.json").read_text()) if (out/f"{lane}.json").exists() else {}
if previous and (previous.get('target'),previous.get('date_range'),previous.get('aliases',[])) != (plan.get('target'),plan.get('date_range'),plan.get('aliases',[])):
    raise SystemExit('DISCOVERY_REQUEST_MISMATCH')
if previous:
    results=previous.get('results',[])
    old={a['repository']:a for a in previous.get('attempts',[])}
    attempts=[old.get(a['repository'],a) for a in attempts]
save_partial()
repo_specs=[]
for repo_index,r in enumerate(plan["repositories"]):
    name=r["name"]; repo_records=[]; statuses=[]; diagnostics=[]
    repo_terms=list(terms)
    if name=="Public Web Source Discovery":
        focus=plan.get('target_identity',{}).get('focus') or decompose(plan['target'],plan.get('aliases',[]))
        repo_terms=focused_queries(focus,include_hypotheses=True)[:6]
    if lane=="travellers" and name in ("Gallica/BnF","BSB","Internet Archive","Google Books"):
        ys=[x for x in str(plan.get("date_range","")).replace("-"," ").split() if x.isdigit()]
        names=[str(plan.get("target") or "").strip()]+[str(x).strip() for x in plan.get("aliases",[]) if str(x).strip()]
        focused=[]
        for n in names:
            if not n: continue
            focused.append(n)
            focused.append(f'"{n}" pirate')
            focused.append(f'"{n}" corsair')
            if ys: focused.append(f'"{n}" {ys[0]}')
        repo_terms=list(dict.fromkeys(focused))[:int(os.getenv("PCT_TRAVELLERS_REPO_QUERY_LIMIT","16"))]
    if name=="David Rumsey Map Collection":
        # Map titles name places, not pirates: query place names only, plus the
        # sourced historical variants from the gazetteer/knowledge file (e.g. Milo, Cerigo).
        names=[str(plan.get("target") or "").strip()]+[str(x).strip() for x in plan.get("aliases",[]) if str(x).strip()]
        try:
            from connectors.open_collections import place_aliases
            expanded=[]
            for n in names[:3]:
                if n: expanded+=[a["name"] for a in place_aliases(n,4)[0]]
            names=names+expanded
        except Exception:
            pass
        repo_terms=list(dict.fromkeys(n for n in names if n))[:int(os.getenv("PCT_RUMSEY_QUERY_LIMIT","6"))]
    if lane=="ottoman":
        # Ottoman catalogues can be slow or browser-mediated. Bound each repository
        # to a focused, auditable query set so one remote surface cannot consume the
        # entire lane discovery timeout.
        ys=[x for x in str(plan.get("date_range","")).replace("-"," ").split() if x.isdigit()]
        target=str(plan.get("target") or "").strip()
        aliases=[str(x).strip() for x in plan.get("aliases",[]) if str(x).strip()]
        names=[target]+aliases[:3]
        focused=[]
        for n in names:
            if not n: continue
            focused.append(n)
            focused.append(f'"{n}" korsan')
            focused.append(f'"{n}" levend')
            if ys: focused.append(f'"{n}" {ys[0]}')
        repo_terms=list(dict.fromkeys(focused))[:int(os.getenv("PCT_OTTOMAN_REPO_QUERY_LIMIT","8"))]
    if name=="SearchCulture.gr / EKT":
        target=str(plan.get("target") or "").strip()
        aliases=[str(x).strip() for x in plan.get("aliases",[]) if str(x).strip()]
        ys=[x for x in str(plan.get("date_range","")).replace("-"," ").split() if x.isdigit()]
        year=ys[0] if ys else None
        repo_terms=[]
        for n in [target]+aliases[:2]:
            if n: repo_terms.append(n)
        if year:
            repo_terms.append("__SC_FILTER__|ekt_chronology="+year)
            if target:
                repo_terms.append("__SC_FILTER__|dcterms_spatial="+target+"|ekt_chronology="+year)
                repo_terms.append("__SC_FILTER__|ekt_place="+target+"|ekt_chronology="+year)
                if any("\u0370"<=ch<="\u03ff" for ch in target) and " " not in target:
                    repo_terms.append("__SC_FILTER__|ekt_place=Νήσος "+target+"|ekt_chronology="+year)
        # Keep the request anchored. Unqualified piracy/captivity searches
        # previously filled named-person results with unrelated catalogue hits.
        repo_terms=list(dict.fromkeys(q for q in repo_terms if q))[:int(os.getenv("PCT_SEARCHCULTURE_QUERY_LIMIT","10"))]
    if name=="The National Archives Public Content":
        ys=[x for x in str(plan.get("date_range","")).replace("-"," ").split() if x.isdigit()]
        target=str(plan.get("target") or "").strip()
        aliases=[str(x).strip() for x in plan.get("aliases",[]) if str(x).strip()]
        names=[target]+aliases[:2]
        repo_terms=[]
        for n in names:
            if not n: continue
            repo_terms.append(n)
            repo_terms.append(f'"{n}" ransom')
            repo_terms.append(f'"{n}" corsair')
            if ys: repo_terms.append(f'"{n}" {ys[0]}')
        repo_terms=list(dict.fromkeys(repo_terms))[:int(os.getenv("PCT_TNA_PUBLIC_QUERY_LIMIT","6"))]
    if name=="Library of Congress":
        ys=[x for x in str(plan.get("date_range","")).replace("-"," ").split() if x.isdigit()]
        target=str(plan.get("target") or "").strip()
        aliases=[str(x).strip() for x in plan.get("aliases",[]) if str(x).strip()]
        repo_terms=[target]
        if ys: repo_terms.append(f'"{target}" {ys[0]}')
        repo_terms.append(f'"{target}" pirate')
        if aliases and ys: repo_terms.append(f'"{aliases[0]}" {ys[0]}')
        repo_terms=list(dict.fromkeys(q for q in repo_terms if q))[:int(os.getenv("PCT_LOC_QUERY_LIMIT","4"))]
    if name=="Biblioteca Digital Hispánica":
        ys=[x for x in str(plan.get("date_range","")).replace("-"," ").split() if x.isdigit()]
        target=str(plan.get("target") or "").strip()
        aliases=[str(x).strip() for x in plan.get("aliases",[]) if str(x).strip()]
        names=[target]+aliases[:2]
        repo_terms=[]
        for n in names:
            if not n: continue
            repo_terms.append(n)
            if ys: repo_terms.append(f'"{n}" {ys[0]}')
            repo_terms.append(f'"{n}" galeras')
            repo_terms.append(f'"{n}" corsario')
        repo_terms=list(dict.fromkeys(repo_terms))[:int(os.getenv("PCT_BNE_QUERY_LIMIT","8"))]
    focused=discovery_queries(plan.get("target_identity", {"target":plan["target"],"aliases":plan.get("aliases",[])}))
    if name != "SearchCulture.gr / EKT":
        specialist_queries=[a["queries"][0] for a in plan.get("specialist_plan",{}).get("agents",[]) if a.get("queries")]
        from itertools import zip_longest
        # Preserve archive-specific vocabulary and existing per-surface limits.
        cap=len(repo_terms)
        interleaved=[q for group in zip_longest(repo_terms,focused,specialist_queries) for q in group if q]
        repo_terms=list(dict.fromkeys(interleaved))[:cap]
    focus=plan.get('target_identity',{}).get('focus') or decompose(plan['target'],plan.get('aliases',[]))
    if focus['kind']=='person':
        cap=max(3,len(repo_terms))
        # Keep the lane's language and alternate names within bounded budgets.
        # Generic English qualifiers previously replaced every archive's plan.
        repo_terms=focused_queries(focus,EVENT_TERMS.get(lane,()),include_hypotheses=name!="SearchCulture.gr / EKT")[:min(cap,16)]
    elif focus['kind']=='topic':
        from research_topics import topic_queries
        # Archive overrides above were designed for individual names. They
        # must not restore an entire quoted question for thematic research.
        repo_terms=topic_queries(focus,lane)
        semantic=[r['query'] for r in (plan.get('semantic_query_expansion') or {}).get('accepted_queries',[]) if r.get('lane')==lane]
        repo_terms=list(dict.fromkeys(repo_terms[:2]+semantic+repo_terms[2:]))
    completed={a['query'] for a in attempts[repo_index].get('queries',[])}
    pending=[q for q in repo_terms if q not in completed]
    if attempts[repo_index].get('status') in ('API_KEY_REQUIRED','AUTH_OR_BROWSER_REQUIRED','ACCESS_BLOCKED','REMOTE_ACCESS_BLOCKED','REMOTE_RATE_LIMITED'):pending=[]
    repo_specs.append((repo_index,r,pending))

# Each round gives every repository one query before a second query is issued.
# Checkpoints are written only on the coordinator thread. Subsequent invocations
# continue the saved queue rather than restarting successful queries.
started=time.monotonic()
budget=float(os.getenv('PCT_DISCOVERY_BUDGET_SECONDS','220'))
quantum=max(1,int(os.getenv('PCT_DISCOVERY_ROUNDS_PER_PASS','3')))
def execute(job):
    index,r,q=job
    try:
        if r['name']=='Internet Archive':x=ia(q);status='EXECUTED';diag='public advanced-search API'
        elif r['name']=='The National Archives Discovery':x=tna(q);status='EXECUTED';diag='public Discovery API'
        elif r['name']=='BSB':x=bsb(q);status='EXECUTED';diag='official Alma SRU'
        else:status,x,diag=dispatch(r['name'],q,lane)
    except Exception as e:
        status,x,diag='ERROR',[],type(e).__name__
    return index,q,status,x,diag
blocked=set()
for round_number in range(quantum):
    if time.monotonic()-started>=budget:break
    jobs=[(i,r,queue[0]) for i,r,queue in repo_specs if queue and i not in blocked]
    if not jobs:break
    interrupted=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        from concurrent.futures import as_completed
        for future in as_completed([pool.submit(execute,j) for j in jobs]):
            try:i,q,status,records,diag=future.result()
            except BaseException as exc:interrupted.append(exc);continue
            attempt=attempts[i]
            attempt.setdefault('queries',[]).append({'query':q,'status':status,'detail':diag,'hits':len(records)})
            attempt['status']='EXECUTED' if any(v['status']=='EXECUTED' for v in attempt['queries']) else status
            keys={(v.get('discovery_repository'),str(v.get('identifier') or v.get('url') or v.get('title'))) for v in results}
            for row in records:
                key=(row.get('discovery_repository'),str(row.get('identifier') or row.get('url') or row.get('title')))
                if key not in keys:results.append(row);keys.add(key)
            attempt['hits']=sum(v.get('discovery_repository')==attempt['repository'] for v in results)
            repo_specs[i][2].pop(0)
            if status not in ('EXECUTED','ERROR'):
                blocked.add(i)
                attempt['remaining_queries_not_retried']=list(repo_specs[i][2])
                repo_specs[i][2].clear()
            if repo_specs[i][2]:attempt['status']='IN_PROGRESS'
            save_partial()
    if interrupted:raise interrupted[0]
remaining={r['name']:queue for i,r,queue in repo_specs if queue}
for i,r,queue in repo_specs:
    attempts[i]['deferred_queries']=queue
    if queue:attempts[i]['status']='PARTIAL'
payload={'schema':'pct-lane-discovery-v3','lane':lane,'request_file':plan.get('request_file'),
         'target':plan.get('target'),'aliases':plan.get('aliases',[]),'date_range':plan.get('date_range'),
         'attempts':attempts,'results':results,'partial':bool(remaining),'deferred_queries':remaining,
         'gate':'Bounded discovery only. Deferred queries are not searched; acquisition is not verification.'}
(out/f'{lane}.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
print('LANE DISCOVERY',lane,'records',len(results),'remaining repositories',len(remaining))
