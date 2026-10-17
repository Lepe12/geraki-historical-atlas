#!/usr/bin/env python3
"""Post-discovery scientific verification pipeline with strict evidence separation."""
import json,os,pathlib,datetime,hashlib,sys
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from request_context import load_request
from evidence_model import normalize_date,toponym_identity
from research_focus import decompose
from research_relevance import candidate_research_value,evidence_confidence,retention_contract
from exact_page_mapping import pages_for_hit
from claim_evidence_matrix import build_lane as build_claim_evidence_matrix

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
def pdf_matches(file,line,end_line=None):
    found=[]
    for record in acq:
        document=record.get('web_acquisition') or {}
        if not any(pathlib.Path(f).name==file for f in document.get('files',[]) if str(f).endswith('.txt')):continue
        for page in document.get('pages',[]):
            if page.get('start_line',0)<=int(end_line or line or 0) and page.get('end_line',-1)>=int(line or 0):
                found.append({'identifier':record.get('identifier'),'source_file':file,'printed_page':None,
                              'scan_index_0_based':page['scan_index_0_based'],'pdf_file':document.get('pdf_file'),
                              'mapping_basis':'PDF_TEXT_PAGE_BOUNDARY','original_inspected':False})
    return found

for i,h in enumerate(events,1):
    src=h.get("file");related=pages_for_hit(pages,src,i-1,h.get("line"))+pdf_matches(src,h.get("line"),(h.get('locator') or {}).get('end_line'))
    topo=(toponym_identity(h.get("place_match"),ctx["target"],ctx["aliases"])
          if decompose(ctx['target'],ctx['aliases'])['kind']!='person' else None)
    dnorm=normalize_date(" / ".join(str(y) for y in h.get("years_in_scope",[])), h.get("date_role","UNRESOLVED"))
    candidate={
      "candidate_id":f"{LANE}-event-{i:04d}","lane":LANE,"source_file":src,
      "source_type":h.get('source_type') or "OCR_CONTEXT","evidence_state":"ACQUIRED" if related or h.get('evidence_state')=='ACQUIRED' else "LOCATED",
      "title":h.get('title'),"url":h.get('url'),"identifier":h.get('identifier'),"repository":h.get('repository'),
      "acquired_text_excerpt":h.get('evidence_excerpt'),"text_locator":h.get('locator'),
      "extraction_method":h.get('extraction_method'),"extraction_uncertainties":h.get('uncertainties',[]),
      "date_basis":h.get('date_basis'),"date_evidence":h.get('date_evidence'),
      "identity_association":h.get('target_entity'),"reported_cited_pages":h.get('reported_cited_pages',[]),
      "place":topo,"target_entity":{"kind":decompose(ctx["target"],ctx["aliases"])["kind"],"observed_name":h.get("place_match"),"identity_status":"UNVERIFIED"},"date":dnorm,"event_terms":h.get("event_terms",[]),
      "event_type":"UNKNOWN","actor":"UNKNOWN","context_excerpt":h.get("context_excerpt"),
      "exact_page_candidates":[{"identifier":p.get("identifier"),"printed_page":p.get("printed_page"),"leaf":p.get("leaf"),"image_file":p.get("image_file"),"pdf_file":p.get("pdf_file"),"scan_index_0_based":p.get("scan_index_0_based")} for p in related],
      "original_quote":None,"controlled_transcription":None,"translation":None,
      "source_says":None,"researcher_inference":None,"original_inspected":False,
      "extracted":False,"corroborated":False,"machine_status":"NOT_ORIGINAL_VERIFIED",
      "human_review_status":"NOT_REVIEWED","verified":False
    }
    candidate["research_value"]=candidate_research_value(candidate,base=60)
    candidate["evidence_confidence"]=evidence_confidence(candidate)
    candidate["retention"]=retention_contract("PRIORITY")
    candidates.append(candidate)

for j,h in enumerate(catalogue_leads,1):
    if h.get("status")!="CATALOGUE_METADATA_LEAD":continue
    topo=(toponym_identity(h.get("place_match"),ctx["target"],ctx["aliases"])
          if decompose(ctx['target'],ctx['aliases'])['kind']!='person' else None)
    dnorm=normalize_date(" / ".join(str(y) for y in h.get("years_in_scope",[])), h.get("date_role","UNRESOLVED"))
    candidate={
      "candidate_id":f"{LANE}-catalogue-{j:04d}","lane":LANE,
      "source_file":None,"source_type":"CATALOGUE_METADATA",
      "repository":h.get("repository"),"identifier":h.get("identifier"),"url":h.get("url"),"title":h.get("title"),
      "evidence_state":"LOCATED","place":topo,"target_entity":{"kind":decompose(ctx["target"],ctx["aliases"])["kind"],"observed_name":h.get("place_match"),"identity_status":"UNVERIFIED"},"date":dnorm,"event_terms":h.get("event_terms",[]),
      "event_type":"UNKNOWN","actor":"UNKNOWN","context_excerpt":h.get("context_excerpt"),"exact_page_candidates":[],
      "original_quote":None,"controlled_transcription":None,"translation":None,
      "source_says":None,"researcher_inference":None,"original_inspected":False,
      "extracted":False,"corroborated":False,"machine_status":"NOT_ORIGINAL_VERIFIED",
      "human_review_status":"NOT_REVIEWED","verified":False,
      "warning":"Catalogue metadata lead only; not historical evidence."
    }
    candidate["research_value"]=candidate_research_value(candidate,base=40)
    candidate["evidence_confidence"]=evidence_confidence(candidate)
    candidate["retention"]=retention_contract("REVIEW_REQUIRED")
    candidates.append(candidate)

for candidate in candidates:
    for locator in candidate.get('exact_page_candidates',[]):
        if locator.get('pdf_file'):
            inspection.append({'lane':LANE,'source_id':locator.get('identifier'),
                               'pdf_file':locator['pdf_file'],'scan_index_0_based':locator['scan_index_0_based'],
                               'printed_page':None,'evidence_state':'ACQUIRED','status':'NEEDS_ORIGINAL_INSPECTION','original_inspected':False})
write('original_inspection/inspection_queue.json',{'schema':'pct-original-inspection-queue-v2','generated_utc':NOW,'lane':LANE,'items':inspection,'gate':'Acquisition is not original inspection.'})

write("structured_output/candidate_events.json",{
 "schema":"pct-structured-candidates-v4","generated_utc":NOW,"lane":LANE,
 "events":candidates,"total_ocr_event_hits":len(events),
 "total_catalogue_event_leads":len([x for x in catalogue_leads if x.get("status")=="CATALOGUE_METADATA_LEAD"]),
 "rule":"Candidates are review objects, not historical facts. Every candidate remains visible in Research Discovery even when scientific verification is blocked."
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

claim_matrix=build_claim_evidence_matrix(pathlib.Path("."),LANE)
write("claim_evidence_matrix/claims.json",claim_matrix)

source_first_lines=[
 "# Source-first research report",
 "",
 "This report preserves evidence without model-assisted historical synthesis.",
 ""
]
for claim in claim_matrix.get("claims",[]):
    source_first_lines.extend([
      "## "+str(claim.get("claim_id")),
      "Status: **"+str(claim.get("machine_recommendation","UNRESOLVED"))+"**",
      "Research Value: **"+str((claim.get("research_value") or {}).get("score","n/a"))+"/100**",
      "Evidence Confidence: **"+str((claim.get("evidence_confidence") or {}).get("score","n/a"))+"/100**",
      "",
      "### Preserved claim/evidence text",
      str(claim.get("claim_text") or "_No controlled claim text recorded._"),
      "",
      "### Uncertainties"
    ])
    for uncertainty in claim.get("uncertainties",[]) or ["NONE_RECORDED"]:
        source_first_lines.append("- "+str(uncertainty))
    source_first_lines.extend([
      "",
      "### Contradiction search",
      "- "+str(claim.get("contradiction_search_status","NOT_ASSESSED")),
      ""
    ])
pathlib.Path("claim_evidence_matrix/source_first_report.md").write_text(
    "\n".join(source_first_lines)+"\n",encoding="utf-8"
)

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
