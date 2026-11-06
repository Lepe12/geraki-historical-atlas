#!/usr/bin/env python3
"""N7 Source Scout: public bibliographic *metadata* discovery, never historical fact verification.
No paid APIs. No arbitrary URLs, model calls, ingestion or database changes.
"""
from datetime import datetime,timezone
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request,urlopen

QUERIES=[
    "Barbary corsairs Ottoman Mediterranean history",
    "Venetian Aegean piracy sixteenth century",
    "Petros Lantzas Corfu Mediterranean"
]
UA="N7-Historical-Source-Scout/1.0 (non-commercial historical bibliographic research)"
CROSSREF="https://api.crossref.org/works"
OUTPUT=Path("research/n7-source-candidates.json")

def normalize_crossref(work,query):
    if not isinstance(work,dict):return None
    doi=str(work.get("DOI") or "").strip()
    if not re.fullmatch(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+",doi,re.I):return None
    title=str((work.get("title") or [""])[0]).strip()[:240]
    if len(title)<9:return None
    date=work.get("published",{}).get("date-parts",[[None]])[0][0]
    year=int(date) if isinstance(date,int) and 1450<=date<=2100 else None
    names=[]
    for person in (work.get("author") or [])[:3]:
        if isinstance(person,dict):
            names.append(((person.get("given") or "")+" "+(person.get("family") or "")).strip()[:90])
    return {"id":"doi:"+doi.lower(),"title":title,"authors":[x for x in names if x],
            "year":year,"url":"https://doi.org/"+doi,"provider":"CROSSREF",
            "search_query":query,"source_class":"UNCLASSIFIED_REQUIRES_REVIEW",
            "rights":"METADATA_ONLY_RIGHTS_NOT_ASSESSED",
            "historical_claim_status":"NOT_VERIFIED",
            "full_text_import_permitted":False,
            "research_note":"Bibliographic candidate only; relevance and source evidence require human review."}

def http_json(url,timeout=22):
    request=Request(url,headers={"User-Agent":UA,"Accept":"application/json"})
    with urlopen(request,timeout=timeout) as response:
        if response.status!=200:raise RuntimeError("PUBLIC_METADATA_HTTP_"+str(response.status))
        body=response.read(1_500_000)
        if len(body)>=1_500_000:raise RuntimeError("PUBLIC_METADATA_TOO_LARGE")
        return json.loads(body.decode("utf-8"))

def discover():
    proposals={};warnings=[]
    for i,query in enumerate(QUERIES):
        url=CROSSREF+"?"+urlencode({"query.bibliographic":query,"rows":8,
              "select":"DOI,title,author,published,type,URL"})
        try:
            data=http_json(url)
            works=data.get("message",{}).get("items",[])
            for work in works:
                item=normalize_crossref(work,query)
                if item:proposals.setdefault(item["id"],item)
        except Exception as exc:
            warnings.append("CROSSREF_QUERY_"+str(i)+"_"+type(exc).__name__.upper())
        if i+1<len(QUERIES):time.sleep(1.2)
    # Source rights and historical factual support remain unassessed.
    return {
       "schema":"n7-source-scout-candidates-v1",
       "generated_utc":datetime.now(timezone.utc).isoformat(),
       "search_queries":QUERIES,
       "provider":"Crossref public metadata API",
       "license_scope":"METADATA_ONLY",
       "candidate_count":len(proposals),
       "candidates":sorted(proposals.values(),key=lambda x:(x["search_query"],x["id"]))[:24],
       "warnings":warnings,
       "automatically_ingested_books":0,
       "historical_claims_verified":0,
       "operator_review_required":True
    }

def selftest():
    raw={"DOI":"10.1000/a1","title":["Aegean Corsairs and Maritime History"],
         "author":[{"given":"Anna","family":"Example"}],
         "published":{"date-parts":[[2019]]}}
    result=normalize_crossref(raw,"corsairs")
    assert result["id"]=="doi:10.1000/a1"
    assert result["historical_claim_status"]=="NOT_VERIFIED"
    assert result["full_text_import_permitted"] is False
    assert normalize_crossref({"title":["Not DOI"]},"x") is None
    assert result["url"].startswith("https://doi.org/")
    print(json.dumps({"status":"SELFTEST_PASS","rights_evaluation":"REQUIRED","facts_verified":0}))

if __name__=="__main__":
    if "--self-test" in sys.argv:selftest();sys.exit(0)
    output=discover()
    if not output["candidates"]:
        print(json.dumps({"status":"NO_CANDIDATES","warnings":output["warnings"]}))
        raise SystemExit(2)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"status":"SCOUT_COMPLETE","candidate_count":output["candidate_count"],
        "public_queries":len(QUERIES),"unverified":True,"full_text_downloaded":False,
        "warnings":output["warnings"]}))
