#!/usr/bin/env python3
"""Acquire what can be acquired automatically from common Citation Chase candidates.

Repository provenance is retained.  Unsupported/non-direct digital objects remain
LOCATED rather than being misreported as acquired or verified.
"""
import json,pathlib,urllib.request,urllib.parse,datetime,re,os,time
from request_context import load_request
from web_acquisition import acquire as acquire_web
from connectors.web_search import search as search_web
from research_relevance import identity, rank, request_digest
rf,req,ctx=load_request()
request_sha=request_digest(req,ctx)

ROOT=pathlib.Path("citation_chase_candidates")
OUT=pathlib.Path("library_acquisition");OUT.mkdir(exist_ok=True)

def load(path):
    if not path.exists():return []
    return json.loads(path.read_text(encoding="utf-8")).get("selected",[])

candidates=load(ROOT/"repository_candidates.json")+load(ROOT/"routed_candidates.json")
seen=set();items=[]
for x in candidates:
    k=(str(x.get("discovery_repository") or x.get("repository")),str(x.get("identifier") or x.get("url") or x.get("title")))
    if k in seen:continue
    seen.add(k);items.append(x)

# Assess before acquisition, retain every rejected/uncertain item in the backlog.
ranked=rank(items,identity(req,ctx))
held_review=[x for x in ranked if x['relevance_assessment']['status']=='REVIEW_REQUIRED' and not x.get('source_lead')]
off_target=[x for x in ranked if x['relevance_assessment']['status']=='EXCLUDE_FROM_ACQUISITION' and not x.get('source_lead')]
held=held_review+off_target
items=[x for x in ranked if x['relevance_assessment']['status']=='PRIORITY' or x.get('source_lead')]
report_path=OUT/'acquisition_report.json'
previous=json.loads(report_path.read_text()) if report_path.exists() else {}
if previous and previous.get('request_sha256')!=request_sha:
    raise SystemExit('ACQUISITION_REQUEST_MISMATCH')
results=previous.get('results',[])
def key(x):
    return (str(x.get('discovery_repository') or x.get('repository')),str(x.get('identifier') or x.get('url') or x.get('title')))
completed={key(x) for x in results if x.get('status')!='ACQUISITION_ERROR' and (x.get('status')!='LOCATED_CITATION_CHASE' or x.get('web_acquisition_attempted') or not (x.get('url') or x.get('digital_url')))}
pending=[x for x in items if key(x) not in completed]
max_items=max(1,int(os.getenv('PCT_MAX_ACQUISITION_CANDIDATES','100')))
max_batches=max(1,int(os.getenv('PCT_ACQUISITION_BATCHES','3')))
selected=pending[:max_items*max_batches]
deferred=pending[len(selected):]
started=time.monotonic()
budget=max(1,int(os.getenv('PCT_ACQUISITION_BUDGET_SECONDS','360')))

def checkpoint(remaining):
    (OUT/'acquisition_backlog.json').write_text(json.dumps({'request_sha256':request_sha,'total_candidates':len(ranked),'completed':len(results),'deferred_count':len(remaining),'deferred':remaining,'review_required':held_review,'excluded_from_auto_acquisition':off_target,'all_retained_discoveries':ranked,'research_discovery_inventory':'research_discovery/all_findings.json','resume_command':'python3 tools/acquire_library_candidate.py','rule':'Rerun in the same request workspace to continue; completed objects are skipped. REVIEW_REQUIRED and EXCLUDE_FROM_ACQUISITION remain visible research discoveries and are never silently discarded.'},ensure_ascii=False,indent=2))
    report={'schema':'pct-library-acquire-v3','generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'request_sha256':request_sha,'results':results,'deferred_count':len(remaining),'held_count':len(held),'total_candidates':len(ranked),'verification_status':'NEEDS_EVIDENCE','gate':'Acquisition is not inspection or verification.'}
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2))
checkpoint(pending)
items=selected
citation_history=OUT/'citation_chase_report.json'
citation_searches=json.loads(citation_history.read_text()).get('searches',[]) if citation_history.exists() else []
citation_queries_seen={x['query'] for x in citation_searches}

def safe_name(s):
    return re.sub(r"[^A-Za-z0-9_.-]+","_",str(s))[:180]

def fetch(url,limit=8_000_000,timeout=14):
    req=urllib.request.Request(url,headers={"User-Agent":"Piratecartography-Research/3.0"})
    with urllib.request.urlopen(req,timeout=timeout) as f:
        data=f.read(limit+1);ctype=f.headers.get("Content-Type","")
    if len(data)>limit:raise ValueError("object exceeds acquisition size limit")
    return data,ctype

for position,x in enumerate(items):
    if time.monotonic()-started>=budget:
        deferred=items[position:]+deferred
        break
    rec=dict(x);rec["files"]=[];rec["original_inspected"]=False;rec["verification_status"]="NEEDS_EVIDENCE"
    repo=str(rec.get("discovery_repository") or rec.get("repository") or "")
    ident=rec.get("identifier")
    try:
        is_ia=(rec.get("acquisition_route")=="INTERNET_ARCHIVE" or repo.lower().startswith("internet archive"))
        if is_ia and ident:
            with urllib.request.urlopen("https://archive.org/metadata/"+urllib.parse.quote(str(ident)),timeout=25) as f:meta=json.load(f)
            names=[str(a.get("name","")) for a in meta.get("files",[])]
            preferred=[n for n in names if n.lower().endswith(("_djvu.txt","_searchtext.txt"))]
            # Use the exact file identified by full-text discovery where available.
            expected=rec.get('fulltext_hit',{}).get('filename') if isinstance(rec.get('fulltext_hit'),dict) else None
            if expected:
                preferred=sorted(preferred,key=lambda n:0 if n==expected else 1)
            if len(preferred)>1 and not expected:
                rec['status']='AMBIGUOUS_TEXT_FILE'
                rec['errors']=['Multiple OCR files; a matched issue/file is required.']
                preferred=[]
            rec["available_text_files"]=preferred[:20]
            for n in preferred[:1]:
                try:
                    url="https://archive.org/download/"+urllib.parse.quote(str(ident))+"/"+urllib.parse.quote(n)
                    data,_=fetch(url)
                    dest=OUT/safe_name(str(ident)+"_"+pathlib.Path(n).name);dest.write_bytes(data);rec["files"].append(str(dest))
                except Exception as e:rec.setdefault("errors",[]).append(f"IA_TEXT {type(e).__name__}: {e}")
            rec["status"]="TEXT_ACQUIRED" if rec["files"] else rec.get("status","METADATA_ONLY")
        else:
            # Manifest acquisition is safe and bounded; image/page acquisition occurs later.
            manifests=rec.get("iiif_manifest_candidates") or []
            for i,url in enumerate(manifests[:3]):
                try:
                    data,ctype=fetch(url,limit=4_000_000,timeout=14)
                    json.loads(data.decode("utf-8","replace"))
                    dest=OUT/(safe_name((ident or repo)+"_manifest_"+str(i+1))+".json");dest.write_bytes(data);rec["files"].append(str(dest))
                except Exception as e:rec.setdefault("errors",[]).append(f"IIIF_MANIFEST {type(e).__name__}: {e}")
            direct=rec.get("digital_url")
            if direct and str(direct).lower().split("?")[0].endswith((".txt",".xml",".json")):
                try:
                    data,ctype=fetch(str(direct))
                    ext=pathlib.Path(urllib.parse.urlparse(str(direct)).path).suffix or ".dat"
                    dest=OUT/(safe_name(ident or repo+"_direct")+ext);dest.write_bytes(data);rec["files"].append(str(dest))
                except Exception as e:rec.setdefault("errors",[]).append(f"DIRECT {type(e).__name__}: {e}")
            rec["status"]="DIGITAL_METADATA_ACQUIRED" if rec["files"] else "LOCATED_CITATION_CHASE"
            if not manifests:
                url=rec.get('digital_url') or rec.get('url')
                if url:
                    rec['web_acquisition_attempted']=True
                    try:
                        acquired=acquire_web(url,OUT)
                        rec['web_acquisition']=acquired
                        rec['files'].extend(acquired['files'])
                        rec['status']=acquired['status']
                        rec['acquired_source_url']=acquired['url']
                        for query in acquired.get('bibliographic_queries',[]):
                            if query in citation_queries_seen or len(citation_queries_seen)>=3 or time.monotonic()-started>=budget:continue
                            citation_queries_seen.add(query)
                            status,leads,diagnostic=search_web('"'+query+'"',os.getenv('PCT_RESEARCH_LANE','travellers'),'Citation Chase')
                            for lead in leads:
                                lead.update(parent_source_url=acquired['url'],citation_query=query,source_lead=True)
                            citation_searches.append({'query':query,'parent_source_url':acquired['url'],'status':status,'diagnostic':diagnostic,'results':leads})
                            for lead in [v for v in leads if v.get('digital_url')][:2]:
                                try:
                                    cited=acquire_web(lead['digital_url'],OUT,follow=False)
                                    results.append({**lead,'files':cited['files'],'web_acquisition':cited,'status':cited['status'],'original_inspected':False,'verification_status':'NEEDS_EVIDENCE'})
                                except Exception as exc:
                                    citation_searches[-1].setdefault('acquisition_failures',[]).append({'url':lead['digital_url'],'code':type(exc).__name__})
                        for child in acquired.get('linked_documents',[]):
                            linked={**rec,'identifier':child['url'],'url':child['url'],
                                    'title':'Linked document: '+child['url'],'files':child['files'],
                                    'web_acquisition':child,'status':child['status'],
                                    'parent_source_url':acquired['url'],'source_genealogy':'CITED_DOCUMENT_NOT_INDEPENDENCE_PROOF'}
                            results[:]=[old for old in results if key(old)!=key(linked)]
                            results.append(linked)
                    except Exception as e:
                        rec.setdefault('errors',[]).append('WEB_ACQUISITION '+type(e).__name__)

    except Exception as e:
        rec["status"]="ACQUISITION_ERROR";rec["error"]=f"{type(e).__name__}: {e}"
    results[:]=[old for old in results if key(old)!=key(rec)]
    results.append(rec)
    checkpoint(items[position+1:]+deferred)
checkpoint(deferred)
print("ACQUISITION",len(results),"acquired",sum(x.get('status') in ('TEXT_ACQUIRED','DIGITAL_METADATA_ACQUIRED') for x in results),"deferred",len(deferred),"held",len(held))

(OUT/'citation_chase_report.json').write_text(json.dumps({'searches':citation_searches,'verification_status':'UNVERIFIED_DISCOVERY','bounded_queries':3},ensure_ascii=False,indent=2))
lane_path=pathlib.Path('lane_discovery')/(os.getenv('PCT_RESEARCH_LANE','travellers')+'.json')
if citation_searches and lane_path.exists():
    discovery=json.loads(lane_path.read_text())
    existing={v.get('url') for v in discovery.get('results',[])}
    for search in citation_searches:
        for row in search['results']:
            if row.get('url') not in existing:discovery.setdefault('results',[]).append(row);existing.add(row.get('url'))
    lane_path.write_text(json.dumps(discovery,ensure_ascii=False,indent=2))
