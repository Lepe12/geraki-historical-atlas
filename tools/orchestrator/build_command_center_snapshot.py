#!/usr/bin/env python3
"""Build a real-data Command Center snapshot from durable JARVIS evidence."""
from __future__ import annotations
import argparse,datetime,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from research_relevance import identity, assess
from research_evidence_package import build as build_evidence_package, provider_failures

LANE_LABELS={
 "greek":"Greek","travellers":"Travellers","spanish_simancas":"Simancas","venetian":"Venetian","french":"French",
 "british":"British","dutch":"Dutch","german":"German","italian_states":"Italian States",
 "ottoman":"Ottoman","north_african":"North African"
}

def read(path:Path,default=None):
    if not path.exists(): return {} if default is None else default
    try:return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError,OSError):return {} if default is None else default

def candidate_claims(run_root:Path):
    claims=[]
    for lane in LANE_LABELS:
        data=read(run_root/lane/"structured_output"/"candidate_events.json",{})
        for c in data.get("events",[]) or []:
            claims.append({
              "candidate_id":c.get("candidate_id"),"lane":lane,
              "title":c.get("title") or c.get("source_file") or c.get("identifier"),
              "source_type":c.get("source_type"),"evidence_state":c.get("evidence_state"),
              "event_type":c.get("event_type"),"actor":c.get("actor"),
              "place":c.get("place"),"date":c.get("date"),
              "repository":c.get("repository"),"identifier":c.get("identifier"),
              "url":c.get("url"),"original_inspected":bool(c.get("original_inspected")),
              **{k:c.get(k) for k in ('context_excerpt','acquired_text_excerpt','text_locator','date_basis','date_evidence','identity_association','extraction_method','extraction_uncertainties','reported_cited_pages','exact_page_candidates') if c.get(k) is not None},
              "verified":bool(c.get("verified"))
            })
    return claims

def specialist_events(repo:Path,run_id:str):
    root=repo/"evidence/specialist_runs"/run_id
    out=[]
    if not root.exists():return out
    for p in root.glob("raw_agents/**/events.jsonl"):
        try:lines=p.read_text(encoding="utf-8").splitlines()
        except OSError:continue
        for line in lines:
            if not line.strip():continue
            try:e=json.loads(line)
            except json.JSONDecodeError:continue
            if isinstance(e,dict):out.append(e)
    out.sort(key=lambda x:str(x.get("created_utc") or ""))
    return out[-600:]

def research_request(run_root:Path):
    for lane in LANE_LABELS:
        lane_file=run_root/lane/"research_lanes"/f"{lane}.json"
        d=read(lane_file,{})
        if not d:continue
        req=d.get("normalized_request") or d.get("request") or {}
        if req:
            return {
              "target":req.get("target"),"aliases":req.get("aliases") or [],
              "date_range":req.get("date_range"),"purpose":req.get("purpose"),
              "source_leads":req.get("source_leads") or []
            }
    return {}

def discovery_results(run_root:Path,request=None):
    """Publish retained leads and executed-query coverage, independently of claims."""
    discoveries=[];coverage=[];seen=set()
    for lane in LANE_LABELS:
        root=run_root/lane
        inv=read(root/"research_discovery/all_findings.json",{})
        raw=read(root/"lane_discovery"/f"{lane}.json",{})
        rows=inv.get("findings") or raw.get("results") or []
        for row in rows:
            key=(lane,row.get("repository") or row.get("discovery_repository"),str(row.get("identifier") or row.get("url") or row.get("title")))
            if key in seen:continue
            seen.add(key)
            assessment=row.get("relevance_assessment") or {}
            if request and request.get('target'):
                ident=identity(request,request)
                current=assess(row,ident)
                assessment=current if ident['type']=='person' else {**current,**assessment,'topical_match':current['topical_match']}
            discoveries.append({
                "lane":lane,"identifier":row.get("identifier"),"title":row.get("title"),
                "repository":row.get("repository") or row.get("discovery_repository"),
                "url":row.get("url") or row.get("digital_url"),"date":row.get("date"),
                "creator":row.get("creator"),"evidence_state":row.get('evidence_state') or "DISCOVERED",
                **{k:row.get(k) for k in ('publication_year','fulltext_hit','printed_page','canvas_id','scan_index_0_based','image_url','manifest_url','matched_terms','fulltext_query','reported_page_numbers','locator_status','source_origin') if row.get(k) is not None},
                "context_excerpt":str(row.get('context_excerpt') or row.get('description') or row.get('snippet') or '')[:600],
                "triage_status":assessment.get("status") or "REVIEW_REQUIRED",
                "triage_reasons":assessment.get("reasons") or [],
                "evidence_class":assessment.get("evidence_class"),
                "source_classification":{"category":(assessment.get("evidence_class") or {}).get("category") or "UNCLASSIFIED",
                                         "confirmed":False,
                                         "basis":(assessment.get("evidence_class") or {}).get("basis") or "CONTENT_ASSESSMENT_REQUIRED"},
                "topical_match":assessment.get("topical_match"),
                "research_value":assessment.get("research_value"),
                "evidence_confidence":assessment.get("evidence_confidence"),
                "fallback_for":row.get("fallback_for"),"fallback_reason":row.get("fallback_reason"),
                "verified":False,
            })
        # A named passage is a source reference even when its action/date is
        # unresolved. Publish it as a provisional discovery, never as a claim.
        acquired=read(root/'library_acquisition/acquisition_report.json',{})
        requested_sources={r.get('url') if isinstance(r,dict) else r for r in (request or {}).get('source_leads',[])}
        extracted=read(root/'structured_output/extracted_findings.json',{})
        for finding in extracted.get('findings',[]):
            entity=finding.get('target_entity') or {}
            uncertainty=set(finding.get('uncertainties') or [])
            if not entity.get('observed_names') or entity.get('association_basis')=='ADJACENT_TOPIC_UNRESOLVED':continue
            if uncertainty & {'FICTION_OR_BOOK_REVIEW_CONTEXT','CONFLICTING_GIVEN_NAME','DATE_OUTSIDE_SCOPE'}:continue
            excerpt=finding.get('context_excerpt') or finding.get('evidence_excerpt')
            if not excerpt:continue
            identity_hold=bool(uncertainty & {'EXTENDED_NAME_REQUIRES_IDENTITY_REVIEW','SURNAME_IDENTITY_UNRESOLVED','LATER_NAMESAKE_REQUIRES_IDENTITY_REVIEW'})
            discoveries.append({
                'lane':lane,'identifier':finding.get('identifier') or finding.get('url'),
                'title':finding.get('title'),'repository':finding.get('repository'),
                'url':finding.get('url'),'context_excerpt':excerpt,
                'text_locator':finding.get('locator') or {},'source_type':finding.get('source_type'),
                'reference_kind':'ACQUIRED_TEXT_REFERENCE','finding_id':finding.get('finding_id'),
                'request_source_lead':finding.get('url') in requested_sources,
                'evidence_state':'ACQUIRED','triage_status':'REVIEW_REQUIRED',
                'triage_reasons':list(uncertainty),
                'topical_match':{'category':'CONTEXT_ONLY' if identity_hold else 'POSSIBLE_TARGET',
                                  'reason':'IDENTITY_UNRESOLVED' if identity_hold else 'ACQUIRED_TEXT_MENTION_NOT_EVENT',
                                  'matched_name':entity['observed_names'][0],'identity_verified':False},
                'verified':False,
            })
        for attempt in raw.get("attempts",[]):
            coverage.append({"lane":lane,"repository":attempt.get("repository"),
                "status":attempt.get("status"),"hits":attempt.get("hits",0),
                "queries":[{"query":q.get("query"),"status":q.get("status"),"hits":q.get("hits",0),"detail":q.get("detail")} for q in attempt.get("queries",[])],
                "url":attempt.get("base_url")})
    # One bibliographic source can be discovered by several lanes. Keep its
    # provenance without counting the same record/page/passage repeatedly.
    grouped={};unique=[]
    for row in discoveries:
        ident=str(row.get('identifier') or '')
        url=row.get('url')
        namespace='GLOBAL_OCLC' if ident.startswith('(OCoLC)') else row.get('repository')
        key=(namespace,ident,row.get('canvas_id'),row.get('printed_page'),row.get('context_excerpt')) if ident else ('URL',url,row.get('canvas_id'),row.get('printed_page'),row.get('context_excerpt')) if url else None
        if key is None:
            unique.append(row);continue
        if key in grouped:
            prior=grouped[key]
            if row['lane'] not in prior['contributing_lanes']:prior['contributing_lanes'].append(row['lane'])
            if row.get('repository') not in prior['repositories']:prior['repositories'].append(row.get('repository'))
            continue
        row['contributing_lanes']=[row['lane']]
        row['repositories']=[row.get('repository')]
        grouped[key]=row;unique.append(row)
    unique.sort(key=lambda r:(r.get('reference_kind')!='ACQUIRED_TEXT_REFERENCE',not r.get('request_source_lead',False)))
    return unique,coverage

def request_id_for(run_root:Path):
    for lane in LANE_LABELS:
        data=read(run_root/lane/"research_request_identity.json",{})
        if data.get("request_id"):return data["request_id"]
    return None

def publish_latest(latest:Path,data:dict,payload:str):
    current=str(read(latest,{}).get("run_id", ""))
    incoming=str(data.get("run_id", ""))
    if current.isdigit() and incoming.isdigit() and int(current)>int(incoming):
        return False
    latest.parent.mkdir(parents=True,exist_ok=True)
    latest.write_text(payload,encoding="utf-8")
    return True

def build(repo:Path,run_id:str):
    run_root=repo/"evidence/runs"/run_id
    if not run_root.exists():raise SystemExit("RUN_NOT_FOUND:"+run_id)
    board=read(run_root/"JARVIS_STATE_BOARD.json",{})
    spec=read(repo/"evidence/specialist_runs"/run_id/"SPECIALIST_AGGREGATE.json",{})
    request=research_request(run_root)
    claims=candidate_claims(run_root)
    identity_review=read(run_root/'POST_RUN_IDENTITY_REVIEW.json',{})
    held_ids={r.get('candidate_id') for r in identity_review.get('reviewed_candidates',[]) if r.get('status')=='IDENTITY_REVIEW_REQUIRED'}
    identity_held_claims=[{**c,'identity_status':'REVIEW_REQUIRED'} for c in claims if c.get('candidate_id') in held_ids]
    claims=[c for c in claims if c.get('candidate_id') not in held_ids]
    answers=[{'lane':lane,**answer} for lane in LANE_LABELS if (answer:=read(run_root/lane/'research_dossier/answer.json',{}))]
    semantic_answer=read(run_root/'research_answer/answer.json',{})
    research_validation=read(run_root/'research_answer/validation_report.json',{})
    from research_continuation import latest_analysis
    continuation=latest_analysis(run_root)
    if continuation:semantic_answer,research_validation=continuation
    from research_validation_report import apply_current_geographic_gate
    semantic_answer,research_validation=apply_current_geographic_gate(semantic_answer,research_validation)
    discoveries,coverage=discovery_results(run_root,request)
    request_id=request_id_for(run_root)
    try:from .jarvis_state_board import lane_state
    except ImportError:from jarvis_state_board import lane_state
    agents=[]
    events=specialist_events(repo,run_id)
    blockers=[]

    for row in board.get("lanes",[]) or []:
        lane=row.get("lane")
        if row.get("status")=="NOT_SELECTED":continue
        execution_status=row.get("execution_status") or lane_state(run_root,lane)["execution_status"]
        b=row.get("blockers",[]) or []
        blockers.extend({"agent_id":lane,**x} for x in b if isinstance(x,dict))
        agents.append({
          "id":lane,"label":LANE_LABELS.get(lane,lane),
          "kind":"research_lane","status":execution_status,
          "phase":row.get("status") or row.get("verification_status") or "complete",
          "percent":100,"candidate_events":int(row.get("candidate_events",0) or 0),
          "verified_events":int(row.get("verified_events",0) or 0),
          "record_count":None,"blocker_count":len(b)
        })
        events.append({
          "schema":"pct-command-center-derived-event-v1",
          "event_id":f"{run_id}:{lane}:final","created_utc":board.get("generated_utc"),
          "project":"piratecartography","run_id":run_id,"request_id":request_id,"event_type":"agent_completed" if execution_status=="COMPLETED" else "agent_failed",
          "agent_id":lane,"phase":row.get("status"),"percent":100,"status":execution_status,
          "warnings":[str(x.get("status")) for x in b[:5] if isinstance(x,dict)],
          "detail":f"{row.get('candidate_events',0)} candidate events; {len(b)} blockers"
        })

    contradiction_leads=0
    specialist_records=0
    for row in spec.get("agents",[]) or []:
        aid=row.get("agent_id"); rec=int(row.get("records",0) or 0); specialist_records+=rec
        if aid=="contradiction": contradiction_leads=rec
        b=row.get("blockers",[]) or []
        blockers.extend({"agent_id":aid,**x} for x in b if isinstance(x,dict))
        agents.append({
          "id":aid,"label":row.get("label") or aid,
          "kind":"specialist","status":"COMPLETED","phase":"specialist research complete",
          "percent":100,"candidate_events":None,"verified_events":None,
          "record_count":rec,"search_runs":int(row.get("search_runs",0) or 0),
          "blocker_count":len(b),"requested_outputs":row.get("requested_outputs") or []
        })

    events.sort(key=lambda x:str(x.get("created_utc") or ""))
    summary=board.get("summary") or {}
    lane_statuses=[a['status'] for a in agents if a['kind']=='research_lane']
    mission_status=('UNKNOWN' if not lane_statuses else 'FAILED' if all(v=='FAILED' for v in lane_statuses) else 'PARTIAL' if any(v!='COMPLETED' for v in lane_statuses) else 'COMPLETED')
    execution_status=mission_status
    answer_status=semantic_answer.get('status') or 'NOT_EVALUATED'
    if answer_status.startswith('BLOCKED'):
        mission_status=answer_status
    elif answer_status=='SOURCE_DOSSIER_AVAILABLE':
        mission_status='PARTIAL'
    elif execution_status!='FAILED' and (research_validation.get('status')=='INCOMPLETE' or
          (semantic_answer and answer_status not in ('NOT_EVALUATED','MODEL_ANSWER_PENDING_HUMAN_REVIEW'))):
        mission_status='PARTIAL'
    elif execution_status=='COMPLETED' and not claims:
        mission_status='INSUFFICIENT_EVIDENCE'

    package=build_evidence_package(run_root,request)
    for blocker in blockers:
        failures=provider_failures(blocker.get('detail'))
        if failures:
            blocker['provider_failures']=failures
            labels={'google':'SerpAPI / Google','exa':'Exa'}
            reasons={'BILLING_OR_QUOTA_REQUIRED':'απαιτείται έλεγχος χρέωσης ή διαθέσιμου ορίου λογαριασμού',
                     'RATE_LIMITED_SEARCH_NOT_COMPLETED':'περιορισμός αιτημάτων· η αναζήτηση δεν ολοκληρώθηκε',
                     'PROVIDER_SEARCH_NOT_COMPLETED':'η αναζήτηση δεν ολοκληρώθηκε'}
            blocker['description']=' · '.join(labels.get(f['provider'],str(f['provider']))+': '+reasons[f['meaning']] for f in failures)
    semantic_claims={c['claim_id']:c for c in semantic_answer.get('claims',[]) if c.get('claim_id')}
    contradiction_records=[]
    for index,conflict in enumerate((semantic_answer.get('review') or {}).get('contradictions') or []):
        ids=list(dict.fromkeys(conflict.get('claim_ids') or []))
        if len(ids)<2 or any(cid not in semantic_claims for cid in ids):continue
        contradiction_records.append({'identifier':f'{run_id}:conflict:{index}',
                                      'title':conflict.get('explanation'),'status':'MODEL_FLAGGED_NOT_ADJUDICATED',
                                      'claims':[semantic_claims[cid] for cid in ids],'verified':False})
    passage_lookup={p['passage_id']:p for p in package['passages']}
    source_lookup={s['source_id']:s for s in package['sources']}
    for row in discoveries:
        passage=passage_lookup.get(row.get('lane','')+':'+str(row.get('finding_id')))
        if passage:
            row['evidence_record']={k:v for k,v in passage.items() if k!='acquired_text_excerpt'}
            row['bibliography']=source_lookup.get(passage['source_id'],{}).get('bibliography')
            package_class=source_lookup.get(passage['source_id'],{}).get('classification') or {}
            current=row.get('source_classification') or {}
            # A search hypothesis stays visible. An explicit source class still
            # replaces an unclassified discovery label.
            if current.get('category')!='SEARCH_HYPOTHESIS' and package_class.get('category') not in (None,'UNCLASSIFIED'):
                row['source_classification']=package_class
            elif current.get('category') in (None,'UNCLASSIFIED') and package_class:
                row['source_classification']=package_class
    return {
      "schema":"pct-command-center-live-v1",
      "project":"piratecartography","run_id":run_id,"request_id":request_id,
      "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "source":"DURABLE_GITHUB_EVIDENCE",
      "live_transport":"SNAPSHOT_BASELINE",
      "mission":{
        "target":request.get("target") or "Unknown target",
        "aliases":request.get("aliases") or [],
        "date_range":request.get("date_range") or "",
        "purpose":request.get("purpose") or "Historical research operation",
        "research_focus":identity(request,request)['focus'] if request.get('target') else None,
        "status":mission_status,
        "execution_status":execution_status,
        "answer_status":answer_status,
        "research_validation_status":research_validation.get('status','NOT_EVALUATED'),
        "research_validation_blockers":research_validation.get('blockers',[]),
        "selected_lanes":int(summary.get("selected_lanes",len([a for a in agents if a["kind"]=="research_lane"])) or 0)
      },
      "metrics":{
        "agents":len(agents),
        "candidate_claims":len(claims),
        "retained_discoveries":len(discoveries),
        "repositories_attempted":len(coverage),
        "verified_events":sum(1 for c in claims if c.get("verified")),
        "specialist_discovery_records":specialist_records,
        "contradiction_search_records":contradiction_leads,
        "blocked_agents":sum(1 for a in agents if a.get("blocker_count",0)>0),
        "blocker_records":len(blockers)
      },
      "agents":agents,
      "claims":claims[:500],
      "post_run_identity_review":identity_review,
      "identity_held_claims":identity_held_claims,
      "research_answer":semantic_answer or {'status':'PROVISIONAL_SOURCE_FINDINGS' if any(a.get('findings') for a in answers) else 'INSUFFICIENT_ACQUIRED_EVIDENCE',
                         'lanes':answers,'verified_claims':0,'rule':'Source-attributed findings are not verified historical conclusions.'},
      "discoveries":discoveries,
      "coverage":coverage,
      "evidence_package":package,
      "evidence_url":f"https://github.com/Lepe12/geraki-historical-atlas/tree/main/evidence/runs/{run_id}",
      "contradictions":{
        "status":"MODEL_REVIEW_PENDING" if contradiction_records else "SEARCH_OUTPUT_NOT_ADJUDICATED",
        "records":contradiction_records,
        "search_records":contradiction_leads,
        "note":"Contradiction specialist records are research leads, not verified contradictions."
      },
      "blockers":blockers[:500],
      "events":events[-600:],
      "safety":{
        "automatic_verified":False,
        "human_review_required":True,
        "rule":"Operational live data never promotes a historical claim."
      }
    }

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--repo",default=".");p.add_argument("--run-id",required=True)
    p.add_argument("--output",required=True);p.add_argument("--latest")
    a=p.parse_args();repo=Path(a.repo).resolve();data=build(repo,str(a.run_id))
    out=repo/a.output;out.parent.mkdir(parents=True,exist_ok=True)
    payload=json.dumps(data,ensure_ascii=False,indent=2)+"\n";out.write_text(payload,encoding="utf-8")
    if a.latest:
        publish_latest(repo/a.latest,data,payload)
    from build_research_history import build_history
    if out.parent.name == "runs":
        (out.parent.parent/"index.json").write_text(json.dumps(build_history(out.parent.parent),ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("COMMAND CENTER SNAPSHOT",data["run_id"],"agents",data["metrics"]["agents"],"claims",data["metrics"]["candidate_claims"],"specialist records",data["metrics"]["specialist_discovery_records"])
