#!/usr/bin/env python3
"""Evaluate a durable Agent Piracy run against a curated historical benchmark case."""
import argparse,json,pathlib,sys
p=argparse.ArgumentParser();p.add_argument("--run-id",required=True);p.add_argument("--case-id",required=True);p.add_argument("--benchmark",default="benchmarks/historical_benchmark_v1.json");a=p.parse_args()
bench=json.loads(pathlib.Path(a.benchmark).read_text(encoding="utf-8"))
case=next((x for x in bench["cases"] if x["id"]==a.case_id),None)
if not case: raise SystemExit("BENCHMARK_CASE_NOT_FOUND")
root=pathlib.Path("evidence/runs")/a.run_id
lanes=["travellers","spanish_simancas","venetian","french","british","dutch","german","italian_states","ottoman","north_african"]
events=[];repos=[];missing=[]
for lane in lanes:
    ep=root/lane/"structured_output"/"candidate_events.json"
    hp=root/lane/"system_health"/"lane_health.json"
    if not ep.exists(): missing.append(lane)
    else:
        d=json.loads(ep.read_text(encoding="utf-8"));events += [dict(x,_lane=lane) for x in d.get("events",[])]
    if hp.exists():
        h=json.loads(hp.read_text(encoding="utf-8"));repos += [{"lane":lane,"executed":h.get("repositories_executed",[]),"blocked":h.get("repository_blockers",[])}]
expected_positive=bool(case.get("label"))
detected=bool(events)
year=case.get("expected_year")
date_hits=[e for e in events if year and (e.get("date",{}).get("normalized_year")==year or year in (e.get("date",{}).get("normalized_range") or []))]
entity=case.get("expected_entity")
entity_hits=[e for e in events if not entity or entity.casefold() in json.dumps(e,ensure_ascii=False).casefold()]
tp=1 if expected_positive and detected else 0
fn=1 if expected_positive and not detected else 0
fp=1 if (not expected_positive) and detected else 0
tn=1 if (not expected_positive) and not detected else 0
expected_source=str(case.get("source_repository") or "")
coverage_blockers=[]
for rr in repos:
    for b in rr.get("blocked",[]):
        name=str(b.get("repository") or "")
        if ("SearchCulture" in expected_source and "SearchCulture" in name) or (expected_source and expected_source.casefold() in name.casefold()):
            coverage_blockers.append({"lane":rr["lane"],**b})
report={
 "schema":"agent-piracy-live-benchmark-result-v1","run_id":a.run_id,"case_id":a.case_id,
 "benchmark_tier":case.get("tier"),"expected_positive":expected_positive,"detected_any_candidate":detected,
 "candidate_count":len(events),"true_positive":tp,"false_negative":fn,"false_positive":fp,"true_negative":tn,
 "date_match_count":len(date_hits),"entity_match_count":len(entity_hits) if entity else None,
 "precision":(tp/(tp+fp)) if (tp+fp) else None,
 "recall":(tp/(tp+fn)) if (tp+fn) else None,
 "false_positive_rate":(fp/(fp+tn)) if (fp+tn) else None,
 "date_error":bool(expected_positive and detected and year and not date_hits),
 "entity_error":bool(expected_positive and detected and entity and not entity_hits),
 "unsupported_claim_rate":0.0 if not any(e.get("verified") for e in events) else None,
 "missing_lane_outputs":missing,"repository_execution":repos,"coverage_blockers":coverage_blockers,"false_negative_due_to_coverage_blocker":bool(fn and coverage_blockers),
 "interpretation":"A false negative is a measurable coverage/retrieval gap, not permission to invent a finding. REFERENCE_GOLD tests retrieval/classification only unless human_reviewed_original is true."
}
out=pathlib.Path("benchmarks/results");out.mkdir(parents=True,exist_ok=True)
dest=out/f"{a.run_id}-{a.case_id}.json";dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(report,ensure_ascii=False,indent=2))
