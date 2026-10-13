#!/usr/bin/env python3
"""Post-discovery scientific verification pipeline with strict evidence separation."""
import json,os,pathlib,datetime,hashlib,sys
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from request_context import load_request
from evidence_model import normalize_date,toponym_identity
from exact_page_mapping import pages_for_hit

LANE=os.getenv("PCT_RESEARCH_LANE","travellers")
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()
rf,req,ctx=load_request()

def read(path,default=None):
    p=pathlib.Path(path)
    if not p.exists():return default if default is not None else {}
    try:return json.loads(p.read_text(encoding="utf-8"))
    except Exception:return default if default is not None else {}

def write(path,obj):
    p=pathlib.Path(path);p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

acq=read("library_acquisition/acquisition_report.json",{}).get("results",[])
event_report=read("event_first_hits/event_hits.json",{})
events=event_report.get("hits",[])
catalogue_leads=event_report.get("catalogue_leads",[])
pages=read("exact_page_acquisition/exact_page_report.json",{}).get("results",[])
bsb=read("iiif_candidate_requests/bsb_iiif_candidates.json",{}).get("results",[])

inspection=[]
for p in pages:
    if p.get("image_file"):
        inspection.append({
          "lane":LANE,"source_id":p.get("identifier"),"repository":p.get("discovery_repository","Internet Archive"),
          "printed_page":p.get("printed_page"),"leaf_or_canvas":p.get("leaf"),"image_file":p.get("image_file"),
          "evidence_state":"ACQUIRED","status":"NEEDS_ORIGINAL_INSPECTION","original_inspected":False
        })
for r in bsb:
    if r.get("reference_scan"):
        inspection.append({
          "lane":LANE,"source_id":r.get("source_id"),"repository":"BSB",
          "printed_page":None,"leaf_or_canvas":r.get("reference_canvas_id"),
          "image_file":r.get("reference_scan"),"evidence_state":"ACQUIRED",
          "status":"NEEDS_ORIGINAL_INSPECTION","original_inspected":False,"control":bool(r.get("control"))
        })
write("original_inspection/inspection_queue.json",{
 "schema":"pct-original-inspection-queue-v2","generated_utc":NOW,"lane":LANE,
 "items":inspection,"gate":"A downloaded image is ACQUIRED, not ORIGINAL_INSPECTED."
})

genealogy=[]
for r in acq:
    repo=str(r.get("discovery_repository") or r.get("repository") or "UNKNOWN")
    ident=str(r.get("identifier") or r.get("url") or r.get("title") or "UNKNOWN")
    key=(repo.casefold()+"|"+ident.casefold()).encode("utf-8","ignore")
    chain="exact-"+hashlib.sha256(key).hexdigest()[:16]
    genealogy.append({
      "source_id":r.get("identifier"),"repository":repo,"title":r.get("title"),
      "provisional_chain_id":chain,"relationship":"UNRESOLVED",
      "possible_relationships":["INDEPENDENT","COPY","QUOTATION","TRANSLATION","COMMON_SOURCE","DERIVATIVE"],
      "independence_status":"UNKNOWN_PENDING_SOURCE_GENEALOGY","derivative_of":None,
      "genealogy_evidence":[],"verification_status":"NEEDS_EVIDENCE"
    })
write("source_genealogy/genealogy_queue.json",{
 "schema":"pct-source-genealogy-v2","generated_utc":NOW,"lane":LANE,
 "sources":genealogy,
 "rule":"Repository or edition diversity never proves independence. Genealogy relationships require evidence."
})

page_by_source={}
for p in pages:page_by_source.setdefault(str(p.get("source_file","")),[]).append(p)
candidates=[]

for i,h in enumerate(events,1):
    src=h.get("file");related=pages_for_hit(pages,src,i-1,h.get("line"))
    topo=toponym_identity(h.get("place_match"),ctx["target"],ctx["aliases"])
    dnorm=normalize_date(" / ".join(str(y) for y in h.get("years_in_scope",[])), h.get("date_role","UNRESOLVED"))
    candidates.append({
      "candidate_id":f"{LANE}-event-{i:04d}","lane":LANE,"source_file":src,
      "source_type":"OCR_CONTEXT","evidence_state":"ACQUIRED" if related else "LOCATED",
      "place":topo,"date":dnorm,"event_terms":h.get("event_terms",[]),
      "event_type":"UNKNOWN","actor":"UNKNOWN","context_excerpt":h.get("context_excerpt"),
      "exact_page_candidates":[{"identifier":p.get("identifier"),"printed_page":p.get("printed_page"),"leaf":p.get("leaf"),"image_file":p.get("image_file")} for p in related],
      "original_quote":None,"controlled_transcription":None,"translation":None,
      "source_says":None,"researcher_inference":None,"original_inspected":False,
      "extracted":False,"corroborated":False,"machine_status":"NOT_ORIGINAL_VERIFIED",
      "human_review_status":"NOT_REVIEWED","verified":False
    })

for j,h in enumerate(catalogue_leads,1):
    if h.get("status")!="CATALOGUE_METADATA_LEAD":continue
    topo=toponym_identity(h.get("place_match"),ctx["target"],ctx["aliases"])
    dnorm=normalize_date(" / ".join(str(y) for y in h.get("years_in_scope",[])), h.get("date_role","UNRESOLVED"))
    candidates.append({
      "candidate_id":f"{LANE}-catalogue-{j:04d}","lane":LANE,
      "source_file":None,"source_type":"CATALOGUE_METADATA",
      "repository":h.get("repository"),"identifier":h.get("identifier"),"url":h.get("url"),"title":h.get("title"),
      "evidence_state":"LOCATED","place":topo,"date":dnorm,"event_terms":h.get("event_terms",[]),
      "event_type":"UNKNOWN","actor":"UNKNOWN","context_excerpt":h.get("context_excerpt"),"exact_page_candidates":[],
      "original_quote":None,"controlled_transcription":None,"translation":None,
      "source_says":None,"researcher_inference":None,"original_inspected":False,
      "extracted":False,"corroborated":False,"machine_status":"NOT_ORIGINAL_VERIFIED",
      "human_review_status":"NOT_REVIEWED","verified":False,
      "warning":"Catalogue metadata lead only; not historical evidence."
    })

write("structured_output/candidate_events.json",{
 "schema":"pct-structured-candidates-v3","generated_utc":NOW,"lane":LANE,
 "events":candidates,"total_ocr_event_hits":len(events),
 "total_catalogue_event_leads":len([x for x in catalogue_leads if x.get("status")=="CATALOGUE_METADATA_LEAD"]),
 "rule":"Candidates are review objects, not historical facts."
})

write("corroboration/corroboration_queue.json",{
 "schema":"pct-corroboration-queue-v2","generated_utc":NOW,"lane":LANE,
 "candidate_events":[{
   "candidate_id":c["candidate_id"],"independent_supporting_chains":[],
   "source_quality_assessment":[],"corroboration_status":"NOT_ASSESSED",
   "rule":"No fixed number of sources is universally required. Weight authenticity, proximity, independence and claim scope."
 } for c in candidates]
})

write("human_review/review_queue.json",{
 "schema":"pct-human-review-v1","generated_utc":NOW,"lane":LANE,
 "items":[{
   "candidate_id":c["candidate_id"],"machine_status":c["machine_status"],
   "review_status":"NOT_REVIEWED","reviewer":None,"reviewed_utc":None,
   "decision":None,"notes":None,"evidence_examined":[]
 } for c in candidates],
 "rule":"MACHINE_CHECKED and HUMAN_REVIEWED are distinct states."
})

gate_status="NO_EVENT_CANDIDATES" if not candidates else ("NEEDS_EXACT_PAGE_EVIDENCE" if not inspection else "NEEDS_ORIGINAL_INSPECTION")
verification={
 "schema":"pct-verification-gate-v2","generated_utc":NOW,"lane":LANE,
 "status":gate_status,"candidate_events":len(candidates),"inspection_queue_items":len(inspection),"verified_events":0,
 "requirements":{
   "exact_source_identification":True,"original_page_or_folio_inspected":True,
   "event_date_place_extracted":True,"source_genealogy_assessed":True,
   "evidence_quality_weighted":True,"human_review_required_for_verified":True
 },
 "prohibited_shortcuts":["CATALOGUE_TO_VERIFIED","OCR_TO_VERIFIED","SOURCE_COUNT_ONLY_TO_VERIFIED"],
 "rule":"Verification is evidence-weighted and claim-specific; no automated stage may set HUMAN_REVIEWED or VERIFIED."
}
write("verification/verification_gate.json",verification)

write("qa/qa_report.json",{
 "schema":"pct-qa-v2","generated_utc":NOW,"lane":LANE,
 "decision":"BLOCKED_PENDING_EVIDENCE" if candidates else "NO_CANDIDATE_TO_VERIFY",
 "verified_events":0,"candidate_events":len(candidates),
 "checks":{
   "catalogue_not_treated_as_evidence":True,"ocr_not_treated_as_exact_quote":True,
   "actor_unknown_allowed":True,"fixed_three_source_rule_removed":True,
   "original_inspection_required":True,"human_review_separate":True,
   "catalogue_leads_separated":True
 },
 "verification_gate":gate_status
})
print("VERIFICATION PIPELINE",LANE,"candidates",len(candidates),"inspection",len(inspection),"gate",gate_status,"verified",0)
