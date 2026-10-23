#!/usr/bin/env python3
"""Build data/gazetteer/mediterranean_gazetteer.v1.json from Wikidata (CC0).

Offline-maintenance tool, never run by the research pipeline or CI.
Every coordinate and variant name is copied from the Wikidata entity it cites
(labels, aliases, P2561 name, P1448 official name, P625 coordinates); nothing
is typed by hand. The seed list holds only lookup keys (English Wikipedia
titles) and why each place was seeded; it asserts no historical fact.
GeoNames (P1566) and Pleiades (P1584) identifiers are copied as cross-references
only; no GeoNames/Pleiades data is copied.
"""
import datetime, json, sys, urllib.parse, urllib.request
from pathlib import Path

API = 'https://www.wikidata.org/w/api.php'
UA = 'geraki-historical-atlas-gazetteer/1 (https://github.com/Lepe12/geraki-historical-atlas)'
LANGS = ['el', 'grc', 'en', 'it', 'vec', 'fr', 'es', 'ca', 'pt', 'de', 'nl', 'la', 'tr']
OUT = Path(__file__).resolve().parent.parent / 'data' / 'gazetteer' / 'mediterranean_gazetteer.v1.json'
EVIDENCE, EVAL, USER = 'APPEARS_IN_STORED_EVIDENCE', 'APPEARS_IN_EVAL_SET', 'USER_SUPPLIED_SEED_LIST'
CORSAIR_SEED = 'USER_SUPPLIED_CORSAIR_HUB_SEED_NOT_A_SOURCED_ASSERTION'
SEEDS = {
    'Milos': [EVIDENCE, EVAL, USER], 'Kimolos': [USER], 'Kythira': [USER], 'Heraklion': [USER], 'Crete': [USER],
    'Chalcis': [USER], 'Euboea': [USER], 'Zakynthos': [USER], 'Mani Peninsula': [USER], 'Oitylo': [USER],
    'Sapientza': [USER], 'Algiers': [USER, CORSAIR_SEED], 'Salé': [USER, CORSAIR_SEED],
    'Istanbul': [EVIDENCE, EVAL], 'Constantinople': [EVIDENCE, EVAL], 'Lidoriki': [EVAL], 'Phocis': [EVAL],
    'Aetolia-Acarnania': [EVIDENCE], 'Aegean Sea': [EVIDENCE], 'Ionian Sea': [EVIDENCE],
    'La Ciotat': [EVIDENCE], 'Marseille': [EVIDENCE], 'Santorini': [USER], 'Fira': [USER],
    'Tunis': [CORSAIR_SEED], 'Tripoli, Libya': [CORSAIR_SEED], 'Tripoli, Lebanon': [USER], 'Malta': [CORSAIR_SEED],
    'Valletta': [CORSAIR_SEED], 'Livorno': [CORSAIR_SEED], 'Chios': [USER], 'Naxos': [USER], 'Paros': [USER],
    'Antiparos': [USER], 'Mykonos': [USER], 'Ios': [USER], 'Sifnos': [USER], 'Kea (island)': [USER],
    'elwiki:Άνδρος': [USER], 'Rhodes': [USER], 'Cyprus': [USER], 'Corfu': [USER], 'Lefkada': [USER],
    'Methoni, Messenia': [USER], 'Koroni': [USER], 'Nafplio': [USER], 'Monemvasia': [USER], 'Nafpaktos': [USER],
    'Patras': [USER], 'İzmir': [USER], 'Alexandria': [USER], 'Venice': [USER], 'Toulon': [EVIDENCE],
    'Bizerte': [CORSAIR_SEED], 'Djerba': [USER], 'Samos': [USER], 'Lesbos': [USER], 'Kos': [USER], 'Patmos': [USER],
    'elwiki:Μύτικας Αιτωλοακαρνανίας': [EVIDENCE], 'elwiki:Κεφαλονιά': [USER],
}
# Names the user listed. Each is kept only if the cited entity carries it;
# otherwise it is recorded as UNSOURCED and never used for matching.
USER_VARIANTS = {'Milos': ['Milo', 'Mili'], 'Kythira': ['Cerigo'], 'Heraklion': ['Candia', 'Candie'], 'Crete': ['Candia', 'Candie'],
    'Euboea': ['Negroponte'], 'Chalcis': ['Negroponte'], 'Zakynthos': ['Zante'], 'Mani Peninsula': ['Brazzo di Maina'],
    'Oitylo': ['Vitylo'], 'Kimolos': ['Argentiera'], 'Sapientza': ['Sapienza'], 'Algiers': ['Algiers', 'Alger', 'Argel'],
    'Salé': ['Salé'], 'Santorini': ['Santorin']}


def get(params):
    url = API + '?' + urllib.parse.urlencode({**params, 'format': 'json'})
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
        return json.load(r)


def monolingual(entity, prop):
    out = []
    for st in entity.get('claims', {}).get(prop, []):
        v = (st.get('mainsnak', {}).get('datavalue') or {}).get('value')
        if not isinstance(v, dict) or 'text' not in v:
            continue
        q = st.get('qualifiers', {})
        t = lambda p: ((q.get(p) or [{}])[0].get('datavalue') or {}).get('value', {}).get('time')
        out.append((v['text'], v.get('language'), {'start': t('P580'), 'end': t('P582')}))
    return out


def ident(entity, prop):
    vals = [((s.get('mainsnak') or {}).get('datavalue') or {}).get('value') for s in entity.get('claims', {}).get(prop, [])]
    return [v for v in vals if isinstance(v, str)]


def entry(title, entity):
    qid = entity['id']; src = f'https://www.wikidata.org/wiki/{qid}'
    coords = None
    for st in entity.get('claims', {}).get('P625', []):
        v = (st.get('mainsnak', {}).get('datavalue') or {}).get('value')
        if v and st.get('rank') != 'deprecated':
            coords = {'lat': v['latitude'], 'lon': v['longitude'], 'source': src + '#P625', 'property': 'P625'}
            if st.get('rank') == 'preferred':
                break
    variants, seen = [], set()
    def add(name, lang, kind, period=None):
        key = (name.casefold(), lang)
        if name and key not in seen:
            seen.add(key)
            variants.append({'name': name, 'lang': lang, 'kind': kind, 'period': period, 'source': src, 'status': 'SOURCED'})
    for lang in LANGS:
        if lang in entity.get('labels', {}):
            add(entity['labels'][lang]['value'], lang, 'wikidata_label')
        for a in entity.get('aliases', {}).get(lang, []):
            add(a['value'], lang, 'wikidata_alias')
    for prop, kind in (('P2561', 'wikidata_P2561_name'), ('P1448', 'wikidata_P1448_official_name')):
        for text, lang, period in monolingual(entity, prop):
            add(text, lang, kind, period if any(period.values()) else None)
    label = lambda l: (entity.get('labels', {}).get(l) or {}).get('value')
    return {'id': 'gz:' + qid, 'wikidata': qid, 'wikidata_revision': entity.get('lastrevid'),
            'seed_title': title, 'modern_name': {'el': label('el'), 'en': label('en')},
            'coordinates': coords, 'cross_references': {'geonames': ident(entity, 'P1566'), 'pleiades': ident(entity, 'P1584')},
            'variants': variants}


def main():
    entries = []; missing = []; unsourced = []
    for site in ('enwiki', 'elwiki'):
      titles = [t for t in SEEDS if (t.startswith('elwiki:')) == (site == 'elwiki')]
      for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        data = get({'action': 'wbgetentities', 'sites': site, 'titles': '|'.join(t.split(':', 1)[-1] for t in chunk),
                    'props': 'labels|aliases|claims|sitelinks', 'languages': '|'.join(LANGS), 'sitefilter': site})
        by_title = {}
        for e in data.get('entities', {}).values():
            if 'missing' in e:
                missing.append(e.get('title')); continue
            by_title[(site + ':' if site == 'elwiki' else '') + e['sitelinks'][site]['title']] = e
        for t in chunk:
            e = by_title.get(t)
            if e is None:
                if t not in missing: missing.append(t)
                continue
            row = entry(t, e); row['seed_reasons'] = [s for s in SEEDS[t] if s != CORSAIR_SEED]
            if CORSAIR_SEED in SEEDS[t]:
                row['corsair_base_candidate'] = {'status': 'CANDIDATE_ONLY_NOT_A_FACT', 'source_note': CORSAIR_SEED,
                    'rule': 'Never shown as fact; a base label needs a supported, cited claim id.'}
            for name in USER_VARIANTS.get(t, []):
                if not any(v['name'] == name for v in row['variants']):
                    unsourced.append({'name': name, 'proposed_for': row['id'], 'status': 'UNSOURCED',
                                      'reason': 'User-supplied; not carried by the cited Wikidata entity at build time; never used for matching.'})
            entries.append(row)
    doc = {'schema': 'geraki-gazetteer-v1', 'built_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'builder': 'tools/build_gazetteer.py', 'scope': 'Eastern and Central Mediterranean (seed list)',
           'licences': {'wikidata': 'CC0 1.0 (labels, aliases, names, coordinates copied)',
                        'geonames': 'CC BY 4.0 (identifiers only, no data copied)',
                        'pleiades': 'CC BY 3.0 (identifiers only, no data copied)'},
           'rules': ['Coordinates and variants are copied from the cited Wikidata entity; none are typed by hand.',
                     'Variants with status UNSOURCED are never used for matching.',
                     'The gazetteer never asserts that a place was a corsair base.'],
           'unresolved_seeds': missing, 'unsourced_variants': unsourced, 'places': entries}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('places', len(entries), 'variants', sum(len(e['variants']) for e in entries), 'missing', missing, 'unsourced', [(u['name'], u['proposed_for']) for u in unsourced])


if __name__ == '__main__':
    sys.exit(main())
