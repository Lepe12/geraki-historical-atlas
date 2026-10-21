"""Explainable reading order and claim-level limits, never historical verification."""
import re

from research_topics import PIRACY, normalized

POLICY = 'relevance-before-diversity-v1'


def genre(row):
    text = row['text'].strip()
    flags = set(row.get('uncertainties', []))
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    metadata = sum(bool(re.match(r'^(?:title|authors?|keywords?|publisher|isbn|doi|abstract|citation)\s*:', line, re.I)) for line in lines)
    notes = sum(bool(re.match(r'^(?:\[\d+\]|\d+[.)])\s+', line)) for line in lines)
    references = sum(bool(re.match(r"^[\w’'\-]+,\s*(?:[A-ZΑ-Ω]\.\s*)+.*\b(?:1[5-9]\d{2}|20\d{2})\b", line)) for line in lines)
    if metadata >= 2 or flags & {'CATALOGUE_METADATA', 'INDEX_ENTRY', 'BIBLIOGRAPHIC_CONTEXT'}:
        return 'REFERENCE_OR_METADATA'
    if len(lines) >= 3 and (notes + references) >= 2 and (notes + references) / len(lines) >= .35:
        return 'REFERENCE_OR_METADATA'
    if len(text.split()) < 24:
        return 'SHORT_CONTEXT'
    return 'NARRATIVE_CONTEXT'


def describe(row, topic=True):
    f = row.get('sampling_features', {})
    g = genre(row)
    region = bool(f.get('strong_region_match', not topic))
    event = bool(f.get('event_and_use_match', not topic))
    event_mention = bool(re.search(PIRACY, normalized(row['text']))) if topic else True
    use = bool(f.get('direct_use_vocabulary', not topic))
    fraction = f.get('in_scope_year_fraction', 0)
    dated = bool(row.get('years_in_scope') or f.get('in_scope_century_context'))
    # Mixed-period paragraphs retain value but a single date in a long
    # ancient/modern discussion must not outweigh coherent target-period text.
    coherent = bool(row.get('date_basis') == 'YEAR_HEADING' or fraction >= .5 or
                    (f.get('in_scope_century_context') and not row.get('years_in_scope')))
    if g == 'REFERENCE_OR_METADATA':
        tier, reason = 7, 'REFERENCE_LEAD_REQUIRES_UNDERLYING_WORK'
    elif g == 'SHORT_CONTEXT':
        tier, reason = 6, 'SHORT_FRAGMENT_REQUIRES_CONTEXT'
    elif topic and region and dated and coherent and event and use:
        tier, reason = 0, 'DIRECT_TARGET_PERIOD_EVENT_AND_USE_CONTEXT'
    elif topic and region and dated and coherent and event_mention:
        tier, reason = 1, 'TARGET_PERIOD_EVENT_CONTEXT'
    elif topic and region and dated and coherent:
        tier, reason = 2, 'TARGET_REGION_AND_PERIOD_CONTEXT'
    elif topic and region and dated and event_mention:
        tier, reason = 3, 'MIXED_PERIOD_EVENT_CONTEXT_REQUIRES_REVIEW'
    elif topic and region and event_mention:
        tier, reason = 4, 'TARGET_EVENT_DATE_UNRESOLVED'
    else:
        tier, reason = 5, 'CONTEXT_OR_SCOPE_UNRESOLVED'
    source = normalized((row.get('source_bibliography') or {}).get('source_type') or '')
    primary_hint = source in {'primary', 'primary_source', 'archival_document', 'contemporary_account'}
    return {'tier': tier, 'reason': reason, 'genre': g, 'temporal_coherence': coherent,
            'primary_source_metadata_hint': primary_hint,
            'conjecture_retained': bool(f.get('conjecture_context')),
            'role': 'READING_PRIORITY_NOT_TRUTH_OR_SOURCE_INDEPENDENCE'}


def order(records, base_priority, topic=True):
    """Diversity only breaks ties within the same substantive relevance tier.

    Do not prefer affirmative statements over denials or conjectures. All
    evidence IDs, source records, byte locators and unresolved leads are kept.
    """
    info = {r['evidence_id']: describe(r, topic) for r in records}
    def key(row):
        p = info[row['evidence_id']]
        if not topic:
            return (*base_priority(row)[:2], p['genre'] != 'NARRATIVE_CONTEXT',
                    not p['primary_source_metadata_hint'])
        return (p['tier'], not p['primary_source_metadata_hint'])
    ranked = sorted(records, key=lambda r: (key(r), base_priority(r)))
    output = []
    for tier in sorted({key(r) for r in ranked}):
        leaders, followers, documents = [], [], set()
        for row in ranked:
            if key(row) != tier:
                continue
            document = (row.get('occurrences') or [{}])[0].get('source_text_sha256', row['evidence_id'])
            (followers if document in documents else leaders).append(row)
            documents.add(document)
        output.extend(leaders + followers)
    return output


def selection_report(records, selected, topic=True):
    selected_ids = {r['evidence_id'] for r in selected}
    tiers = {}
    for row in records:
        tier = str(describe(row, topic)['tier'])
        tiers[tier] = tiers.get(tier, 0) + 1
    return {'policy': POLICY, 'retained_passages': len(records), 'tier_counts': tiers,
            'verification_implied': False,
            'selected': [{'evidence_id': r['evidence_id'], **describe(r, topic)}
                         for r in records if r['evidence_id'] in selected_ids]}


def claim_assessment(answer):
    review = answer.get('review') or {}
    supported = set(review.get('supported_claim_ids', []))
    flags = {r['claim_id']: r for r in review.get('flagged_claims', [])}
    conflicts = {cid for r in review.get('contradictions', []) for cid in r.get('claim_ids', [])}
    rows = []
    for claim in answer.get('claims', []):
        cid = claim['claim_id']
        if cid in conflicts:
            state, label = 'CONFLICT_REQUIRES_REVIEW', 'Καταγεγραμμένη αντίφαση προς εξέταση'
        elif cid in supported:
            if claim.get('kind') in ('hypothesis', 'interpretation'):
                state, label = 'SOURCE_ATTRIBUTED_HYPOTHESIS', 'Υπόθεση ή ερμηνεία που αποδίδεται στην πηγή'
            else:
                state, label = 'QUOTATION_SUPPORTED_HISTORY_PENDING', 'Υποστηρίζεται από το παράθεμα· εκκρεμεί ιστορικός έλεγχος'
        elif flags.get(cid, {}).get('decision') == 'UNSUPPORTED':
            state, label = 'QUOTATION_UNSUPPORTED', 'Δεν υποστηρίζεται από το παράθεμα'
        else:
            state, label = 'INSUFFICIENT_EVIDENCE', 'Ανεπαρκώς τεκμηριωμένος ή μη ελεγμένος ισχυρισμός'
        rows.append({'claim_id': cid, 'status': state, 'label_el': label,
                     'review_reason': flags.get(cid, {}).get('reason'),
                     'historical_verification': False,
                     'source_independence': 'NOT_ESTABLISHED_BY_DOCUMENT_COUNT',
                     'missing_historical_gates': ['ORIGINAL_INSPECTION_NOT_DOCUMENTED',
                         'SOURCE_GENEALOGY_NOT_DOCUMENTED', 'INDEPENDENT_CORROBORATION_NOT_DOCUMENTED',
                         'CONTRADICTION_SEARCH_NOT_DOCUMENTED', 'HUMAN_REVIEW_PENDING']})
    return {'corpus_coverage_is_not_claim_sufficiency': True,
            'automatic_historical_verification': False, 'claims': rows}
