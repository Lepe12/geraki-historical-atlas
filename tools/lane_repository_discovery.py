#!/usr/bin/env python3
"""Execute lane-specific repository discovery using public search endpoints where stable; preserve unsupported targets for citation chase."""
import os,json,pathlib,urllib.parse,urllib.request,xml.etree.ElementTree as ET
lane=os.getenv("PCT_RESEARCH_LANE","travellers")
plan=json.loads(pathlib.Path(f"repository_plans/{lane}.json").read_text(encoding="utf-8"))
out=pathlib.Path("lane_discovery");out.mkdir(exist_ok=True)
def getjson(url):
 req=urllib.request.Request(url,headers={"User-Agent":"PCT-Historical-Research/2.2"})
 with urllib.request.urlopen(req,timeout=45) as r:return json.load(r)
def ia(q):
 u="https://archive.org/advancedsearch.php?"+urllib.parse.urlencode({"q":q,"fl[]":["identifier","title","creator","date"],"rows":25,"page":1,"output":"json"})
 d=getjson(u);return [{"repository":"Internet Archive",**x} for x in d.get("response",{}).get("docs",[])]
def gallica(q):
 url="https://gallica.bnf.fr/SRU?"+urllib.parse.urlencode({"version":"1.2","operation":"searchRetrieve","query":'gallica all "'+q.replace('"',"")+'"',"maximumRecords":15})
 req=urllib.request.Request(url,headers={"User-Agent":"PCT-Historical-Research/2.2"})
 with urllib.request.urlopen(req,timeout=45) as r: root=ET.fromstring(r.read())
 records=root.findall(".//{http://www.loc.gov/zing/srw/}record")
 found=[]
 for x in records:
  d=x.find(".//{http://purl.org/dc/elements/1.1/}title")
  ids=x.findall(".//{http://purl.org/dc/elements/1.1/}identifier")
  found.append({"repository":"Gallica/BnF","title":d.text if d is not None else None,"identifiers":[z.text for z in ids if z.text]})
 return found
def tna(q):
 url="https://discovery.nationalarchives.gov.uk/API/search/records?"+urllib.parse.urlencode({"SearchQuery":q,"ResultsPageSize":20,"Page":0})
 d=getjson(url)
 records=d.get("Records",d.get("Results",[]))
 return [{"repository":"The National Archives Discovery","record":x} for x in records[:20]]
def europeana(q):
 # Public website target retained; API requires key, so do not fake execution.
 return []
results=[]; attempts=[]
q=plan.get("target","").strip()
# Search a single toponym per request; joining every alias with spaces suppresses legitimate catalogue matches.
if not q: raise SystemExit("Missing research target")
for r in plan["repositories"]:
 name=r["name"]
 try:
  if name=="Internet Archive":
   x=ia(q);results+=x;attempts.append({"repository":name,"status":"EXECUTED","hits":len(x)})
  elif name=="Gallica/BnF":
   x=gallica(q);results+=x;attempts.append({"repository":name,"status":"EXECUTED","hits":len(x)})
  elif name=="The National Archives Discovery":
   x=tna(q);results+=x;attempts.append({"repository":name,"status":"EXECUTED","hits":len(x)})
  else:
   attempts.append({"repository":name,"status":"CITATION_CHASE_WEB_OR_API_CONNECTOR_REQUIRED","base_url":r["base_url"],"query_seed":r["query_seed"]})
 except Exception as e:
  attempts.append({"repository":name,"status":"ERROR","error":str(e)})
  print("CONNECTOR ERROR",lane,name,repr(e))
payload={"lane":lane,"query":q,"attempts":attempts,"results":results,"gate":"Discovery metadata is not historical evidence. Unsupported repositories remain explicit citation-chase targets; never claim searched unless EXECUTED."}
(out/f"{lane}.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
print("LANE DISCOVERY",lane,"executed",sum(a["status"]=="EXECUTED" for a in attempts),"pending",sum(a["status"].startswith("CITATION") for a in attempts),"errors",sum(a["status"]=="ERROR" for a in attempts),"hits",len(results))
for a in attempts: print("REPOSITORY RESULT",a["repository"],a["status"],a.get("hits",0),a.get("error",""))
