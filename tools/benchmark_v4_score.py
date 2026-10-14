#!/usr/bin/env python3
"""Score Historical Benchmark v4 with dual-human review and adjudication."""
from __future__ import annotations
import argparse,collections,datetime,json,math
from pathlib import Path

REL={"RELEVANT","OFF_TARGET","INSUFFICIENT_CONTEXT"}
QUAL={"PRIMARY_ORIGINAL","PRIMARY_FACSIMILE","PRIMARY_DERIVATIVE","SECONDARY","METADATA_ONLY","UNKNOWN"}
LOC={"CORRECT","INCORRECT","NOT_APPLICABLE","UNVERIFIABLE"}
GEN={"CORRECT","INCORRECT","NOT_ASSESSED","UNVERIFIABLE"}
CON={"DETECTED","MISSED","NOT_APPLICABLE","UNVERIFIABLE"}
SUP={"SUPPORTED","UNSUPPORTED","OVERSTATED","NOT_A_CLAIM","UNVERIFIABLE"}
RET={"DETECTED","MISSED","CORRECT_NEGATIVE","FALSE_POSITIVE","NOT_SCORABLE"}
ABS={"CORRECT_ABSTENTION","SHOULD_HAVE_ABSTAINED","INCORRECT_ABSTENTION","NOT_APPLICABLE","UNVERIFIABLE"}

def read(p):return json.loads(Path(p).read_text(encoding="utf-8"))

def valid_time(v):
    if not isinstance(v,str) or not v.strip():return False
    try:return datetime.datetime.fromisoformat(v.replace("Z","+00:00")).tzinfo is not None
    except ValueError:return False

def ratio(n,d):return (n/d) if d else None

def agreement_pairs(a,b,key):
    common=sorted(set(a)&set(b));pairs=[]
    for uid in common:
        va=a[uid].get(key);vb=b[uid].get(key)
        if va is not None and vb is not None:pairs.append((va,vb))
    return pairs

def raw_agreement(pairs):
    return ratio(sum(1 for a,b in pairs if a==b),len(pairs))

def cohens_kappa(pairs):
    if not pairs:return None
    po=raw_agreement(pairs)
    aa=collections.Counter(a for a,_ in pairs);bb=collections.Counter(b for _,b in pairs)
    n=len(pairs);labels=set(aa)|set(bb)
    pe=sum((aa[x]/n)*(bb[x]/n) for x in labels)
    if math.isclose(1-pe,0):return 1.0 if math.isclose(po,1) else None
    return (po-pe)/(1-pe)

def valid_reviewer(r,candidates,cases):
    reasons=[];items={};case_items={}
    rid=str(r.get("reviewer_id") or "").strip()
    if r.get("reviewer_type")!="HUMAN":reasons.append("REVIEWER_NOT_HUMAN")
    if r.get("independent") is not True:reasons.append("REVIEWER_NOT_INDEPENDENT")
    if r.get("review_status")!="FINAL":reasons.append("REVIEW_NOT_FINAL")
    if not rid:reasons.append("REVIEWER_ID_MISSING")
    if not valid_time(r.get("reviewed_utc")):reasons.append("INVALID_REVIEW_TIME")
    for i,x in enumerate(r.get("items",[]) or []):
        uid=x.get("candidate_uid");reason=None
        if uid not in candidates:reason="CANDIDATE_NOT_IN_MANIFEST"
        elif x.get("candidate_evidence_sha256")!=candidates[uid].get("candidate_evidence_sha256"):reason="CANDIDATE_HASH_MISMATCH"
        elif x.get("relevance_label") not in REL:reason="INVALID_RELEVANCE"
        elif x.get("evidence_quality_label") not in QUAL:reason="INVALID_QUALITY"
        elif x.get("locator_accuracy") not in LOC:reason="INVALID_LOCATOR"
        elif x.get("genealogy_accuracy") not in GEN:reason="INVALID_GENEALOGY"
        elif x.get("contradiction_detection") not in CON:reason="INVALID_CONTRADICTION"
        elif x.get("claim_support") not in SUP:reason="INVALID_CLAIM_SUPPORT"
        elif uid in items:reason="DUPLICATE_CANDIDATE_LABEL"
        if reason:reasons.append(f"ITEM_{i}:{reason}")
        else:items[uid]=x
    for i,x in enumerate(r.get("cases",[]) or []):
        cid=x.get("case_id");reason=None
        if cid not in cases:reason="CASE_NOT_IN_MANIFEST"
        elif x.get("retrieval_outcome") not in RET:reason="INVALID_RETRIEVAL_OUTCOME"
        elif x.get("abstention_quality") not in ABS:reason="INVALID_ABSTENTION"
        elif cid in case_items:reason="DUPLICATE_CASE_LABEL"
        if reason:reasons.append(f"CASE_{i}:{reason}")
        else:case_items[cid]=x
    return {"valid":not reasons,"reviewer_id":rid,"items":items,"cases":case_items,"reasons":reasons}

def score(manifest,labels):
    cases={x["case_id"]:x for x in manifest.get("cases",[])}
    candidates={x["candidate_uid"]:x for x in manifest.get("candidates",[])}
    eligible_cases={cid for cid,x in cases.items() if x.get("eligible_for_official_metrics")}
    reviewers=labels.get("reviewers",[]) or []
    reviewed=[valid_reviewer(r,candidates,cases) for r in reviewers[:2]]
    reviewers_valid=(len(reviewed)>=2 and all(x["valid"] for x in reviewed) and reviewed[0]["reviewer_id"]!=reviewed[1]["reviewer_id"])
    agreement={"paired_candidate_count":0,"relevance_raw_agreement":None,"relevance_cohens_kappa":None}
    if reviewers_valid:
        pairs=agreement_pairs(reviewed[0]["items"],reviewed[1]["items"],"relevance_label")
        agreement={"paired_candidate_count":len(pairs),"relevance_raw_agreement":raw_agreement(pairs),"relevance_cohens_kappa":cohens_kappa(pairs)}

    adj=labels.get("adjudication") or {};adj_reasons=[];official_items={};official_cases={}
    aid=str(adj.get("adjudicator_id") or "").strip()
    if adj.get("reviewer_type")!="HUMAN":adj_reasons.append("ADJUDICATOR_NOT_HUMAN")
    if adj.get("review_status")!="FINAL":adj_reasons.append("ADJUDICATION_NOT_FINAL")
    if not aid:adj_reasons.append("ADJUDICATOR_ID_MISSING")
    if not valid_time(adj.get("reviewed_utc")):adj_reasons.append("INVALID_ADJUDICATION_TIME")
    if reviewers_valid and aid in {reviewed[0]["reviewer_id"],reviewed[1]["reviewer_id"]}:adj_reasons.append("ADJUDICATOR_NOT_DISTINCT")
    for i,x in enumerate(adj.get("items",[]) or []):
        uid=x.get("candidate_uid");reason=None
        if uid not in candidates:reason="CANDIDATE_NOT_IN_MANIFEST"
        elif candidates[uid].get("case_id") not in eligible_cases:reason="CASE_NOT_OFFICIAL_ELIGIBLE"
        elif x.get("candidate_evidence_sha256")!=candidates[uid].get("candidate_evidence_sha256"):reason="CANDIDATE_HASH_MISMATCH"
        elif not reviewers_valid or uid not in reviewed[0]["items"] or uid not in reviewed[1]["items"]:reason="MISSING_TWO_REVIEWER_LABELS"
        elif x.get("relevance_label") not in REL:reason="INVALID_RELEVANCE"
        elif x.get("evidence_quality_label") not in QUAL:reason="INVALID_QUALITY"
        elif x.get("locator_accuracy") not in LOC:reason="INVALID_LOCATOR"
        elif x.get("genealogy_accuracy") not in GEN:reason="INVALID_GENEALOGY"
        elif x.get("contradiction_detection") not in CON:reason="INVALID_CONTRADICTION"
        elif x.get("claim_support") not in SUP:reason="INVALID_CLAIM_SUPPORT"
        elif uid in official_items:reason="DUPLICATE_ADJUDICATED_ITEM"
        if reason:adj_reasons.append(f"ITEM_{i}:{reason}")
        else:official_items[uid]=x
    for i,x in enumerate(adj.get("cases",[]) or []):
        cid=x.get("case_id");reason=None
        if cid not in eligible_cases:reason="CASE_NOT_OFFICIAL_ELIGIBLE"
        elif not reviewers_valid or cid not in reviewed[0]["cases"] or cid not in reviewed[1]["cases"]:reason="MISSING_TWO_REVIEWER_CASE_LABELS"
        elif x.get("retrieval_outcome") not in RET:reason="INVALID_RETRIEVAL_OUTCOME"
        elif x.get("abstention_quality") not in ABS:reason="INVALID_ABSTENTION"
        elif cid in official_cases:reason="DUPLICATE_ADJUDICATED_CASE"
        if reason:adj_reasons.append(f"CASE_{i}:{reason}")
        else:official_cases[cid]=x
    adjudication_valid=reviewers_valid and not adj_reasons

    rel=collections.Counter(x["relevance_label"] for x in official_items.values())
    candidate_precision=ratio(rel["RELEVANT"],sum(rel.values()))

    support=[x["claim_support"] for x in official_items.values() if x["claim_support"] in {"SUPPORTED","UNSUPPORTED","OVERSTATED"}]
    unsupported_claim_rate=ratio(sum(x in {"UNSUPPORTED","OVERSTATED"} for x in support),len(support))
    loc=[x["locator_accuracy"] for x in official_items.values() if x["locator_accuracy"] in {"CORRECT","INCORRECT"}]
    locator_accuracy=ratio(sum(x=="CORRECT" for x in loc),len(loc))
    gen=[x["genealogy_accuracy"] for x in official_items.values() if x["genealogy_accuracy"] in {"CORRECT","INCORRECT"}]
    genealogy_accuracy=ratio(sum(x=="CORRECT" for x in gen),len(gen))
    con=[x["contradiction_detection"] for x in official_items.values() if x["contradiction_detection"] in {"DETECTED","MISSED"}]
    contradiction_rate=ratio(sum(x=="DETECTED" for x in con),len(con))

    pos=[];neg=[]
    for cid,x in official_cases.items():
        ctype=cases[cid].get("case_type","")
        if ctype=="POSITIVE_REFERENCE":pos.append(x["retrieval_outcome"])
        elif ctype.startswith("NEGATIVE_"):neg.append(x["retrieval_outcome"])
    recall=ratio(sum(x=="DETECTED" for x in pos),sum(x in {"DETECTED","MISSED"} for x in pos))
    specificity=ratio(sum(x=="CORRECT_NEGATIVE" for x in neg),sum(x in {"CORRECT_NEGATIVE","FALSE_POSITIVE"} for x in neg))
    abst=[x["abstention_quality"] for x in official_cases.values() if x["abstention_quality"] in {"CORRECT_ABSTENTION","SHOULD_HAVE_ABSTAINED","INCORRECT_ABSTENTION"}]
    abstention_accuracy=ratio(sum(x=="CORRECT_ABSTENTION" for x in abst),len(abst))

    if manifest.get("official_eligible_case_count",0)==0:
        status="WAITING_FOR_FRESH_BLIND_RUNS"
    elif not reviewers_valid:
        status="WAITING_FOR_DUAL_HUMAN_REVIEW"
    elif not adjudication_valid:
        status="WAITING_FOR_ADJUDICATION"
    else:
        status="VALID"
    return {
      "schema":"pct-benchmark-v4-summary-v1","metrics_status":status,
      "official_engine_commit":manifest.get("official_engine_commit"),
      "official_eligible_case_count":manifest.get("official_eligible_case_count",0),
      "official_adjudicated_candidate_count":len(official_items),
      "official_adjudicated_case_count":len(official_cases),
      "candidate_precision":candidate_precision,
      "reference_case_recall":recall,
      "negative_control_specificity":specificity,
      "unsupported_claim_rate":unsupported_claim_rate,
      "exact_locator_accuracy":locator_accuracy,
      "source_genealogy_accuracy":genealogy_accuracy,
      "contradiction_detection_rate":contradiction_rate,
      "abstention_quality_accuracy":abstention_accuracy,
      "inter_reviewer_agreement":agreement,
      "reviewer_validation":[{"reviewer_id":x["reviewer_id"],"valid":x["valid"],"reasons":x["reasons"]} for x in reviewed],
      "adjudication_valid":adjudication_valid,
      "adjudication_rejections":adj_reasons,
      "rules":[
        "Null metrics mean the required scientific evidence or human adjudication is absent.",
        "No AI/provisional labels enter official performance metrics.",
        "Research Value and Evidence Confidence are system metadata, not ground truth."
      ]
    }

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--manifest",default="benchmarks/v4/CURRENT_MANIFEST.json")
    p.add_argument("--labels",default="benchmarks/v4/labels/HUMAN_LABELS.json")
    p.add_argument("--output",default="benchmarks/v4/results/SUMMARY.json")
    a=p.parse_args();out=score(read(a.manifest),read(a.labels))
    dest=Path(a.output);dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(out,ensure_ascii=False,indent=2))
