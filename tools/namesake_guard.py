"""Namesake guard: record linkage of a source mention to the requested person.

Rule set (adapted from the Medieval Londoners name-linkage protocol,
https://medievallondoners.ace.fordham.edu/protocols-for-name-linkage-1/):
a mention that carries the target's name is LINKED only when at least two
independent attribute types match the request-derived profile and there is no
deal-breaker; with a deal-breaker it is DIFFERENT_PERSON; otherwise POSSIBLE
(kept in the evidence, never used for a supported claim). Observations stay
separate from the reconstruction: every decision records the matched
attributes and deal-breakers so it can be audited and reversed.

The profile is built only from the request (date_range, an explicit
"<role> of <place>" clause in target or purpose, decompose() roles/places,
and an optional request 'identity_profile' with kin/roles/places/sources).
Nothing is invented: an attribute the request does not state is not checked.
Matching is lexical and never a historical assertion.
"""
import re

from fulltext_discovery import ROLE_VOCAB, spelling_hypotheses
from passage_triage import name_patterns, publication_year
from research_focus import ROLE, decompose, fold
from research_relevance import contextual_years

POLICY = 'namesake-guard-v1'
LINKED, POSSIBLE, DIFFERENT, NO_NAME = 'LINKED', 'POSSIBLE', 'DIFFERENT_PERSON', 'NO_TARGET_NAME_IN_PASSAGE'
NOT_ENFORCED = 'NOT_ENFORCED_PROFILE_TOO_THIN'
MIN_ATTRIBUTE_TYPES = 2
FAR_OUTSIDE_YEARS = 100   # a mention dated only >100 years outside the window cannot be the person
NEAR_CONTEMPORARY_YEARS = 50  # publication within the window or <=50 years after it
NAME_WINDOW = 240         # deal-breakers must sit near the name, not anywhere on the page
# Offices of modern parliamentary/ministerial government. They conflict with a
# person whose requested window ends before 1800 (status/role deal-breaker).
MODERN_OFFICE = re.compile(r'(?<!\w)(?:βουλευτ\w*|υφυπουργ\w*|υπουργ\w*|κοινοβουλ\w*|dep\.?\s*min\.?|minist(?:er|re|ro)\w*|'
                           r'member\s+of\s+parliament|parliamentar\w*|deputy\s+minister)')
PLACE_AFTER_ROLE = re.compile((ROLE + r'\s+(?:της|του|των|of(?:\s+the)?|de|di)\s+([^\W\d_]{3,})').replace('ς', 'σ'))


def _norm(text):
    return fold(str(text or '')).replace('ſ', 's').replace('ς', 'σ')


def _stem_pattern(term):
    t = _norm(term).strip()
    if len(t) < 3:
        return None
    body = re.escape(t).replace(r'\ ', r'\s+')
    return re.compile(r'(?<!\w)' + body + (r'(?!\w)' if len(t) <= 3 else r'\w*'))


def profile(request):
    """Attributes stated by the request. Returns {'attributes': {type: [terms]}, 'window': (lo, hi)}."""
    request = request or {}
    target, aliases = request.get('target', ''), request.get('aliases', []) or []
    extra = request.get('identity_profile') if isinstance(request.get('identity_profile'), dict) else {}
    focus = decompose(target, aliases, kind='person')
    roles, places = list(focus.get('roles', [])), list(focus.get('places', []))
    for text in (target, request.get('purpose', '')):
        for m in PLACE_AFTER_ROLE.finditer(_norm(text)):
            roles.append(m.group(0).split()[0]); places.append(m.group(1))
    roles += [str(x) for x in extra.get('roles', []) or []]
    places += [str(x) for x in extra.get('places', []) or []]
    role_terms = []
    for role in roles:
        r = _norm(role)
        for key, forms in ROLE_VOCAB.items():
            if r.startswith(_norm(key)):
                role_terms.extend(forms)
        role_terms.append(r if len(r) < 6 else r[:-1])
    place_terms = []
    for place in places:
        p = _norm(place)
        place_terms.extend(_norm(x) for x in spelling_hypotheses(place, True))
        if re.search(r'[α-ω]', p) and len(p) >= 5:
            place_terms.append(p[:-2])  # Greek inflection: 'μηλου' -> 'μηλ' (Μήλος, Μήλο)
    years = [int(y) for y in re.findall(r'(?<!\d)(1\d{3}|20\d{2})(?!\d)', str(request.get('date_range', '')))]
    attrs = {'place': place_terms, 'role': role_terms,
             'kin': [str(x) for x in extra.get('kin', []) or []],
             'source': [str(x) for x in extra.get('sources', []) or []]}
    attrs = {k: sorted({t for t in v if _stem_pattern(t)}) for k, v in attrs.items()}
    attrs = {k: v for k, v in attrs.items() if v}
    window = (min(years), max(years)) if years else None
    return {'policy': POLICY, 'names': [n for n in [target, *aliases] if str(n).strip()],
            'attributes': attrs, 'window': window,
            'basis': 'REQUEST_DERIVED_NOT_VERIFIED_FACTS'}


def _document(row):
    occ = (row.get('occurrences') or [{}])[0]
    return (_norm(occ.get('title')) or row['evidence_id'], publication_year(row))


def _assess(row, prof, patterns):
    text = _norm(row.get('text'))
    spans = [m.span() for p in patterns for m in p.finditer(text)]
    if not spans:
        return None
    near = ' '.join(text[max(0, a - NAME_WINDOW):b + NAME_WINDOW] for a, b in spans)
    matched, breakers = [], []
    for kind, terms in prof['attributes'].items():
        for term in terms:
            m = _stem_pattern(term).search(text)
            if m:
                matched.append({'attribute': kind, 'term': term, 'surface': m.group(0), 'scope': 'passage'}); break
    window = prof['window']
    years = contextual_years(row.get('text') or '')
    if window:
        lo, hi = window
        inside = [y for y in years if lo <= y <= hi]
        if inside:
            matched.append({'attribute': 'date', 'term': f'{lo}-{hi}', 'surface': str(inside[0]), 'scope': 'passage'})
        pub = publication_year(row)
        if pub and lo <= pub <= hi + NEAR_CONTEMPORARY_YEARS:
            matched.append({'attribute': 'source_date', 'term': f'published {lo}-{hi + NEAR_CONTEMPORARY_YEARS}',
                            'surface': str(pub), 'scope': 'source_metadata'})
        near_years = contextual_years(near)
        if near_years and not inside and all(y > hi + FAR_OUTSIDE_YEARS or y < lo - FAR_OUTSIDE_YEARS for y in near_years):
            breakers.append({'deal_breaker': 'DATE_FAR_OUTSIDE_LIFETIME', 'surface': str(near_years[0]),
                             'window': f'{lo}-{hi}'})
        office = MODERN_OFFICE.search(near)
        if hi < 1800 and office:
            breakers.append({'deal_breaker': 'CONFLICTING_MODERN_OFFICE', 'surface': office.group(0),
                             'window': f'{lo}-{hi}'})
    return {'matched_attributes': matched, 'deal_breakers': breakers}


def classify(records, request):
    """Return ({evidence_id: linkage}, report). Records are not modified."""
    prof = profile(request)
    patterns = name_patterns(prof['names'])
    types = set(prof['attributes']) | ({'date', 'source_date'} if prof['window'] else set())
    enforce = len(types) >= MIN_ATTRIBUTE_TYPES + 1 and bool(set(prof['attributes']) & {'place', 'role', 'kin'})
    own = {r['evidence_id']: _assess(r, prof, patterns) for r in records}
    by_doc = {}
    for r in records:
        a = own[r['evidence_id']]
        if a and not a['deal_breakers']:
            by_doc.setdefault(_document(r), []).extend(a['matched_attributes'])
    out = {}
    for r in records:
        eid, a = r['evidence_id'], own[r['evidence_id']]
        if a is None:
            out[eid] = {'status': NO_NAME, 'matched_attributes': [], 'deal_breakers': []}; continue
        matched = list(a['matched_attributes'])
        seen = {m['attribute'] for m in matched}
        for m in by_doc.get(_document(r), []):
            if m['attribute'] not in seen:
                matched.append({**m, 'scope': 'same_document'}); seen.add(m['attribute'])
        if a['deal_breakers']:
            status = DIFFERENT
        elif not enforce:
            status = NOT_ENFORCED
        else:
            status = LINKED if len(seen) >= MIN_ATTRIBUTE_TYPES else POSSIBLE
        out[eid] = {'status': status, 'matched_attributes': matched, 'deal_breakers': a['deal_breakers'],
                    'attribute_types_matched': sorted(seen)}
    counts = {}
    for v in out.values():
        counts[v['status']] = counts.get(v['status'], 0) + 1
    return out, {'policy': POLICY, 'profile': prof, 'enforced': enforce, 'min_attribute_types': MIN_ATTRIBUTE_TYPES,
                 'counts': counts, 'mentions': out,
                 'rule': 'LINKED needs >=2 independent attribute types and no deal-breaker; POSSIBLE is kept but '
                         'not used for supported claims; DIFFERENT_PERSON is rejected.'}
