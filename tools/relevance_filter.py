#!/usr/bin/env python3
"""Relevance filter: keep off-topic material out of the synthesized answer.

Deterministic and model-free. Each claim (and each answer paragraph) is put in
one of three classes against the request (target, aliases, place, date window):

* DIRECT     - the claim statement/actors/places name the subject: the target or
               a user-supplied alias (person: surname stems as in passage_triage;
               place: also the sourced gazetteer variants of the target place,
               e.g. Μήλος -> Milo, Melos). A person mention whose passage the
               namesake guard marked DIFFERENT_PERSON is never DIRECT. For a topic
               request: base/anchorage vocabulary together with piracy vocabulary.
* CONTEXTUAL - background that may be shown, labelled as context and never as a
               fact about the subject: an in-scope place (the request's own place,
               or a gazetteer place within NEIGHBOUR_KM of it by Wikidata
               coordinates; for a regional topic, a gazetteer place in that
               region) that is not dated outside the window; or a claim taken from
               a passage that itself names the subject; or (topic) piracy
               vocabulary alone. When unsure the filter chooses CONTEXTUAL.
* OFF_TOPIC  - none of these, or a statement that only describes the consulted
               study's own sources (e.g. "The study references letters from
               consuls in Izmir") without any subject or piracy content.

Nothing is deleted or rewritten. OFF_TOPIC claims get relevance_hold and are kept
out of synthesis; held paragraphs are moved to excluded_answer_sections by the
caller. Place matches use only SOURCED gazetteer variants (place_resolver).
"""
from __future__ import annotations
import json
import math
import re
import sys

from place_resolver import fold, load, lookup, resolve

POLICY = 'relevance-filter-v1'
DIRECT, CONTEXTUAL, OFF_TOPIC = 'DIRECT', 'CONTEXTUAL', 'OFF_TOPIC'
RANK = {DIRECT: 2, CONTEXTUAL: 1, OFF_TOPIC: 0}
HOLD = 'HELD_FROM_SYNTHESIS_OFF_TOPIC_FOR_REQUEST'
NEIGHBOUR_KM = 25          # e.g. Kimolos (Αρζαντιέρα) for a Milos question
FAR_OUTSIDE_YEARS = 25     # all claimed years further than this outside the window
YEAR = re.compile(r'(?<!\d)(1[0-9]{3})(?!\d)')

# Accent-folded stems. Auditable, multilingual (EN/IT/FR/ES/LA/EL/TR).
PIRACY = re.compile(r'(?<!\w)(?:pirat|piracy|corsa[ir]|corsar|korsan|kursan|κουρσ|πειρατ|privateer|freebooter|'
                    r'buccan|filibust|levend|reis\b|raid|ranso[mn]|captiv|cautiv|captif|schiav|esclav|slave|'
                    r'σκλαβ|αιχμαλωτ|λυτρ|plunder|pillag|saccheg|λεηλα|prize|preda\b|prise\b|sea-?wolves|garp\s+ocak|'
                    r'barbaresque|barbaresc|berberisc|barbary|attack|attacc|attaqu|assault|sald[iı]r|επιθεσ|επιδρομ)')
# Maritime/naval words: for a topic request they make a claim background, never DIRECT.
MARITIME = re.compile(r'(?<!\w)(?:galley|galleys|galere|galee|galea|galeot|galiot|fleet|flotta|flotte|armada|'
                      r'squadron|squadra|escadre|γαλερ|κατεργ|στολο|fortress|fortif|tower|watch-?tower|πυργ|καστρ)')
BASE = re.compile(r'(?<!\w)(?:base|bases|haven|refuge|anchorage|harbou?r|lair|nest|shelter|'
                  r'rifugio|ricett|ancoragg|mouillage|repaire|retraite|abri|fondeadero|refugio|abrigo|'
                  r'ορμητηρ|αγκυροβολ|καταφυγ|λιμαν|φωλι)')
# The statement only reports what the consulted study uses or cites.
SOURCE_DESCRIPTION = re.compile(r'^(?:the|this|a)\s+(?:consulted\s+)?(?:study|article|book|work|author|thesis|'
                                r'paper|volume|bibliography|catalogue)\s+(?:also\s+)?(?:references?|'
                                r'utili[sz]es|uses|used|cites|draws\s+on|relies\s+on|is\s+based\s+on|lists|'
                                r'consults|mentions\s+(?:letters|documents|sources|archives))')
# Region words in requests -> longitude/latitude box (approximate, documented).
REGIONS = (
    (re.compile(r'ανατολικ\w*\s+μεσογει|eastern\s+mediterranean|levant|mediterranee\s+orientale|'
                r'mediterraneo\s+orientale|dogu\s+akdeniz'), 'EASTERN_MEDITERRANEAN', (19.0, 37.0, 30.0, 42.5)),
    (re.compile(r'αιγαι|aegean|archipel|egee|egeo|cyclad|κυκλαδ'), 'AEGEAN', (22.5, 29.5, 35.0, 41.0)),
)


def _n(text):
    return fold(text).replace('ſ', 's')


def _km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a['lat'], a['lon'], b['lat'], b['lon']))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def _name_regexes(names):
    from passage_triage import name_patterns
    return name_patterns([n for n in names if n and len(str(n).strip()) >= 3])


def subject_profile(request, question_kind=None):
    """Request-derived scope. Nothing is added that the request does not state."""
    from research_focus import decompose
    request = request or {}
    target = str(request.get('target') or '')
    aliases = [str(a) for a in request.get('aliases') or [] if str(a).strip()]
    kind = question_kind or decompose(target, aliases).get('kind')
    if kind not in ('person', 'topic'):
        kind = 'place'
    text = ' '.join([target, *aliases, str(request.get('purpose') or '')])
    years = [int(y) for y in re.findall(r'(?<!\d)(1\d{3}|20\d{2})(?!\d)', str(request.get('date_range') or ''))]
    if not years:
        years = [int(y) for y in re.findall(r'(?<!\d)(1[0-7]\d{2})(?!\d)', target + ' ' + str(request.get('purpose') or ''))]
    g = load()
    place_ids = []
    for m in resolve(text):
        if m['status'] == 'RESOLVED' and m['place_ids'][0] not in place_ids:
            place_ids.append(m['place_ids'][0])
    names = [target, *aliases] if kind != 'topic' else aliases
    if kind == 'place':
        for n in [target, *aliases]:
            hit = lookup(n)
            if hit and hit['status'] == 'RESOLVED':
                from place_resolver import variants_for
                names += variants_for(hit['place_ids'][0])
    names = [n for n in dict.fromkeys(names) if len(_n(n).strip()) >= 3]
    neighbours = {}
    for pid in place_ids:
        c = g['places'][pid].get('coordinates') or {}
        for oid, other in g['places'].items():
            oc = other.get('coordinates') or {}
            if oid not in place_ids and c.get('lat') is not None and oc.get('lat') is not None:
                d = _km(c, oc)
                if d <= NEIGHBOUR_KM:
                    neighbours[oid] = {'of': pid, 'km': round(d, 1)}
    regions = [{'region': label, 'box': box} for rx, label, box in REGIONS if rx.search(_n(text))]
    return {'policy': POLICY, 'kind': kind, 'names': names, 'window': (min(years), max(years)) if years else None,
            'place_ids': place_ids, 'neighbour_place_ids': neighbours, 'regions': regions,
            'topic_requires': {'piracy': bool(PIRACY.search(_n(text))) or kind == 'topic',
                               'base': bool(BASE.search(_n(text)))},
            'basis': 'REQUEST_DERIVED_SCOPE_NOT_SOURCE_EVIDENCE'}


def _in_region(place, regions):
    c = place.get('coordinates') or {}
    if c.get('lat') is None:
        return False
    return any(r['box'][0] <= c['lon'] <= r['box'][1] and r['box'][2] <= c['lat'] <= r['box'][3] for r in regions)


def _period(text, window):
    years = sorted({int(y) for y in YEAR.findall(text)})
    if not window or not years:
        return 'NOT_STATED', years
    lo, hi = window
    if any(lo <= y <= hi for y in years):
        return 'INSIDE', years
    if all(y < lo - FAR_OUTSIDE_YEARS or y > hi + FAR_OUTSIDE_YEARS for y in years):
        return 'FAR_OUTSIDE', years
    return 'NEAR', years


def _places_in(text, prof):
    g = load()
    own, near, region, other = [], [], [], []
    for m in resolve(text):
        if m['status'] != 'RESOLVED':
            continue
        pid = m['place_ids'][0]
        rec = {'surface': m['surface'], 'place_id': pid}
        if pid in prof['place_ids']:
            own.append(rec)
        elif pid in prof['neighbour_place_ids']:
            near.append({**rec, **prof['neighbour_place_ids'][pid]})
        elif prof['regions'] and _in_region(g['places'][pid], prof['regions']):
            region.append(rec)
        else:
            other.append(rec)
    return own, near, region, other


def classify_claim(claim, prof, patterns=None, linkage=None, passage_text=None):
    """Return {'status', 'reasons', 'evidence'}; pure function, claim not modified."""
    patterns = _name_regexes(prof['names']) if patterns is None else patterns
    stmt = str(claim.get('statement') or claim.get('text') or '')
    fields = ' '.join([stmt, *[str(x) for x in claim.get('actors') or []], *[str(x) for x in claim.get('places') or []]])
    norm = _n(fields)
    dated = ' '.join([stmt, *[str(x) for x in claim.get('dates') or []]])
    period, years = _period(dated, prof['window'])
    own, near, region, other = _places_in(fields, prof)
    region_words = [label for rx, label, _ in REGIONS if rx.search(_n(fields))
                    and any(r['region'] == label or r['region'] == 'EASTERN_MEDITERRANEAN' for r in prof['regions'])]
    if region_words:
        region = region + [{'surface': w, 'place_id': None, 'basis': 'REGION_WORD'} for w in region_words]
    ev = {'period': period, 'claimed_years': years, 'subject_places': own, 'neighbour_places': near,
          'region_places': region, 'other_places': other}
    from research_topics import normalized
    names = sorted({m.group(0) for p in patterns for m in p.finditer(normalized(fields))})
    different = (linkage or {}).get('status') == 'DIFFERENT_PERSON'
    piracy, base = bool(PIRACY.search(norm)), bool(BASE.search(norm))
    ev.update(subject_name_matches=names, piracy_terms=piracy, base_terms=base)
    if names and not different:
        if prof['kind'] == 'place' or period != 'FAR_OUTSIDE':
            return {'status': DIRECT, 'reasons': ['SUBJECT_NAMED_IN_CLAIM'], 'evidence': ev}
    if prof['kind'] == 'topic' and piracy and (base or not prof['topic_requires']['base']) and period != 'FAR_OUTSIDE':
        if region or not prof['regions'] or not other:
            return {'status': DIRECT, 'reasons': ['TOPIC_ACTIVITY_IN_CLAIM'], 'evidence': ev}
    reasons = []
    if different:
        reasons.append('NAMESAKE_GUARD_DIFFERENT_PERSON')
    source_only = bool(SOURCE_DESCRIPTION.search(_n(stmt))) and not piracy and not names
    if source_only:
        return {'status': OFF_TOPIC, 'reasons': reasons + ['SOURCE_DESCRIPTION_NOT_A_FINDING'], 'evidence': ev}
    if period != 'FAR_OUTSIDE':
        if own:
            return {'status': CONTEXTUAL, 'reasons': reasons + ['SUBJECT_PLACE_' + period], 'evidence': ev}
        if near:
            return {'status': CONTEXTUAL, 'reasons': reasons + ['NEIGHBOUR_PLACE_' + period], 'evidence': ev}
        if region:
            return {'status': CONTEXTUAL, 'reasons': reasons + ['REGION_PLACE_' + period], 'evidence': ev}
    if passage_text and not different and prof['kind'] != 'topic' and period != 'FAR_OUTSIDE':
        from research_topics import normalized
        pnorm = normalized(passage_text)
        if any(p.search(pnorm) for p in patterns):
            return {'status': CONTEXTUAL, 'reasons': reasons + ['SAME_PASSAGE_NAMES_SUBJECT'], 'evidence': ev}
    if prof['kind'] == 'topic' and period != 'FAR_OUTSIDE':
        maritime = bool(MARITIME.search(norm))
        if piracy or base or maritime:
            # Topic background (an attack, an anchorage, galleys, a fortified tower) whose
            # place is not resolved or lies outside the requested region: shown as context.
            why = 'PIRACY_ACTIVITY' if piracy else 'BASE_VOCABULARY' if base else 'MARITIME_VOCABULARY'
            return {'status': CONTEXTUAL, 'reasons': reasons + [why + '_PLACE_UNSCOPED'], 'evidence': ev}
    if prof['kind'] != 'topic' and not prof['place_ids'] and not prof['window'] and not different:
        # A request with no place and no period gives nothing to judge against.
        return {'status': CONTEXTUAL, 'reasons': ['REQUEST_SCOPE_TOO_THIN'], 'evidence': ev}
    return {'status': OFF_TOPIC, 'reasons': reasons + ['NO_SUBJECT_PLACE_PERIOD_OR_TOPIC_LINK'], 'evidence': ev}


def apply(claims, request, question_kind=None, identity_linkage=None, evidence_by_id=None):
    """Annotate claims in place (adds fields only). Returns a report dict."""
    prof = subject_profile(request, question_kind)
    patterns = _name_regexes(prof['names'])
    report = {'policy': POLICY, 'profile': prof, 'checked': 0, 'by_status': {}, 'held_claim_ids': [],
              'rule': 'OFF_TOPIC claims are kept but held from synthesis; CONTEXTUAL is background, not a fact '
                      'about the subject; when unsure the filter chooses CONTEXTUAL.'}
    for claim in claims or []:
        eid = claim.get('evidence_id')
        row = (evidence_by_id or {}).get(eid) or {}
        res = classify_claim(claim, prof, patterns, (identity_linkage or {}).get(eid),
                             row.get('text') or claim.get('quote'))
        report['checked'] += 1
        report['by_status'][res['status']] = report['by_status'].get(res['status'], 0) + 1
        claim['relevance_status'] = res['status']
        claim['relevance'] = {'policy': POLICY, **res}
        if res['status'] == OFF_TOPIC:
            claim['relevance_hold'] = HOLD
            report['held_claim_ids'].append(claim.get('claim_id'))
    return report


def check_sections(sections, claims, request, question_kind=None):
    """A paragraph takes the best class of its own text and its cited claims."""
    prof = subject_profile(request, question_kind)
    patterns = _name_regexes(prof['names'])
    by_id = {c.get('claim_id'): c for c in claims or []}
    out = []
    for i, s in enumerate(sections or []):
        own = classify_claim({'statement': s.get('text')}, prof, patterns)
        cited = [by_id[c].get('relevance_status') or classify_claim(by_id[c], prof, patterns)['status']
                 for c in s.get('claim_ids') or [] if c in by_id]
        status = max([own['status'], *cited], key=RANK.get)
        out.append({'section_index': i, 'status': status, 'text_class': own['status'], 'cited_claim_classes': cited})
    return out


def synthesis_label(claim):
    return {DIRECT: 'ABOUT_SUBJECT', CONTEXTUAL: 'CONTEXT_ONLY_NOT_A_FACT_ABOUT_THE_SUBJECT'}.get(claim.get('relevance_status'))


def main(argv=None):
    """Read-only audit of a stored answer.json: python3 tools/relevance_filter.py ANSWER_JSON [MANIFEST_JSON]."""
    argv = sys.argv[1:] if argv is None else argv
    if not argv:
        print(main.__doc__, file=sys.stderr)
        return 2
    answer = json.load(open(argv[0], encoding='utf-8'))
    request = json.load(open(argv[1], encoding='utf-8')).get('normalized_request') if len(argv) > 1 else {}
    claims = json.loads(json.dumps(answer.get('claims') or []))
    ev = {r.get('evidence_id'): r for r in answer.get('evidence') or []}
    links = (answer.get('identity_linkage') or {}).get('mentions')
    report = apply(claims, request, answer.get('request_kind'), links, ev)
    report['held'] = [{'claim_id': c.get('claim_id'), 'statement': c.get('statement'), 'reasons': c['relevance']['reasons']}
                      for c in claims if c['relevance_status'] == OFF_TOPIC]
    report['sections'] = check_sections(answer.get('answer_sections'), claims, request, answer.get('request_kind'))
    print(json.dumps(report, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
