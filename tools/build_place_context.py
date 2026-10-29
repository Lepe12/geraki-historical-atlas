#!/usr/bin/env python3
"""Build data/gazetteer/place_context.v1.json from Wikidata (no key needed).

For every gazetteer place:
  context   labels/aliases of the place's Wikidata P706 (physical feature, e.g.
            Cyclades), P131 (admin unit), P361 (part of), P206 (sea) and P47
            (borders), plus other gazetteer places within NEARBY_KM, plus the
            curated historical region terms in region_context_terms.v1.json.
  ambiguous names of the place that Wikidata also uses for a geographic item
            more than FAR_KM away (e.g. Argentière, Haute-Savoie for Kimolos).
Run by hand; the output is committed as a cache with sources and build date.
World Historical Gazetteer was not used: its API returned 403 'Bot access
denied' to this client on 2026-10-29.
"""
import datetime
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
GAZ = ROOT / 'data/gazetteer/mediterranean_gazetteer.v1.json'
REGIONS = ROOT / 'data/gazetteer/region_context_terms.v1.json'
OUT = ROOT / 'data/gazetteer/place_context.v1.json'
API = 'https://www.wikidata.org/w/api.php'
UA = {'User-Agent': 'GERAKI-NABOU-Historical-Research/1.0 (+https://github.com/Lepe12/geraki-historical-atlas)'}
LANGS = 'el|en|fr|it|es|de|tr|la'
PROPS = ('P706', 'P131', 'P361', 'P206', 'P47')
NEARBY_KM, FAR_KM = 40, 60


def get(params):
    url = API + '?' + urllib.parse.urlencode({**params, 'format': 'json'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except Exception:
            time.sleep(2 * (attempt + 1))
    return {}


def entities(ids, props):
    out = {}
    ids = sorted(set(ids))
    for i in range(0, len(ids), 50):
        out.update(get({'action': 'wbgetentities', 'ids': '|'.join(ids[i:i + 50]), 'props': props,
                        'languages': LANGS}).get('entities', {}))
        time.sleep(0.2)
    return out


def names_of(entity):
    names = [v['value'] for v in (entity.get('labels') or {}).values()]
    names += [a['value'] for vs in (entity.get('aliases') or {}).values() for a in vs]
    return usable(names)


def usable(names):
    out = []
    for n in names:
        n = n.strip()
        if n and 1 <= len(n.split()) <= 3 and not any(c.isdigit() for c in n) and n not in out:
            out.append(n)
    return out


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a['lat'], a['lon'], b['lat'], b['lon']))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def coord(entity):
    for c in (entity.get('claims') or {}).get('P625', []):
        v = ((c.get('mainsnak') or {}).get('datavalue') or {}).get('value')
        if v:
            return {'lat': v['latitude'], 'lon': v['longitude']}
    return None


def targets(entity, prop):
    out = []
    for c in (entity.get('claims') or {}).get(prop, []):
        v = ((c.get('mainsnak') or {}).get('datavalue') or {}).get('value')
        if isinstance(v, dict) and v.get('id'):
            out.append(v['id'])
    return out


def clean_context(names, exclude=()):
    """Drop context entries that cannot disambiguate: codes/acronyms, one-word
    names under 4 letters, abbreviations, and the curated exclusion list."""
    from place_resolver import fold
    bad = {fold(n) for n in exclude}
    out = []
    for n in names:
        letters = [c for c in n if c.isalpha()]
        if fold(n) in bad or '.' in n or not letters:
            continue
        if len(n.split()) == 1 and len(letters) < 4:
            continue
        if n.upper() == n and len(letters) <= 5:
            continue
        out.append(n)
    return out


def apply_curation(result, curated):
    """Curated per-place extras (Wikidata labels) and exclusions, re-runnable
    on the committed cache with --refilter (no full rebuild)."""
    from place_resolver import fold
    exclude = curated.get('context_exclude', {}).get('names', [])
    extras = curated.get('place_extras', {})
    extra_entities = entities([x['wikidata'] for xs in extras.values() for x in xs], 'labels|aliases') if extras else {}
    for pid, entry in result.items():
        for x in extras.get(pid, []):
            for n in names_of(extra_entities.get(x['wikidata']) or {}):
                if n not in entry['context'] and fold(n) not in {fold(m) for m in entry['names']}:
                    entry['context'].append(n)
                    entry['context_sources'].append({'name': n, 'basis': 'CURATED_PLACE_EXTRA_WIKIDATA_LABEL', 'source': x['source']})
        keep = set(clean_context(entry['context'], exclude))
        entry['context'] = [n for n in entry['context'] if n in keep]
        entry['context_sources'] = [s for s in entry['context_sources'] if s['name'] in keep]
    return result


def write(result):
    OUT.write_text(json.dumps({'schema': 'pct-place-context-v1', 'built_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
                               'builder': 'tools/build_place_context.py', 'sources': ['Wikidata (CC0)', str(REGIONS.relative_to(ROOT))],
                               'nearby_km': NEARBY_KM, 'far_km': FAR_KM,
                               'role': 'DISAMBIGUATION_CONTEXT_ONLY_NOT_EVIDENCE', 'places': result},
                              ensure_ascii=False, indent=1) + '\n')


def main():
    if '--refilter' in sys.argv:
        write(apply_curation(json.loads(OUT.read_text())['places'], json.loads(REGIONS.read_text())))
        return
    from place_resolver import fold
    from search_priority import search_name_variants, names_only
    places = json.loads(GAZ.read_text())['places']
    regions = json.loads(REGIONS.read_text())['regions']
    main_entities = entities([p['wikidata'] for p in places if p.get('wikidata')], 'claims')
    linked = {q for e in main_entities.values() for prop in PROPS for q in targets(e, prop)}
    linked_entities = entities(linked, 'labels|aliases')
    result = {}
    for p in places:
        qid = p.get('wikidata')
        e = main_entities.get(qid) or {}
        here = p.get('coordinates') or coord(e)
        context, sources = [], []
        for prop in PROPS:
            for q in targets(e, prop):
                for n in names_of(linked_entities.get(q) or {}):
                    if n not in context:
                        context.append(n); sources.append({'name': n, 'basis': f'WIKIDATA_{prop}', 'source': f'https://www.wikidata.org/wiki/{q}'})
                for region in regions:
                    if prop == 'P206' and q == region['wikidata']:
                        for n in region['terms']:
                            if n not in context:
                                context.append(n); sources.append({'name': n, 'basis': 'CURATED_REGION_TERM', 'source': region['source']})
        for other in places:
            oc = other.get('coordinates')
            if other is p or not (here and oc) or km(here, oc) > NEARBY_KM:
                continue
            for v in other.get('variants', []):
                n = v.get('name', '')
                if v.get('status') == 'SOURCED' and n and n not in context and len(usable([n])) == 1:
                    context.append(n); sources.append({'name': n, 'basis': 'GAZETTEER_NEARBY_%dKM' % round(km(here, oc)), 'source': v.get('source', '')})
        own = names_only(search_name_variants(p['modern_name'].get('el') or p['seed_title'], [p['seed_title']]))
        own_folded = {fold(n) for n in own}
        context = [n for n in context if fold(n) not in own_folded]
        sources = [s for s in sources if fold(s['name']) not in own_folded]
        ambiguous = {}
        for n in own:
            if any('\u0370' <= c <= '\u03ff' for c in n):
                continue
            hits = []
            for lang in ('en', 'fr'):
                r = get({'action': 'wbsearchentities', 'search': n, 'language': lang, 'type': 'item', 'limit': 10})
                hits += [h['id'] for h in r.get('search', []) if h.get('id') != qid and fold(h.get('match', {}).get('text', '')) == fold(n)]
                time.sleep(0.1)
            if not hits:
                continue
            far = []
            for hid, he in entities(hits, 'claims').items():
                c = coord(he)
                if c and here and km(here, c) > FAR_KM:
                    far.append({'wikidata': hid, 'km': round(km(here, c))})
            if far:
                ambiguous[n] = sorted(far, key=lambda x: x['km'])[:5]
        result[p['id']] = {'wikidata': qid, 'names': own, 'context': context, 'context_sources': sources,
                           'ambiguous_names': ambiguous}
        print(p['seed_title'], len(context), sorted(ambiguous), flush=True)
    write(apply_curation(result, json.loads(REGIONS.read_text())))

if __name__ == '__main__':
    main()
