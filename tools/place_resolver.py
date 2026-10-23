"""Resolve place mentions in passages to the sourced gazetteer.

Data: data/gazetteer/mediterranean_gazetteer.v1.json (built by
tools/build_gazetteer.py from Wikidata, CC0). Only SOURCED variants are used.
A mention is RESOLVED only when its matched form belongs to exactly one place;
a form shared by several places (e.g. 'Candia': Crete and Heraklion) is
AMBIGUOUS and lists the candidates instead of guessing. A gazetteer link is an
identification aid, never a source statement, and never says a place was a
corsair base: that label needs a supported, cited claim (see base_label).
"""
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from research_focus import long_s_variant

POLICY = 'gazetteer-place-resolver-v1'
GAZETTEER = Path(__file__).resolve().parent.parent / 'data' / 'gazetteer' / 'mediterranean_gazetteer.v1.json'
MIN_LEN = 4
# Sourced variants that are also ordinary words in the languages of our sources.
COMMON_WORD_COLLISIONS = {'para', 'sale', 'mane'}
GREEK = re.compile(r'[\u0370-\u03ff\u1f00-\u1fff]')
GREEK_ENDINGS = ('ος', 'ας', 'ης', 'ου', 'ων', 'ες', 'ς', 'α', 'η', 'ο', 'ι')


def fold(text):
    return ''.join(c for c in unicodedata.normalize('NFD', str(text or '').replace('ſ', 's'))
                   if not unicodedata.combining(c)).casefold().replace('ς', 'σ')


LINE_BREAK_HYPHEN = re.compile(r'(?<=[^\W\d_])[-\u00ad\u00ac]\s+(?=[^\W\d_])')


def _folded_with_offsets(text):
    """Folded text and original offsets; an OCR line-break hyphen ('Con- ftantinople') is skipped."""
    text = str(text or '')
    skip = {i for m in LINE_BREAK_HYPHEN.finditer(text) for i in range(m.start(), m.end())}
    chars, offsets = [], []
    for i, c in enumerate(text):
        if i in skip:
            continue
        for f in fold(c):
            chars.append(f); offsets.append(i)
    return ''.join(chars), offsets


def _greek_token(token):
    for end in GREEK_ENDINGS:
        e = end.replace('ς', 'σ')
        if token.endswith(e) and len(token) - len(e) >= 3:
            return re.escape(token[:-len(e)]) + r'\w{0,3}'
    return re.escape(token)


def _pattern(form):
    tokens = fold(form).split()
    if GREEK.search(form):
        body = r'\s+(?:\w{1,4}\s+)?'.join(_greek_token(t) for t in tokens)
        return body, 'GREEK_INFLECTION'
    return r'\s+'.join(re.escape(t) for t in tokens), 'EXACT'


@lru_cache(maxsize=4)
def load(path=str(GAZETTEER)):
    doc = json.loads(Path(path).read_text(encoding='utf-8'))
    places = {p['id']: p for p in doc['places']}
    index = {}  # pattern -> {place_id: (variant, method)}
    for p in doc['places']:
        for v in p['variants']:
            name = v['name']
            if v.get('status') != 'SOURCED' or len(fold(name).replace(' ', '')) < MIN_LEN or any(c.isdigit() for c in name):
                continue
            forms = [(name, None)]
            ls = long_s_variant(name)
            if ls:
                forms.append((ls, 'LONG_S_OCR'))
            for form, method in forms:
                pat, base = _pattern(form)
                index.setdefault(pat, {}).setdefault(p['id'], (v, method or base))
    ordered = sorted(index, key=len, reverse=True)
    rx = re.compile(r'(?<!\w)(?:' + '|'.join('(' + p + ')' for p in ordered) + r')(?!\w)')
    return {'places': places, 'index': index, 'ordered': ordered, 'regex': rx, 'doc': doc}


def _candidate(place, variant, method):
    return {'place_id': place['id'], 'wikidata': place['wikidata'], 'modern_name': place['modern_name'],
            'coordinates': place['coordinates'], 'matched_variant': variant['name'], 'variant_lang': variant['lang'],
            'variant_kind': variant['kind'], 'variant_source': variant['source'], 'method': method}


def resolve(text, gazetteer=None):
    """Place mentions in text: [{surface, start, end, status, candidates}]; longest match wins."""
    g = gazetteer or load()
    folded, offsets = _folded_with_offsets(text)
    out = []
    for m in g['regex'].finditer(folded):
        k = next(i for i, grp in enumerate(m.groups()) if grp is not None)
        start, end = offsets[m.start()], offsets[m.end() - 1] + 1
        surface = str(text)[start:end]
        if not surface[:1].isupper():
            continue  # place names are capitalised; avoids common nouns
        hits = g['index'][g['ordered'][k]]
        candidates = [_candidate(g['places'][pid], v, method) for pid, (v, method) in sorted(hits.items())]
        status = 'RESOLVED' if len(candidates) == 1 else 'AMBIGUOUS'
        reasons = [] if status == 'RESOLVED' else ['SHARED_SOURCED_VARIANT']
        if surface.casefold() in COMMON_WORD_COLLISIONS:
            status, reasons = 'AMBIGUOUS', reasons + ['COMMON_WORD_COLLISION']
        out.append({'surface': surface, 'start': start, 'end': end, 'status': status, 'reasons': reasons,
                    'place_ids': [c['place_id'] for c in candidates], 'candidates': candidates,
                    'basis': 'GAZETTEER_VARIANT_MATCH_NOT_SOURCE_STATEMENT'})
    return out


def lookup(name, gazetteer=None):
    """Resolve one supplied place name (e.g. a request term)."""
    hits = [m for m in resolve(str(name)[:1].upper() + str(name)[1:], gazetteer) if m['start'] == 0]
    return hits[0] if hits else None


def variants_for(place_id, gazetteer=None):
    g = gazetteer or load()
    p = g['places'].get(place_id) or {}
    return sorted({v['name'] for v in p.get('variants', []) if v.get('status') == 'SOURCED'
                   and len(fold(v['name']).replace(' ', '')) >= MIN_LEN and v['name'].casefold() not in COMMON_WORD_COLLISIONS})


def base_label(claim, supported_claim_ids):
    """A corsair-base label exists only for a supported, cited BASE claim; never from the gazetteer."""
    if claim.get('usage_type') == 'BASE' and claim.get('claim_id') in supported_claim_ids and claim.get('source_occurrences'):
        return {'label': 'BASE_PER_SUPPORTED_CITED_CLAIM', 'claim_id': claim['claim_id']}
    return None


def annotate(answer):
    """Record place links on evidence passages and claims (answer-level, records untouched)."""
    links = {r['evidence_id']: resolve(r.get('text', '')) for r in answer.get('evidence', [])}
    answer['place_links'] = {'policy': POLICY, 'gazetteer': str(GAZETTEER.relative_to(GAZETTEER.parents[2])),
                             'passages': {k: v for k, v in links.items() if v}}
    for claim in answer.get('claims', []):
        claim['place_links'] = [m for m in resolve(claim.get('quote', ''))]
    return answer
