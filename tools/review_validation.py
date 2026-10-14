"""Strict documentary validation. Attestations still require accountable human judgment."""
import datetime
import hashlib
import json
import math
import pathlib
import re


def text(value):
    return isinstance(value,str) and bool(value.strip())


def timestamp(value):
    if not text(value): return False
    try: return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).tzinfo is not None
    except ValueError: return False


def strings(value):
    return isinstance(value,list) and all(text(x) for x in value)


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()


def candidate_digest(candidate):
    # Bind source-derived evidence, not mutable workflow/review flags.
    return digest({k:candidate.get(k) for k in ('candidate_id','lane','source_file','source_type','identifier','url','title','context_excerpt','place','date','exact_page_candidates')})


def locator_valid(locator):
    if not isinstance(locator,dict): return False
    page=locator.get('printed_page',locator.get('folio'))
    scan=locator.get('leaf',locator.get('scan_index'))
    canvas=locator.get('canvas_id')
    image=locator.get('image_url') or locator.get('image_id')
    return (text(page) or type(page) is int and page>=0) and (type(scan) is int and scan>=0 or text(canvas) or text(image)) and (text(locator.get('source_id')) or text(locator.get('identifier')) or text(locator.get('url')))


def checked_evidence(items):
    if not isinstance(items,list) or not items: raise ValueError('EVIDENCE_OBJECTS_REQUIRED')
    root=pathlib.Path.cwd().resolve()
    for item in items:
        if not isinstance(item,dict) or not text(item.get('path')) or not re.fullmatch(r'[0-9a-f]{64}',str(item.get('sha256',''))): raise ValueError('EVIDENCE_PATH_AND_SHA256_REQUIRED')
        path=(root/item['path']).resolve()
        if not path.is_relative_to(root) or not path.is_file(): raise ValueError('EVIDENCE_FILE_NOT_FOUND_OR_OUTSIDE_REVIEW_ROOT')
        if hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']: raise ValueError('EVIDENCE_CHECKSUM_MISMATCH')


def validate_review(review,candidate):
    quality=review.get('source_quality_score')
    if type(quality) not in (int,float) or not math.isfinite(quality) or not 0<=quality<=1: raise ValueError('QUALITY_SCORE_MUST_BE_FINITE_0_TO_1')
    if review.get('original_inspected') is not True: raise ValueError('ORIGINAL_INSPECTION_MUST_BE_BOOLEAN_TRUE')
    if not locator_valid(review.get('exact_locator')): raise ValueError('EXACT_SOURCE_PAGE_AND_SCAN_REQUIRED')
    if not text(review.get('source_says')) or not text(review.get('reviewer')): raise ValueError('REVIEW_TEXT_AND_REVIEWER_REQUIRED')
    if review.get('reviewed_utc') is not None and not timestamp(review['reviewed_utc']): raise ValueError('INVALID_REVIEW_TIMESTAMP')
    checked_evidence(review.get('evidence_examined'))
    if review.get('candidate_evidence_sha256') != candidate_digest(candidate): raise ValueError('REVIEW_EVIDENCE_BINDING_MISMATCH')


def assessment_valid(value):
    return isinstance(value,dict) and text(value.get('assessment')) and isinstance(value.get('evidence_refs'),list) and bool(value['evidence_refs']) and all(text(x) for x in value['evidence_refs'])


def validate_final(v,candidate,review,claim):
    validate_review(review,candidate)
    if review.get('decision')!='ACCEPT' or review.get('verification_eligible') is not True: raise ValueError('ACCEPTED_REVIEW_REQUIRED')
    if v.get('claim_matrix_sha256')!=digest(claim): raise ValueError('CLAIM_MATRIX_BINDING_MISMATCH')
    if not text(v.get('claim_text')) or v['claim_text'] != claim.get('claim_text'): raise ValueError('CLAIM_TEXT_MISMATCH')
    if v.get('claim_scope')!=claim.get('claim_scope') or not v.get('claim_scope'): raise ValueError('CLAIM_SCOPE_MISMATCH')
    if not assessment_valid(v.get('source_genealogy_assessment')) or not assessment_valid(v.get('corroboration_assessment')): raise ValueError('STRUCTURED_EVIDENCE_ASSESSMENTS_REQUIRED')
    if not strings(v.get('limitations')) or not strings(claim.get('uncertainties')): raise ValueError('LIMITATIONS_AND_UNCERTAINTIES_MUST_BE_LISTS')
    if claim.get('contradiction_search_status') not in {'SEARCHED_NONE_FOUND','CONTRADICTION_FOUND','PARTIAL_SEARCH','NOT_APPLICABLE_WITH_REASON'}: raise ValueError('INVALID_CONTRADICTION_STATUS')
    if not text(claim.get('assessment_reviewer')) or not timestamp(claim.get('assessment_utc')): raise ValueError('VALID_CLAIM_REVIEW_REQUIRED')
    if not strings(claim.get('falsification_targets')) or not claim['falsification_targets']: raise ValueError('FALSIFICATION_TARGETS_REQUIRED')
    if v.get('verified_utc') is not None and not timestamp(v['verified_utc']): raise ValueError('INVALID_VERIFICATION_TIMESTAMP')
