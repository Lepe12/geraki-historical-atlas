#!/usr/bin/env python3
"""NABOU//X persistent research memory.

This is deliberately conservative: it learns routing/query performance and stores
retrievable document chunks with provenance. It never promotes a claim to VERIFIED.
"""
from __future__ import annotations
import json, re, hashlib, datetime
from pathlib import Path

SCHEMA="naboux-research-memory-v1"
DEFAULT_PATH=Path("data/naboux_memory.json")

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")

def empty():
    return {"schema":SCHEMA,"updated_utc":None,"source_memory":{},"query_memory":{},"failure_memory":{},"documents":{},"entities":{}}

def load(path=DEFAULT_PATH):
    p=Path(path)
    if not p.exists(): return empty()
    d=json.loads(p.read_text(encoding="utf-8"))
    if d.get("schema")!=SCHEMA: raise ValueError("MEMORY_SCHEMA_MISMATCH")
    for k,v in empty().items(): d.setdefault(k,v)
    return d

def save(mem,path=DEFAULT_PATH):
    mem["updated_utc"]=utcnow()
    p=Path(path); p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(mem,ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")

def _key(*parts):
    return hashlib.sha256("\0".join(str(x) for x in parts).encode()).hexdigest()

def _bump(table,key,success,meta):
    row=table.setdefault(key,{"attempts":0,"successes":0,"failures":0,"last_status":None,"last_seen_utc":None,**meta})
    row["attempts"]+=1
    if success: row["successes"]+=1
    else: row["failures"]+=1
    row["last_status"]="SUCCESS" if success else "FAILURE"
    row["last_seen_utc"]=utcnow()

def learn_specialist_result(mem,result,run_id=""):
    agent=str(result.get("agent_id") or "unknown")
    for run in result.get("search_runs",[]) or []:
        if not isinstance(run,dict): continue
        source=str(run.get("connector_id") or run.get("repository") or "unknown")
        query=str(run.get("query") or "").strip()
        status=str(run.get("status") or "")
        records=run.get("records") if isinstance(run.get("records"),list) else []
        success=status=="EXECUTED" and len(records)>0
        sk=_key(agent,source)
        _bump(mem["source_memory"],sk,success,{"agent_id":agent,"source":source})
        if query:
            qk=_key(agent,source,query)
            _bump(mem["query_memory"],qk,success,{"agent_id":agent,"source":source,"query":query,"last_result_count":0})
            mem["query_memory"][qk]["last_result_count"]=len(records)
        if not success:
            reason=str(run.get("diagnostic") or run.get("error") or status or "NO_RESULTS")[:1000]
            fk=_key(agent,source,reason)
            _bump(mem["failure_memory"],fk,False,{"agent_id":agent,"source":source,"reason":reason})
    return mem

def learn_results_tree(mem,root,run_id=""):
    root=Path(root)
    for p in root.rglob("result.json"):
        try:
            learn_specialist_result(mem,json.loads(p.read_text(encoding="utf-8")),run_id)
        except Exception:
            continue
    return mem

def ingest_document(mem,subject,source_path,pages,source_sha256=None):
    subject=subject.strip()
    if not subject: raise ValueError("SUBJECT_REQUIRED")
    raw="\n".join(text for _,text in pages)
    digest=source_sha256 or hashlib.sha256(raw.encode("utf-8")).hexdigest()
    doc_id=_key(subject,source_path,digest)
    chunks=[]
    for page_no,text in pages:
        clean=re.sub(r"\s+"," ",text or "").strip()
        for i in range(0,len(clean),1600):
            chunk=clean[i:i+1800].strip()
            if len(chunk)<80: continue
            chunks.append({"chunk_id":_key(doc_id,page_no,i,chunk),"page":page_no,"text":chunk})
    mem["documents"][doc_id]={
        "subject":subject,"source_path":source_path,"sha256":digest,
        "ingested_utc":utcnow(),"review_status":"INGESTED_UNREVIEWED",
        "verified":False,"chunks":chunks
    }
    ek=subject.casefold()
    e=mem["entities"].setdefault(ek,{"canonical_name":subject,"document_ids":[],"aliases":[],"review_status":"UNREVIEWED"})
    if doc_id not in e["document_ids"]: e["document_ids"].append(doc_id)
    return doc_id,len(chunks)

def retrieve(mem,query,limit=6):
    terms={x for x in re.findall(r"[\wÀ-ÿΑ-ωάέήίόύώϊϋΐΰ]+",query.casefold()) if len(x)>=3}
    scored=[]
    for doc_id,doc in mem.get("documents",{}).items():
        subject=str(doc.get("subject","")).casefold()
        for ch in doc.get("chunks",[]):
            blob=(subject+" "+str(ch.get("text",""))).casefold()
            score=sum(3 if t in subject else 1 for t in terms if t in blob)
            if score: scored.append((score,doc_id,ch))
    scored.sort(key=lambda x:(-x[0],x[1],x[2].get("page",0)))
    return [{"score":s,"document_id":d,**c} for s,d,c in scored[:limit]]

def successful_queries(mem,agent_id,limit=4):
    rows=[]
    for row in mem.get("query_memory",{}).values():
        if row.get("agent_id")!=agent_id or row.get("successes",0)<1: continue
        rate=row.get("successes",0)/max(1,row.get("attempts",1))
        rows.append((rate,row.get("last_result_count",0),row.get("query","")))
    rows.sort(reverse=True)
    return [q for _,__,q in rows[:limit] if q]
