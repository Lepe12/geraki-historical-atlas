#!/usr/bin/env python3
"""Execute lane-specific archive/library discovery and emit normalized provenance."""
import os,json,pathlib,urllib.parse,urllib.request,sys
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from connectors.bsb_sru import search_bsb
from connectors.repository_connectors import dispatch
lane=os.getenv("PCT_RESEARCH_LANE","travellers")
plan=json.loads(pathlib.Path(f"repository_plans/{lane}.json").read_text(encoding="utf-8"))
out=pathlib.Path("lane_discovery");out.mkdir(exist_ok=True)
UA={"User-Agent":"PCT-Historical-Research/3.0"}

def getjson(url):
    req=urllib.request.Request(url,headers=UA)
    with urllib.request.urlopen(req,timeout=25) as r:return json.load(r)

def ia(q):
    u="https://archive.org/advancedsearch.php?"+urllib.parse.urlencode({"q":q,"fl[]":["identifier","title","creator","date","year"],"rows":20,"page":1,"output":"json"},doseq=True)
    d=getjson(u);out=[]
    for x in d.get("response",{}).get("docs",[]):
        ident=x.get("identifier")
        out.append({"discovery_repository":"Internet Archive","discovery_lane":lane,"connector_status":"EXECUTED","identifier":ident,"title":x.get("title"),"creator":x.get("creator"),"date":[x.get("date") or x.get("year")] if (x.get("date") or x.get("year")) else [],"url":("https://archive.org/details/"+ident) if ident else None,"acquisition_route":"INTERNET_ARCHIVE"})
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
results=[];attempts=[]
for r in plan["repositories"]:
    name=r["name"]; repo_records=[]; statuses=[]; diagnostics=[]
    repo_terms=list(terms)
    if name=="SearchCulture.gr / EKT":
        greek_names=[x for x in [plan.get("target")]+plan.get("aliases",[]) if any("\u0370"<=ch<="\u03ff" for ch in str(x))]
        base_name=greek_names[0] if greek_names else plan.get("target")
        ys=[x for x in str(plan.get("date_range","")).replace("-"," ").split() if x.isdigit()]
        repo_terms=[
          f"{base_name} πειρατές",
          f"{base_name} κατάληψη",
          f"{base_name} {ys[0]}" if ys else str(base_name)
        ]
        repo_terms=list(dict.fromkeys(repo_terms))[:int(os.getenv("PCT_SEARCHCULTURE_QUERY_LIMIT","3"))]
    if name=="Library of Congress":
        ys=[x for x in str(plan.get("date_range","")).replace("-"," ").split() if x.isdigit()]
        target=str(plan.get("target") or "").strip()
        aliases=[str(x).strip() for x in plan.get("aliases",[]) if str(x).strip()]
        repo_terms=[target]
        if ys: repo_terms.append(f'"{target}" {ys[0]}')
        repo_terms.append(f'"{target}" pirate')
        if aliases and ys: repo_terms.append(f'"{aliases[0]}" {ys[0]}')
        repo_terms=list(dict.fromkeys(q for q in repo_terms if q))[:int(os.getenv("PCT_LOC_QUERY_LIMIT","4"))]
    for q in repo_terms:
        try:
            if name=="Internet Archive":
                x=ia(q);status="EXECUTED";diag="public advanced-search API"
            elif name=="The National Archives Discovery":
                x=tna(q);status="EXECUTED";diag="public Discovery API"
            elif name=="BSB":
                x=bsb(q);status="EXECUTED";diag="official Alma SRU"
            else:
                status,x,diag=dispatch(name,q,lane)
            statuses.append(status);diagnostics.append({"query":q,"status":status,"detail":diag,"hits":len(x)})
            repo_records.extend(x)
            # auth/key/browser blockers do not benefit from alias retries
            if status not in ("EXECUTED","ERROR"):break
        except Exception as e:
            statuses.append("ERROR");diagnostics.append({"query":q,"status":"ERROR","detail":f"{type(e).__name__}: {e}","hits":0})
    ded=[];seen=set()
    for x in repo_records:
        k=str(x.get("identifier") or x.get("url") or x.get("title") or json.dumps(x,sort_keys=True,default=str))
        if k in seen:continue
        seen.add(k);ded.append(x)
    results.extend(ded)
    if "EXECUTED" in statuses: overall="EXECUTED"
    elif "API_KEY_REQUIRED" in statuses: overall="API_KEY_REQUIRED"
    elif "AUTH_OR_BROWSER_REQUIRED" in statuses: overall="AUTH_OR_BROWSER_REQUIRED"
    elif statuses and all(s=="ERROR" for s in statuses):overall="ERROR"
    else:overall=statuses[0] if statuses else "CITATION_CHASE_WEB_OR_API_CONNECTOR_REQUIRED"
    attempts.append({"repository":name,"status":overall,"hits":len(ded),"queries":diagnostics,"base_url":r["base_url"]})
    # Persist partial progress before the next remote repository can time out.
    checkpoint={"schema":"pct-lane-discovery-v3","lane":lane,"request_file":plan.get("request_file"),"target":plan.get("target"),"aliases":plan.get("aliases",[]),"date_range":plan.get("date_range"),"attempts":attempts,"results":results,"partial":True,"gate":"Partial discovery metadata is not evidence."}
    (out/f"{lane}.json").write_text(json.dumps(checkpoint,ensure_ascii=False,indent=2),encoding="utf-8")
payload={"schema":"pct-lane-discovery-v3","lane":lane,"request_file":plan.get("request_file"),"target":plan.get("target"),"aliases":plan.get("aliases",[]),"date_range":plan.get("date_range"),"attempts":attempts,"results":results,"gate":"Discovery metadata is not historical evidence. EXECUTED means a real remote query completed; auth/key/browser targets remain explicit blockers and are never claimed as searched."}
(out/f"{lane}.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
print("LANE DISCOVERY",lane,"executed",sum(a["status"]=="EXECUTED" for a in attempts),"blocked",sum(a["status"] in ("AUTH_OR_BROWSER_REQUIRED","API_KEY_REQUIRED") for a in attempts),"errors",sum(a["status"]=="ERROR" for a in attempts),"hits",len(results))
for a in attempts:print("REPOSITORY RESULT",a["repository"],a["status"],a["hits"])
