#!/usr/bin/env python3
"""Evaluate a durable Agent Piracy run against one curated benchmark case."""
import argparse,json,pathlib,re,unicodedata

p=argparse.ArgumentParser()
p.add_argument("--run-id",required=True)
p.add_argument("--case-id",required=True)
p.add_argument("--benchmark",default="benchmarks/historical_benchmark_v1.json")
a=p.parse_args()

bench=json.loads(pathlib.Path(a.benchmark).read_text(encoding="utf-8"))
case=next((x for x in bench["cases"] if x["id"]==a.case_id),None)
if not case: raise SystemExit("BENCHMARK_CASE_NOT_FOUND")

root=pathlib.Path("evidence/runs")/a.run_id
lanes=["travellers","spanish_simancas","venetian","french","british","dutch","german","italian_states","ottoman","north_african"]
events=[];repos=[];missing=[]
for lane in lanes:
    ep=root/lane/"structured_output"/"candidate_events.json"
    hp=root/lane/"system_health"/"lane_health.json"
    if not ep.exists():
        missing.append(lane)
    else:
        d=json.loads(ep.read_text(encoding="utf-8"))
        events += [dict(x,_lane=lane) for x in d.get("events",[])]
    if hp.exists():
        h=json.loads(hp.read_text(encoding="utf-8"))
        repos.append({"lane":lane,"executed":h.get("repositories_executed",[]),"blocked":h.get("repository_blockers",[])})

expected_positive=bool(case.get("label"))
year=case.get("expected_year")
entity=case.get("expected_entity")
place=case.get("expected_place")
family=case.get("expected_event_family")
required_terms=case.get("expected_required_terms") or []

def norm_text(s):
    s=unicodedata.normalize("NFKD",str(s))
    return "".join(ch for ch in s if not unicodedata.combining(ch)).casefold()

def blob(e):
    return norm_text(json.dumps(e,ensure_ascii=False))

def evidence_blob(e):
    fields=[
      e.get("context_excerpt"),
      e.get("title"),
      e.get("original_quote"),
      e.get("controlled_transcription"),
      e.get("source_says")
    ]
    return norm_text(re.sub(r"https?://\S+", "", " ".join(str(x) for x in fields if x)))

def date_match(e):
    if not year:return True
    # Only contextual source prose. URLs, filenames and assigned dates cannot match.
    context=" ".join(str(e.get(k) or "") for k in ("context_excerpt","original_quote","controlled_transcription","source_says"))
    context=re.sub(r"https?://\S+", "", context)
    return bool(re.search(r"(?<!\d)"+re.escape(str(year))+r"(?!\d)", context))

def term_match(e,needle):
    # Match only source-derived/context fields, never canonical labels that the
    # pipeline itself assigned from request aliases.
    return norm_text(needle) in evidence_blob(e)

def family_match(e):
    if not family or family in ("NONE","UNKNOWN"):return True
    b=evidence_blob(e)
    if family=="ATTACK_OR_SACK":
        return any(x in b for x in ["attack","attaque","ataque","attacc","raid","sack","saccag","saque","pillage","plunder"])
    if family=="ATTACK_OR_CAPTURE":
        return any(x in b for x in ["attack","attaque","ataque","attacc","captur","cattur","seiz","sack","raid"])
    if family=="RANSOM_OR_CAPTIVITY":
        return any(x in b for x in ["ransom","rançon","riscatt","rescat","captiv","prison","slave","enslav"])
    if family=="CORSAIR_OPERATION":
        return any(x in b for x in ["corsair","corsaire","corsar","reis","raïs","pirat","privateer"])
    if family=="CAPTURE":
        return any(x in b for x in ["captur","cattur","καταληψ","αιχμαλω","seiz","prison","presa","prise"])
    if family=="NAVAL_BATTLE":
        return any(x in b for x in ["battle","bataill","combat","victoire","victory","naval"])
    if family=="BOMBARDMENT":
        return any(x in b for x in ["bombard","bombarde","bombas","attack","attaque","atac"])
    if family=="CAPTIVITY_OR_REDEMPTION":
        return any(x in b for x in ["captiv","cautiv","prison","redencion","redemption","redeem","rescat","rancon","ransom"])
    if family=="PRESENCE_ONLY":
        return any(x in b for x in ["presence","reported offshore","galley","galleys","galera","galeras","corsair vessel","vessel"])
    if family=="DEPENDENT_SOURCES":
        return "derivative" in b or "common_source" in b
    if family=="STATE_NAVAL_ACTION_NOT_PIRATE":
        return False
    return True

matched=[]
for e in events:
    if entity and not term_match(e,entity):continue
    if place and not term_match(e,place):continue
    if not date_match(e):continue
    if not family_match(e):continue
    if any(not term_match(e,t) for t in required_terms):continue
    matched.append(e)

detected_any=bool(events)
case_detected=bool(matched)

def source_key(e):
    ident=e.get("identifier")
    url=e.get("url")
    src=e.get("source_file")
    title=e.get("title")
    if ident:return ("identifier",str(ident))
    if url:return ("url",str(url))
    if src:return ("source_file",str(src))
    return ("title",str(title))

matched_sources={}
for e in matched:
    matched_sources.setdefault(source_key(e),e)

tp=1 if expected_positive and case_detected else 0
fn=1 if expected_positive and not case_detected else 0
if not expected_positive and family=="STATE_NAVAL_ACTION_NOT_PIRATE":
    prohibited=[e for e in events if str(e.get("event_type") or "").upper()=="PIRATE_ATTACK"]
    fp=1 if prohibited else 0
    tn=0 if prohibited else 1
elif not expected_positive:
    fp=1 if detected_any else 0
    tn=1 if not detected_any else 0
else:
    fp=0;tn=0

expected_source=str(case.get("source_repository") or "")
coverage_blockers=[]
for rr in repos:
    for b in rr.get("blocked",[]):
        name=str(b.get("repository") or "")
        if ("SearchCulture" in expected_source and "SearchCulture" in name) or (expected_source and expected_source.casefold() in name.casefold()):
            coverage_blockers.append({"lane":rr["lane"],**b})
surface_gap=case.get("known_discovery_surface_gap")
if fn and surface_gap:
    coverage_blockers.append({"lane":"benchmark_case","repository":surface_gap.get("repository"),"status":surface_gap.get("status"),"detail":surface_gap.get("basis")})

report={
 "schema":"agent-piracy-live-benchmark-result-v3",
 "run_id":a.run_id,"case_id":a.case_id,"benchmark_tier":case.get("tier"),
 "expected_positive":expected_positive,
 "detected_any_candidate":detected_any,
 "matched_case_candidate":case_detected,
 "candidate_count":len(events),"matched_candidate_count":len(matched),"matched_unique_source_count":len(matched_sources),
 "true_positive":tp,"false_negative":fn,"false_positive":fp,"true_negative":tn,
 "case_detection_precision":(tp/(tp+fp)) if (tp+fp) else None,
 "precision":None,
 "precision_status":"UNMEASURED_REQUIRES_CANDIDATE_LEVEL_HUMAN_LABELS",
 "unmatched_candidate_count":len(events)-len(matched),
 "coverage_complete":not missing,
 "recall":(tp/(tp+fn)) if (tp+fn) else None,
 "false_positive_rate":(fp/(fp+tn)) if (fp+tn) else None,
 "date_error":bool(expected_positive and any(term_match(e,entity) if entity else True for e in events) and year and not any(date_match(e) for e in events)),
 "entity_error":bool(expected_positive and entity and events and not any(term_match(e,entity) for e in events)),
 "place_error":bool(expected_positive and place and events and not any(term_match(e,place) for e in events)),
 "classification_error":bool((not expected_positive) and family=="STATE_NAVAL_ACTION_NOT_PIRATE" and fp),
 "required_terms_error":bool(expected_positive and required_terms and events and not any(all(term_match(e,t) for t in required_terms) for e in events)),
 "unsupported_claim_rate":None,
 "unsupported_claim_rate_status":"UNMEASURED",
 "missing_lane_outputs":missing,
 "repository_execution":repos,
 "coverage_blockers":coverage_blockers,
 "false_negative_due_to_coverage_blocker":bool(fn and coverage_blockers),
 "matched_candidates":[{"lane":e.get("_lane"),"candidate_id":e.get("candidate_id"),"source_type":e.get("source_type"),"date":e.get("date")} for e in matched[:50]],
 "matched_sources":[{"lane":e.get("_lane"),"repository":e.get("repository"),"identifier":e.get("identifier"),"source_file":e.get("source_file"),"url":e.get("url"),"title":e.get("title")} for e in matched_sources.values()],
 "interpretation":"A positive benchmark requires the case-specific entity/place/date/event signature, not merely any candidate. REFERENCE_GOLD tests retrieval/classification only unless human_reviewed_original is true."
}
out=pathlib.Path("benchmarks/results");out.mkdir(parents=True,exist_ok=True)
dest=out/f"{a.run_id}-{a.case_id}.json"
dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(report,ensure_ascii=False,indent=2))
