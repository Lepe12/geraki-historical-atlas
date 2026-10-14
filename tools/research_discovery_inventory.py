#!/usr/bin/env python3
"""Durable research-discovery inventory: triage controls automation, never visibility."""
from __future__ import annotations
import datetime,json
from pathlib import Path

def _key(x):
    repo=str(x.get("discovery_repository") or x.get("repository") or "")
    ident=str(x.get("identifier") or x.get("url") or x.get("title") or "")
    kind=str(x.get("finding_kind") or "SOURCE_DISCOVERY")
    return (repo.casefold(),ident.casefold(),kind)

def update_inventory(findings,lane,source,path="research_discovery/all_findings.json"):
    p=Path(path);p.parent.mkdir(parents=True,exist_ok=True)
    existing={};sources={}
    if p.exists():
        try:
            old=json.loads(p.read_text(encoding="utf-8"))
            for row in old.get("findings",[]) or []:
                existing[_key(row)]=row;sources[_key(row)]=set(row.get("inventory_sources",[]) or [])
        except Exception:
            pass
    for row in findings or []:
        if not isinstance(row,dict):continue
        item=dict(row);item.setdefault("finding_kind","SOURCE_DISCOVERY")
        rel=item.get("relevance_assessment") or {}
        item.setdefault("retention",rel.get("retention") or {
            "retention_status":"RETAINED_RESEARCH_DISCOVERY","visible_in_research_discovery":True,
            "discard_allowed":False,"triage_status":rel.get("status","UNRESOLVED"),
            "acquisition_disposition":"HOLD_FOR_REVIEW",
            "rule":"Scientific triage may change automation priority but must not delete or hide the discovery."
        })
        k=_key(item)
        if k in existing:
            merged=dict(existing[k]);merged.update({kk:vv for kk,vv in item.items() if vv not in (None,"",[],{})});item=merged
        sources.setdefault(k,set()).add(source);item["inventory_sources"]=sorted(sources[k]);existing[k]=item
    rows=list(existing.values());counts={}
    for row in rows:
        status=((row.get("retention") or {}).get("triage_status") or
                (row.get("relevance_assessment") or {}).get("status") or "UNRESOLVED")
        counts[status]=counts.get(status,0)+1
    payload={
        "schema":"pct-research-discovery-inventory-v1",
        "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "lane":lane,"retained_count":len(rows),"triage_counts":counts,"findings":rows,
        "rules":[
            "No discovery is removed because it is weak, unresolved, contradictory or off-target.",
            "EXCLUDE_FROM_ACQUISITION means do not auto-acquire; it does not mean delete.",
            "Research Value and Evidence Confidence are separate non-probabilistic scores."
        ]
    }
    p.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return payload
