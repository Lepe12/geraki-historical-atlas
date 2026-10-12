#!/usr/bin/env python3
"""Execute lane-specific repository discovery using public search endpoints where stable; preserve unsupported targets for citation chase."""
import os,json,pathlib,urllib.parse,urllib.request
lane=os.getenv("PCT_RESEARCH_LANE","travellers")
plan=json.loads(pathlib.Path(f"repository_plans/{lane}.json").read_text(encoding="utf-8"))
out=pathlib.Path("lane_discovery");out.mkdir(exist_ok=True)
def getjson(url):
 req=urllib.request.Request(url,headers={"User-Agent":"PCT-Historical-Research/2.2"})
 with urllib.request.urlopen(req,timeout=45) as r:return json.load(r)
def ia(q):
 u="https://archive.org/advancedsearch.php?"+urllib.parse.urlencode({"q":q,"fl[]":["identifier","title","creator","date"],"rows":25,"page":1,"output":"json"})
 d=getjson(u);return [{"repository":"Internet Archive",**x} for x in d.get("response",{}).get("docs",[])]
def europeana(q):
 # Public website target retained; API requires key, so do not fake execution.
 return []
results=[]; attempts=[]
q=" ".join([plan.get("target",""),*json.loads(pathlib.Path(sorted(pathlib.Path("library_discovery_requests").glob("*.json"))[-1]).read_text()).get("aliases",[])])
for r in plan["repositories"]:
 name=r["name"]
 try:
  if name=="Internet Archive":
   x=ia(q);results+=x;attempts.append({"repository":name,"status":"EXECUTED","hits":len(x)})
  else:
   attempts.append({"repository":name,"status":"CITATION_CHASE_WEB_OR_API_CONNECTOR_REQUIRED","base_url":r["base_url"],"query_seed":r["query_seed"]})
 except Exception as e:attempts.append({"repository":name,"status":"ERROR","error":str(e)})
payload={"lane":lane,"query":q,"attempts":attempts,"results":results,"gate":"Discovery metadata is not historical evidence. Unsupported repositories remain explicit citation-chase targets; never claim searched unless EXECUTED."}
(out/f"{lane}.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
print("LANE DISCOVERY",lane,"executed",sum(a["status"]=="EXECUTED" for a in attempts),"pending",sum(a["status"].startswith("CITATION") for a in attempts),"hits",len(results))
