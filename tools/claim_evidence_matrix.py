#!/usr/bin/env python3
"""Build a conservative claim-evidence matrix from preserved candidate records."""
from __future__ import annotations
import argparse, datetime, hashlib, json
from pathlib import Path

def read(path: Path, default=None):
    if not path.exists():
        return {} if default is None else default
    return json.loads(path.read_text(encoding="utf-8"))

def source_key(c: dict) -> str:
    raw = str(c.get("identifier") or c.get("url") or c.get("source_file") or c.get("candidate_id") or "")
    return hashlib.sha256(raw.encode("utf-8", "ignore")).hexdigest()[:20]

def exact_locators(c: dict):
    out = []
    for p in c.get("exact_page_candidates", []) or []:
        if p.get("printed_page") is not None and (p.get("leaf") is not None or p.get("canvas_id") or p.get("image_file")):
            out.append({
                "identifier": p.get("identifier"),
                "printed_page": p.get("printed_page"),
                "leaf": p.get("leaf"),
                "canvas_id": p.get("canvas_id"),
                "image_file": p.get("image_file"),
            })
    return out

def claim_text(c: dict) -> str:
    says = str(c.get("source_says") or "").strip()
    if says:
        return says
    quote = str(c.get("controlled_transcription") or c.get("original_quote") or "").strip()
    if quote:
        return quote
    excerpt = str(c.get("context_excerpt") or "").strip()
    return excerpt[:1200] if excerpt else ""

def build_lane(base: Path, lane: str):
    candidates = read(base / "structured_output" / "candidate_events.json", {}).get("events", []) or []
    corroboration = read(base / "corroboration" / "corroboration_queue.json", {})
    support_map = {x.get("candidate_id"): x for x in corroboration.get("candidate_events", []) or []}
    genealogy = read(base / "source_genealogy" / "genealogy_queue.json", {})
    genealogy_sources = genealogy.get("sources", []) or []
    human = read(base / "human_review" / "review_queue.json", {})
    review_map = {x.get("candidate_id"): x for x in human.get("items", []) or []}
    claims = []

    for c in candidates:
        cid = c.get("candidate_id")
        support = support_map.get(cid, {})
        review = review_map.get(cid, {})
        skey = source_key(c)
        locators = exact_locators(c)
        support_items = []

        if c.get("source_says") or c.get("controlled_transcription") or c.get("original_quote"):
            support_items.append({
                "evidence_kind": "DIRECT_EXTRACT",
                "source_key": skey,
                "source_type": c.get("source_type"),
                "locator_status": "EXACT" if locators else "UNRESOLVED",
                "locators": locators,
                "text": c.get("source_says") or c.get("controlled_transcription") or c.get("original_quote"),
                "original_inspected": bool(c.get("original_inspected")),
            })
        elif c.get('acquired_text_excerpt') and c.get('text_locator'):
            support_items.append({
                'evidence_kind':'ACQUIRED_TEXT_EXCERPT','source_key':skey,
                'source_type':c.get('source_type'),'text':c['acquired_text_excerpt'],
                'locator_status':'ACQUIRED_TEXT_RANGE','text_locator':c['text_locator'],
                'original_inspected':False,'warning':'Acquired-text extraction; not a controlled original transcription.'
            })
        elif c.get("context_excerpt"):
            support_items.append({
                "evidence_kind": "DISCOVERY_CONTEXT_ONLY",
                "source_key": skey,
                "source_type": c.get("source_type"),
                "locator_status": "EXACT" if locators else "UNRESOLVED",
                "locators": locators,
                "text": c.get("context_excerpt"),
                "original_inspected": bool(c.get("original_inspected")),
                "warning": "Discovery/OCR context is not an exact historical quotation."
            })

        claim_trail = [
            {"stage":"DISCOVERY","status":"PRESENT" if (c.get("context_excerpt") or c.get("title") or c.get("source_file")) else "MISSING",
             "source_file":c.get("source_file"),"repository":c.get("repository"),"identifier":c.get("identifier"),"url":c.get("url")},
            {"stage":"EXACT_LOCATOR","status":"EXACT" if locators else "UNRESOLVED","locators":locators},
            {"stage":"ORIGINAL_INSPECTION","status":"COMPLETED" if c.get("original_inspected") else "PENDING"},
            {"stage":"CONTROLLED_EXTRACTION","status":"COMPLETED" if (c.get("source_says") or c.get("controlled_transcription") or c.get("original_quote")) else "PENDING"},
            {"stage":"SOURCE_GENEALOGY","status":"ASSESSED" if c.get("genealogy_checked") else "PENDING","evidence":c.get("genealogy_evidence",[])},
            {"stage":"CORROBORATION","status":"ASSESSED" if c.get("corroborated") else "PENDING","independent_supporting_chains":support.get("independent_supporting_chains",[]) or []},
            {"stage":"CONTRADICTION_SEARCH","status":"NOT_ASSESSED"},
            {"stage":"HUMAN_REVIEW","status":review.get("review_status") or "NOT_REVIEWED"},
            {"stage":"FINAL_VERIFICATION","status":"VERIFIED" if c.get("verified") else "PENDING"}
        ]

        claims.append({
            "claim_id": "claim-" + str(cid),
            "candidate_id": cid,
            "lane": lane,
            "claim_text": claim_text(c),
            "research_value": c.get("research_value"),
            "evidence_confidence": c.get("evidence_confidence"),
            "retention": c.get("retention"),
            "claim_trail": claim_trail,
            "researcher_inference": c.get("researcher_inference"),
            'extraction_method':c.get('extraction_method'),
            'extraction_uncertainties':c.get('extraction_uncertainties',[]),
            "claim_scope": {
                "event_type": c.get("event_type"),
                "actor": c.get("actor"),
                "place": c.get("place"),
                "date": c.get("date"),
            },
            "supporting_evidence": support_items,
            "contradicting_evidence": [],
            "contradiction_search_status": "NOT_ASSESSED",
            "independent_supporting_chains": support.get("independent_supporting_chains", []) or [],
            "source_genealogy_status": "ASSESSED" if c.get("genealogy_checked") else "PENDING",
            "source_genealogy_evidence": c.get("genealogy_evidence", []),
            "genealogy_queue_sources": len(genealogy_sources),
            "uncertainties": [x for x in [
                None if c.get("original_inspected") else "ORIGINAL_NOT_INSPECTED",
                None if locators else "EXACT_LOCATOR_UNRESOLVED",
                None if c.get("extracted") else "CONTROLLED_EXTRACTION_MISSING",
                None if c.get("genealogy_checked") else "SOURCE_GENEALOGY_PENDING",
                None if c.get("corroborated") else "INDEPENDENT_CORROBORATION_NOT_ESTABLISHED",
                None if review.get("review_status") not in (None, "NOT_REVIEWED") else "HUMAN_REVIEW_PENDING",
            ] if x],
            "confirmation_requirements": [
                "Inspect the original page/folio or authoritative facsimile.",
                "Record an exact locator and controlled transcription.",
                "Assess source genealogy before counting corroboration as independent.",
                "Search deliberately for contradicting evidence.",
                "Record limitations and claim scope before final verification."
            ],
            "falsification_targets": [
                "A primary or demonstrably independent contemporary source that directly contradicts the claim.",
                "Evidence that the cited source refers to a different person, place, date, or event.",
                "Evidence that apparently independent supporting sources derive from the same underlying source."
            ],
            "machine_recommendation": "UNRESOLVED",
            "verified": False,
            "rule": "Absence of contradicting evidence is not proof that none exists."
        })

    return {
        "schema": "pct-claim-evidence-matrix-v2",
        "generated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "lane": lane,
        "claim_count": len(claims),
        "claims": claims,
        "rules": [
            "Every claim must remain traceable to preserved evidence.",
            "Supporting-source count is not equivalent to independent corroboration.",
            "Contradictory evidence and unknowns must be recorded explicitly.",
            "Catalogue metadata and OCR discovery context cannot by themselves establish VERIFIED.",
            "No automated stage may mark a claim VERIFIED.",
            "Research Value and Evidence Confidence are separate; low confidence never deletes a research lead."
        ]
    }

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--base", default=".")
    p.add_argument("--lane", required=True)
    p.add_argument("--output", default="claim_evidence_matrix/claims.json")
    a = p.parse_args()
    base = Path(a.base)
    out = build_lane(base, a.lane)
    dest = base / a.output
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("CLAIM EVIDENCE MATRIX", a.lane, "claims", out["claim_count"])
