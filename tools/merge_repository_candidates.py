#!/usr/bin/env python3
"""Normalize repository-specific lane discoveries into common Citation Chase input."""
import json,os,pathlib,datetime
from request_context import load_request
from research_relevance import identity, rank
from research_discovery_inventory import update_inventory
lane=os.getenv("PCT_RESEARCH_LANE","travellers")
src=pathlib.Path("lane_discovery")/f"{lane}.json"
out=pathlib.Path("citation_chase_candidates");out.mkdir(exist_ok=True)
if not src.exists():
    payload={"schema":"pct-repository-candidates-v2","lane":lane,"selected":[],"attempts":[],"status":"LANE_DISCOVERY_OUTPUT_MISSING","rule":"Missing discovery output is a pipeline diagnostic, not evidence."}
    (out/"repository_candidates.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    print("repository candidates",lane,0,"discovery output missing")
    raise SystemExit(0)
d=json.loads(src.read_text(encoding="utf-8"));selected=[]
for x in d.get("results",[]):
    repo=x.get("discovery_repository") or x.get("repository")
    item={
      "identifier":x.get("identifier"),
      "title":x.get("title"),
      "creator":x.get("creator"),"archival_reference":x.get("archival_reference"),"specialist_agent":x.get("specialist_agent"),
      "description":x.get("description"),"subject":x.get("subject"),"context_excerpt":x.get("context_excerpt"),"mediatype":x.get("mediatype"),
      "metadata_text":x.get("metadata_text"),"snippet":x.get("snippet"),
      **{k:x[k] for k in ('description_provenance','fulltext_links','search_providers','search_provider_attempts','search_query','discovery_route','acquisition_policy') if k in x},
      **{k:x.get(k) for k in ('publication_year','fulltext_hit','fulltext_contexts','source_type','evidence_state','printed_page','canvas_id','scan_index_0_based','image_url','manifest_url','matched_terms','fulltext_query','reported_page_numbers','locator_status','source_origin') if x.get(k) is not None},
      "date":x.get("date"),
      "repository":repo,
      "discovery_repository":repo,
      "discovery_lane":lane,
      "connector_status":x.get("connector_status","EXECUTED"),
      "fallback_for":x.get("fallback_for"),"fallback_reason":x.get("fallback_reason"),
      "url":x.get("url"),
      "digital_url":x.get("digital_url"),
      "iiif_manifest_candidates":x.get("iiif_manifest_candidates",[]),
      "bsb_digital_ids":x.get("bsb_digital_ids",[]),
      "acquisition_route":x.get("acquisition_route"),
      "verification_status":"NEEDS_EVIDENCE",
      "next_stage":"LOCATE_OR_ACQUIRE_DIGITAL_OBJECT"
    }
    if item["identifier"] or item["url"] or item["title"]:selected.append(item)
rf,req,ctx=load_request()
selected=rank(selected,identity(req,ctx))
inventory=update_inventory(selected,lane,"repository_lane_discovery")
payload={"schema":"pct-repository-candidates-v3","generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"lane":lane,"request_file":d.get("request_file"),"selected":selected,"attempts":d.get("attempts",[]),"research_discovery_inventory":"research_discovery/all_findings.json","retained_discovery_count":inventory.get("retained_count",0),"rule":"Repository provenance is retained end-to-end. Catalogue discovery is not evidence and cannot set VERIFIED. Triage never deletes discovery records."}
(out/"repository_candidates.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
print("repository candidates",lane,len(selected))
