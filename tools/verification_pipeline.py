#!/usr/bin/env python3
"""Complete the post-discovery verification/QA stages without inventing evidence.

This stage prepares inspection, genealogy, corroboration, verification, QA and
structured candidate outputs. It will not turn OCR/catalogue/acquisition signals
into VERIFIED historical claims.
"""
import json,os,pathlib,datetime,hashlib,re

LANE=os.getenv("PCT_RESEARCH_LANE","travellers")
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()

def read(path,default=None):
    p=pathlib.Path(path)
    if not p.exists():return default if default is not None else {}
    try:return json.loads(p.read_text(encoding="utf-8"))
    except Exception:return default if default is not None else {}

def write(path,obj):
    p=pathlib.Path(path);p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

acq=read("library_acquisition/acquisition_report.json",{}).get("results",[])
events=read("event_first_hits/event_hits.json",{}).get("hits",[])
pages=read("exact_page_acquisition/exact_page_report.json",{}).get("results",[])
bsb=read("iiif_candidate_requests/bsb_iiif_candidates.json",{}).get("results",[])

inspection=[]
for p in pages:
    if p.get("image_file"):
        inspection.append({
          "lane":LANE,"source_id":p.get("identifier"),"repository":p.get("discovery_repository","Internet Archive"),
          "printed_page":p.get("printed_page"),"leaf_or_canvas":p.get("leaf"),
          "image_file":p.get("image_file"),"status":"NEEDS_ORIGINAL_INSPECTION",
          "original_inspected":False
        })
for r in bsb:
    if r.get("reference_scan"):
        inspection.append({
          "lane":LANE,"source_id":r.get("source_id"),"repository":"BSB",
          "printed_page":None,"leaf_or_canvas":r.get("reference_canvas_id"),
          "image_file":r.get("reference_scan"),"status":"NEEDS_ORIGINAL_INSPECTION",
          "original_inspected":False,"control":bool(r.get("control"))
        })
write("original_inspection/inspection_queue.json",{
 "schema":"pct-original-inspection-queue-v1","generated_utc":NOW,"lane":LANE,
 "items":inspection,"gate":"A downloaded image is not inspected merely because it exists."
})

# Conservative source genealogy: exact repository+identifier duplicates share a chain;
# all other independence remains UNKNOWN until parent/derivative relationships are researched.
chains={};genealogy=[]
for r in acq:
    repo=str(r.get("discovery_repository") or r.get("repository") or "UNKNOWN")
    ident=str(r.get("identifier") or r.get("url") or r.get("title") or "UNKNOWN")
    key=(repo.casefold()+"|"+ident.casefold()).encode("utf-8","ignore")
    chain="exact-"+hashlib.sha256(key).hexdigest()[:16]
    chains.setdefault(chain,0);chains[chain]+=1
    genealogy.append({
      "source_id":r.get("identifier"),"repository":repo,"title":r.get("title"),
      "provisional_chain_id":chain,"independence_status":"UNKNOWN_PENDING_SOURCE_GENEALOGY",
      "derivative_of":None,"verification_status":"NEEDS_EVIDENCE"
    })
write("source_genealogy/genealogy_queue.json",{
 "schema":"pct-source-genealogy-queue-v1","generated_utc":NOW,"lane":LANE,
 "sources":genealogy,
 "rule":"Different repositories/editions are not automatically independent. Exact duplicate grouping is only a de-duplication aid."
})

# Build candidate-event records from OCR proximity, never as verified events.
page_by_source={}
for p in pages:
    page_by_source.setdefault(str(p.get("source_file","")),[]).append(p)
candidates=[]
for i,h in enumerate(events,1):
    src=h.get("file")
    related=page_by_source.get(str(src),[])
    candidates.append({
      "candidate_id":f"{LANE}-event-{i:04d}","lane":LANE,"source_file":src,
      "place_match":h.get("place_match"),"years_in_scope":h.get("years_in_scope",[]),
      "event_terms":h.get("event_terms",[]),"exact_page_candidates":[{"identifier":p.get("identifier"),"printed_page":p.get("printed_page"),"leaf":p.get("leaf"),"image_file":p.get("image_file")} for p in related[:10]],
      "actor":"UNKNOWN","status":"CANDIDATE_NEEDS_ORIGINAL_INSPECTION",
      "verified":False
    })
write("structured_output/candidate_events.json",{
 "schema":"pct-structured-candidates-v1","generated_utc":NOW,"lane":LANE,
 "events":candidates,"rule":"Candidate output is safe for review/import but must not be represented as a Verified Airtable event."
})

write("corroboration/corroboration_queue.json",{
 "schema":"pct-corroboration-queue-v1","generated_utc":NOW,"lane":LANE,
 "candidate_events":[{"candidate_id":c["candidate_id"],"independent_supporting_chains":0,"required_independent_chains":3,"status":"NEEDS_GENEALOGY_AND_ORIGINAL_INSPECTION"} for c in candidates],
 "rule":"Corroboration counts independent source chains, not portal copies or repeated citations."
})

if not candidates:
    gate_status="NO_EVENT_CANDIDATES"
elif not inspection:
    gate_status="NEEDS_EXACT_PAGE_EVIDENCE"
else:
    gate_status="NEEDS_ORIGINAL_INSPECTION"
verification={
 "schema":"pct-verification-gate-v1","generated_utc":NOW,"lane":LANE,
 "status":gate_status,"candidate_events":len(candidates),"inspection_queue_items":len(inspection),
 "verified_events":0,"requirements":{
   "original_page_inspected":True,"event_date_place_extracted":True,
   "source_genealogy_checked":True,"minimum_independent_source_chains":3,
   "qa_passed":True
 },
 "rule":"No automated acquisition/OCR/catalogue stage can set VERIFIED."
}
write("verification/verification_gate.json",verification)
write("qa/qa_report.json",{
 "schema":"pct-qa-v1","generated_utc":NOW,"lane":LANE,
 "decision":"BLOCKED_PENDING_EVIDENCE" if candidates else "NO_CANDIDATE_TO_VERIFY",
 "verified_events":0,"candidate_events":len(candidates),
 "checks":{
   "catalogue_not_treated_as_evidence":True,
   "ocr_not_treated_as_exact_quote":True,
   "actor_optional_unknown_allowed":True,
   "three_independent_chains_required":True,
   "original_inspection_required":True
 },
 "verification_gate":gate_status
})
print("VERIFICATION PIPELINE",LANE,"candidates",len(candidates),"inspection",len(inspection),"gate",gate_status,"verified",0)
