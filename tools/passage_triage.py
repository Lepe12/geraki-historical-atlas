"""Deterministic pre-model passage triage (eMOP-style page triage, no model calls).

Reorders retained passages so the bounded model-call budget reaches, in order:
  (a) passages naming the research target (literal, or the accepted long-s OCR
      variant), or section-continuation pages of such a named page;
  (b) early/primary sources: publication metadata before 1800, or the existing
      primary-source metadata hint of research_priority.describe;
  (c) better OCR quality (a simple character/word heuristic).
Nothing is dropped and nothing is rewritten: this is READING ORDER ONLY, never
identity, date or truth evidence. Ties keep the previous order (stable sort).
The report records every passage's rank, previous rank and reasons.
"""
import re

from research_focus import long_s_variant
from research_priority import describe
from research_topics import normalized

POLICY = 'deterministic-name-early-ocr-triage-v1'
EARLY_BEFORE = 1800
CONTINUATION_FLAGS = {'SURNAME_FROM_ADJACENT_NAMED_PAGE'}
GREEK = r'[\u0370-\u03ff\u1f00-\u1fff]'


def name_patterns(target_names):
    """Full names plus surname stems (Greek/Latin inflection), with long-s variants."""
    terms = set()
    for name in target_names or []:
        name = str(name or '').strip()
        if not name:
            continue
        tokens = re.findall(r'[^\W\d_]+', name)
        forms = [name]
        if tokens and len(tokens[-1]) >= 5:
            # 'Καψής' -> 'Καψη' (matches 'Κάψη'); 'Capsi' -> 'Caps' (matches 'Capsis').
            forms.append(tokens[-1][:-1])
        for form in forms:
            terms.add(normalized(form))
            variant = long_s_variant(form)
            if variant:
                terms.add(normalized(variant))
    return [re.compile(r'(?<![^\W\d_])' + re.escape(t).replace(r'\ ', r'\s+')) for t in sorted(terms) if len(t) >= 4]


def ocr_quality(text):
    """Share of word-like tokens (0..1, rounded to 0.05); 0 for fragments under 24 tokens."""
    tokens = re.findall(r'\S+', str(text))
    if len(tokens) < 24:
        return 0.0  # short fragments (index lines, headings) give no OCR signal
    good = sum(bool(re.fullmatch(r'[(\[«“"\'’]?[^\W\d_]{2,}(?:[\'’\-][^\W\d_]+)*[.,;:!?)\]»”"\'’]*', t)) for t in tokens)
    return round(round(good / len(tokens) * 20) / 20, 2)


def publication_year(row):
    dates = (row.get('source_bibliography') or {}).get('date') or []
    if isinstance(dates, (str, int)):
        dates = [dates]
    years = [int(y) for d in dates for y in re.findall(r'(?<!\d)(1\d{3}|20\d{2})(?!\d)', str(d))]
    return min(years) if years else None


def _document(row):
    occ = (row.get('occurrences') or [{}])[0]
    return occ.get('source_text_sha256') or re.sub(r'_\d+/full/.*$', '', str(occ.get('url') or '')) or row['evidence_id']


def _scans(row):
    return {b.get('scan_index_0_based') for o in row.get('occurrences') or []
            for b in o.get('page_boundaries') or [] if isinstance(b.get('scan_index_0_based'), int)}


def triage(records, target_names, topic=False):
    """Return (records reordered, auditable report); stable, nothing dropped."""
    patterns = name_patterns(target_names)
    named, named_scans = set(), {}
    for row in records:
        text = normalized(row.get('text', ''))
        if patterns and any(p.search(text) for p in patterns):
            named.add(row['evidence_id'])
            named_scans.setdefault(_document(row), set()).update(_scans(row))
    info = {}
    for index, row in enumerate(records):
        reasons = []
        identity = 0
        if row['evidence_id'] in named:
            identity, _ = 2, reasons.append('TARGET_NAME_OR_LONG_S_VARIANT_IN_PASSAGE')
        else:
            near = named_scans.get(_document(row), set())
            adjacent = any(0 < s - n <= 4 for s in _scans(row) for n in near)
            if set(row.get('uncertainties') or []) & CONTINUATION_FLAGS or adjacent:
                identity = 1
                reasons.append('SECTION_CONTINUATION_OF_NAMED_PAGE')
        year = publication_year(row)
        primary = describe(row, topic)['primary_source_metadata_hint']
        early = bool(primary or (year is not None and year < EARLY_BEFORE))
        if year is not None and year < EARLY_BEFORE:
            reasons.append('PUBLICATION_METADATA_BEFORE_%d' % EARLY_BEFORE)
        if primary:
            reasons.append('PRIMARY_SOURCE_METADATA_HINT')
        quality = ocr_quality(row.get('text', ''))
        reasons.append('OCR_QUALITY_%.2f' % quality)
        info[row['evidence_id']] = {'key': (identity == 0, not early, -identity, -quality, index),
                                    'identity_signal': identity, 'early_or_primary': early,
                                    'publication_year_metadata': year, 'ocr_quality': quality,
                                    'previous_rank': index, 'reasons': reasons}
    ranked = sorted(records, key=lambda r: info[r['evidence_id']]['key'])
    passages = [{'evidence_id': r['evidence_id'], 'rank': rank,
                 **{k: v for k, v in info[r['evidence_id']].items() if k != 'key'}}
                for rank, r in enumerate(ranked)]
    # Rows are not mutated: extraction receipts stay bound to unchanged evidence.
    return ranked, {'policy': POLICY, 'model_calls': 0, 'dropped': 0,
                    'role': 'READING_ORDER_ONLY_NOT_IDENTITY_DATE_OR_TRUTH_EVIDENCE',
                    'passages': passages}
