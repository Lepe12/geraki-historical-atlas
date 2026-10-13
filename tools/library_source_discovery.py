#!/usr/bin/env python3
"""Bounded text-source discovery, with contextual ranking and auditable recovery."""
import concurrent.futures, datetime, json, os, pathlib, re, urllib.parse, urllib.request
from request_context import load_request
from research_relevance import identity, discovery_queries, assess

rf,req,ctx=load_request()
ident=identity(req,ctx)
recovery=os.getenv('PCT_RECOVERY_WAVE')=='1'
base_queries=discovery_queries(ident,recovery)[:16]
# Retrieve period editions before ranking; retain unbounded queries for later editions.
years=[int(y) for y in re.findall(r'\b(?:1\d{3}|20\d{2})\b',ctx.get('date_range',''))]
period_queries=[f'({q}) AND year:[{min(years)-100} TO {max(years)+100}]' for q in base_queries[:8]] if years else []
queries=period_queries+base_queries
out=pathlib.Path('library_discovery');out.mkdir(exist_ok=True)

def search(q):
    params=urllib.parse.urlencode({'q':f'mediatype:texts AND ({q})','fl[]':['identifier','title','year','creator','date','description','language','subject','mediatype'],'rows':30,'output':'json'},doseq=True)
    request=urllib.request.Request('https://archive.org/advancedsearch.php?'+params,headers={'User-Agent':'Piratecartography-Research/4.0'})
    with urllib.request.urlopen(request,timeout=25) as f: data=json.load(f)
    return data.get('response',{}).get('docs',[])

items=[];errors=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    pending={pool.submit(search,q):q for q in queries}
    for future in concurrent.futures.as_completed(pending):
        q=pending[future]
        try:
            for d in future.result():
                assessment=assess(d,ident)
                items.append({'query':q,'repository':'Internet Archive','discovery_repository':'Internet Archive','metadata':d,'relevance_assessment':assessment,'target_relevance_score':assessment['score'],'routing':'CITATION_CHASE_PRIORITY' if assessment['status']=='PRIORITY' else 'BROAD_CONTEXT_REVIEW','original_inspected':False,'verified':False})
        except Exception as exc: errors.append({'query':q,'error':type(exc).__name__+': '+str(exc)})
# Keep first-wave leads and query provenance during recovery.
dest=out/'catalogue_candidates.json'
previous=json.loads(dest.read_text()) if recovery and dest.exists() else {}
unique={}
for item in previous.get('records',[])+items:
    key=item['metadata'].get('identifier')
    if key:
        if key not in unique: unique[key]=item
        unique[key].setdefault('discovery_queries',[])
        if item['query'] not in unique[key]['discovery_queries']: unique[key]['discovery_queries'].append(item['query'])
report={'schema':'pct-library-discovery-v3','generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'request_file':rf.name,**ctx,'target_identity':ident,'status':'METADATA_LEADS_ONLY','queries':previous.get('queries',[])+queries,'recovery_wave':recovery,'records':list(unique.values()),'errors':previous.get('errors',[])+errors,'verification_status':'NEEDS_EVIDENCE'}
dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('LIBRARY DISCOVERY',ctx['target'],'queries',len(queries),'records',len(unique),'priority',sum(x['routing']=='CITATION_CHASE_PRIORITY' for x in unique.values()),'errors',len(errors))
