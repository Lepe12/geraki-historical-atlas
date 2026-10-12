#!/usr/bin/env python3
"""Safely synchronize research-run source candidates and run state to Airtable.

Discovery/acquisition candidates enter SOURCES as Unverified. EVENTS are never
created here unless a future verified-event exporter supplies records that have
already passed the repository verification gate.
"""
import json,os,pathlib,urllib.request,urllib.parse,datetime,sys
BASE="appML9NlhzlVMoGjb"
SOURCES="tblVnmghyTX7B2EgD"; JOBS="tblXWi37TDh1ZqrX6"
token=os.environ.get("AIRTABLE_TOKEN","").strip()
run_id=os.environ.get("PCT_RUN_ID","").strip()
if not token: raise SystemExit("Missing AIRTABLE_TOKEN")
if not run_id: raise SystemExit("Missing PCT_RUN_ID")
root=pathlib.Path("evidence/runs")/run_id
if not root.exists(): raise SystemExit("Run evidence missing: "+run_id)
headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"}

def request(method,url,payload=None):
    data=json.dumps(payload,ensure_ascii=False).encode() if payload is not None else None
    req=urllib.request.Request(url,data=data,method=method,headers=headers)
    with urllib.request.urlopen(req,timeout=60) as r:return json.load(r)
def list_records(table):
    out=[];offset=None
    while True:
        q={"pageSize":"100"}
        if offset:q["offset"]=offset
        d=request("GET",f"https://api.airtable.com/v0/{BASE}/{table}?"+urllib.parse.urlencode(q))
        out+=d.get("records",[]);offset=d.get("offset")
        if not offset:return out
existing=list_records(SOURCES)
by_ref={str(r.get("fields",{}).get("URL / Archive Ref","")).strip():r["id"] for r in existing if str(r.get("fields",{}).get("URL / Archive Ref","")).strip()}
created=0;skipped=0
rows=[]
for lane in [p for p in root.iterdir() if p.is_dir()]:
    p=lane/"library_acquisition"/"acquisition_report.json"
    if not p.exists():continue
    d=json.loads(p.read_text(encoding="utf-8"))
    for x in d.get("results",[]):
        ref=str(x.get("url") or x.get("digital_url") or x.get("identifier") or "").strip()
        title=str(x.get("title") or x.get("identifier") or "Untitled source candidate").strip()
        if not ref or ref in by_ref: skipped+=1;continue
        creator=x.get("creator",[])
        if isinstance(creator,list):creator="; ".join(map(str,creator))
        dates=x.get("date",[])
        if isinstance(dates,list):dates="; ".join(str(v) for v in dates if v)
        repo=str(x.get("discovery_repository") or x.get("repository") or "UNKNOWN")
        notes=f"Automated research candidate. run={run_id}; lane={lane.name}; repository={repo}; connector_status={x.get('connector_status','')}; acquisition_status={x.get('status','')}. Catalogue/acquisition evidence only; not historical verification."
        rows.append({"fields":{"Source Title":title[:1000],"Author / Creator":str(creator)[:1000],"Year":str(dates)[:1000],"URL / Archive Ref":ref[:1000],"Evidence Notes":notes[:100000],"Verification Status":"Unverified"}})
        by_ref[ref]="PENDING"
sync_error=None
for i in range(0,len(rows),10):
    try:
        request("POST",f"https://api.airtable.com/v0/{BASE}/{SOURCES}",{"records":rows[i:i+10],"typecast":True})
        created+=len(rows[i:i+10])
    except Exception as e:
        sync_error=f"{type(e).__name__}: {e}"
        break
health=json.loads((root/"SYSTEM_HEALTH.json").read_text(encoding="utf-8")) if (root/"SYSTEM_HEALTH.json").exists() else {}
summary={"run_id":run_id,"sources_created":created,"duplicates_skipped":skipped,"all_ten_operational":health.get("all_ten_operational"),"verified_events":sum(int(x.get("verified_events",0)) for x in health.get("lane_reports",[])),"sync_status":"SYNCED" if sync_error is None else "BLOCKED","sync_error":sync_error}
out=root/"AIRTABLE_SYNC.json";out.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(summary,ensure_ascii=False))
