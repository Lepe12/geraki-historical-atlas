#!/usr/bin/env python3
"""More open collections for NABOU//X: Gallica (BnF), Europeana and HathiTrust,
with the same historical place-name aliases as open_collections.py.

Only official, documented APIs are called (checked 2026-10-29):

* Gallica: the BnF catalogue SRU API (https://catalogue.bnf.fr/api/SRU) with the
  documented index ``bib.digitized all "freeAccess"`` ("digitized documents freely
  online (Gallica)"). Each record's UNIMARC 856$u gives the gallica.bnf.fr/ark: URL.
  gallica.bnf.fr/SRU itself is not called: gallica.bnf.fr/robots.txt disallows
  ``/*?`` (every URL with a query string) for all agents, and it answers scripts
  with a Cloudflare challenge. catalogue.bnf.fr/robots.txt allows the API
  (Crawl-delay 5, so this connector waits 5 s between requests).
* Europeana: the Search API (https://api.europeana.eu/record/v2/search.json).
  Needs a key in EUROPEANA_API_KEY. Without it the connector makes no request and
  returns API_KEY_REQUIRED. ``--demo-key`` uses Europeana's public demo key
  ``api2demo`` (used in Europeana's own API docs), for smoke tests only.
* HathiTrust: the Bibliographic API (https://catalog.hathitrust.org/api/volumes/brief/json/...),
  which HathiTrust documents as a lookup API, not a search API (max 20 ids/request).
  HathiTrust has no official search API: the Data API was retired on 2024-07-17,
  the full-text search (babel.hathitrust.org/cgi/ls) is a web interface behind a
  Cloudflare challenge, and the Acceptable Use Policy forbids automated retrieval
  outside HathiFiles/Datasets. So the "search" is: Internet Archive advanced search
  (official API) for texts that carry an OCLC number, then a Bib API lookup of those
  OCLC numbers. A HathiTrust hit therefore means "this IA-catalogued book is also in
  HathiTrust", with its rights (Full view / Limited) and volume links.

Every record copies catalogue metadata as returned; unknown fields stay empty.
A hit is a DISCOVERY_ONLY lead, never a verified source statement.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
for p in (str(HERE), str(HERE.parent)):
    if p not in sys.path:
        sys.path.insert(0, p)

import open_collections as oc  # noqa: E402

POLICY = 'nabou-open-collections-extra-v1'
BNF_SRU = 'https://catalogue.bnf.fr/api/SRU'
GALLICA_HOSTS = ('gallica.bnf.fr',)
EUROPEANA_SEARCH = 'https://api.europeana.eu/record/v2/search.json'
EUROPEANA_DEMO_KEY = 'api2demo'  # public demo key from Europeana's API documentation
HT_BIB = 'https://catalog.hathitrust.org/api/volumes/brief/json/'
HT_BATCH = 20
NS = {'srw': 'http://www.loc.gov/zing/srw/', 'mxc': 'info:lc/xmlns/marcxchange-v2',
      'diag': 'http://www.loc.gov/zing/srw/diagnostic/'}
# UNIMARC leader position 6 (type of record), labels as in the BnF catalogue.
UNIMARC_TYPE = {'a': 'texte imprimé', 'b': 'texte manuscrit', 'c': 'partition imprimée',
                'd': 'partition manuscrite', 'e': 'document cartographique imprimé',
                'f': 'document cartographique manuscrit', 'g': 'vidéo', 'i': 'enregistrement sonore',
                'j': 'enregistrement sonore musical', 'k': 'image fixe', 'l': 'ressource électronique',
                'm': 'multimédia', 'r': 'objet'}

SOURCES = {
    'gallica': {'connector_id': 'gallica_bnf_digitized', 'source_name': 'Gallica (BnF)',
                'default_years': (1450, 1900)},
    'europeana': {'connector_id': 'europeana_search', 'source_name': 'Europeana',
                  'default_years': (1450, 1900)},
    'hathitrust': {'connector_id': 'hathitrust_bib', 'source_name': 'HathiTrust Digital Library',
                   'default_years': (1450, 1900)},
}


def _flat(values):
    for v in values if isinstance(values, list) else [values]:
        if isinstance(v, dict):  # Europeana language maps, e.g. {'def': ['Cerigotto']}
            for inner in v.values():
                yield from _flat(inner)
        elif isinstance(v, list):
            yield from _flat(v)
        elif v is not None:
            yield v


def _uniq(values):
    out = []
    for v in _flat(values):
        v = str(v).strip()
        if v and v not in out:
            out.append(v)
    return out


def _base(source, alias, search_query, **fields):
    rec = {'source_name': SOURCES[source]['source_name'], 'connector_id': SOURCES[source]['connector_id'],
           'identifier': '', 'title': '', 'creator': '', 'date': '', 'year': '', 'item_url': '',
           'archive_url': '', 'mediatype': '', 'coverage': '', 'language': '', 'data_provider': '',
           'rights': '', 'iiif_manifest': '',
           'matched_query': alias.get('query', alias['name']), 'matched_alias': alias['name'],
           'alias_basis': alias['basis'], 'alias_source': alias['source'],
           'search_query': search_query, 'query_mode': 'plain',
           'evidence_level': 'DISCOVERY_ONLY', 'verified': False}
    rec.update(fields)
    return rec


# ---------------------------------------------------------------- Gallica (BnF catalogue SRU)
def gallica_cql(name, year_from=None, year_to=None):
    q = 'bib.anywhere all ' + oc._phrase(name) + ' and bib.digitized all "freeAccess"'
    if year_from or year_to:
        q += f' and bib.publicationdate within "{int(year_from or 0)} {int(year_to or 9999)}"'
    return q


def gallica_url(cql, rows=25, start=1):
    return BNF_SRU + '?' + urllib.parse.urlencode({
        'version': '1.2', 'operation': 'searchRetrieve', 'query': cql,
        'recordSchema': 'unimarcXchange', 'maximumRecords': str(int(rows)), 'startRecord': str(int(start))})


def _subfields(record, tag, code):
    return [sf.text or '' for df in record.findall(f"mxc:datafield[@tag='{tag}']", NS)
            for sf in df.findall(f"mxc:subfield[@code='{code}']", NS)]


def gallica_iiif(url):
    m = re.search(r'/ark:/12148/([A-Za-z0-9]+)', url or '')
    # Documented Gallica IIIF Presentation pattern; built from the ark, not fetched.
    return f'https://gallica.bnf.fr/iiif/ark:/12148/{m.group(1)}/manifest.json' if m else ''


def parse_gallica(text):
    """(numberOfRecords, [record dicts]) from an SRU unimarcXchange response."""
    root = ET.fromstring(text.encode('utf-8') if isinstance(text, str) else text)
    # Only a top-level diagnostic means the query failed. BnF also sends per-record (surrogate)
    # diagnostics, e.g. info:srw/diagnostic/1/131 'erreur de traitement', inside recordData when it
    # cannot render one record; those records carry no metadata and are skipped, not invented.
    if root.find('srw:diagnostics/diag:diagnostic', NS) is not None:
        raise ValueError('API_SCHEMA_MISMATCH')
    n = root.findtext('srw:numberOfRecords', default='', namespaces=NS)
    if n == '' and root.tag != '{%s}searchRetrieveResponse' % NS['srw']:
        raise ValueError('API_SCHEMA_MISMATCH')
    out = []
    for rec in root.findall('.//mxc:record', NS):
        ark = rec.get('id') or ''
        leader = rec.findtext('mxc:leader', default='', namespaces=NS)
        catalogue = rec.findtext("mxc:controlfield[@tag='003']", default='', namespaces=NS)
        title = ' : '.join(x for x in (' ; '.join(_uniq(_subfields(rec, '200', 'a'))), ' : '.join(_uniq(_subfields(rec, '200', 'e')))) if x)
        creators = []
        for tag in ('700', '701', '702', '710', '711', '712'):
            for df in rec.findall(f"mxc:datafield[@tag='{tag}']", NS):
                a = df.findtext("mxc:subfield[@code='a']", default='', namespaces=NS)
                b = df.findtext("mxc:subfield[@code='b']", default='', namespaces=NS)
                if a:
                    creators.append(a + (', ' + b if b else ''))
        gallica = [u for u in _subfields(rec, '856', 'u')
                   if urllib.parse.urlsplit(u).hostname in GALLICA_HOSTS]
        gallica = [urllib.parse.urlunsplit(('https',) + tuple(urllib.parse.urlsplit(u)[1:])) for u in gallica]
        out.append({
            'identifier': ark,
            'title': title,
            'creator': '; '.join(_uniq(creators)),
            'responsibility': '; '.join(_uniq(_subfields(rec, '200', 'f'))),
            'date': '; '.join(_uniq(_subfields(rec, '210', 'd') + _subfields(rec, '214', 'd'))),
            'item_url': gallica[0] if gallica else '',
            'gallica_urls': gallica,
            'archive_url': catalogue.replace('http://', 'https://', 1) if catalogue else '',
            'mediatype': UNIMARC_TYPE.get(leader[6:7], '') if len(leader) > 6 else '',
            'coverage': '; '.join(_uniq(_subfields(rec, '607', 'a'))),
            'language': '; '.join(_uniq(_subfields(rec, '101', 'a'))),
            'data_provider': 'Bibliothèque nationale de France',
            'iiif_manifest': gallica_iiif(gallica[0]) if gallica else '',
        })
    return (int(n) if n.isdigit() else None), out


def _gallica_query(alias, client, rows, yf, yt):
    cql = gallica_cql(alias['name'], yf, yt)
    text, cached = client.get_text(gallica_url(cql, rows), SOURCES['gallica']['connector_id'])
    total, docs = parse_gallica(text)
    recs = [_base('gallica', alias, cql, **d) for d in docs]
    return cql, total, recs, cached


# ---------------------------------------------------------------- Europeana Search API
def europeana_key(demo=False):
    key = os.getenv('EUROPEANA_API_KEY', '').strip()
    return key or (EUROPEANA_DEMO_KEY if demo else '')


def europeana_params(name, year_from=None, year_to=None, rows=25):
    params = [('query', oc._phrase(name)), ('rows', str(int(rows))), ('profile', 'standard')]
    if year_from or year_to:
        params.append(('qf', f'YEAR:[{int(year_from or 0)} TO {int(year_to or 9999)}]'))
    return params


def europeana_url(params, key):
    return EUROPEANA_SEARCH + '?' + urllib.parse.urlencode(params + [('wskey', key)])


def _clean_link(url):
    """Europeana adds utm_* tracking (incl. the key name) to guid; keep the plain item URL."""
    parts = urllib.parse.urlsplit(str(url or ''))
    if parts.scheme not in ('http', 'https'):
        return ''
    q = [(k, v) for k, v in urllib.parse.parse_qsl(parts.query) if not k.startswith('utm_')]
    return urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(q)))


def scrub_key(value, key):
    """Europeana echoes the key ('apikey', every item 'link'); mask it before anything is cached or kept."""
    if not key:
        return value
    if isinstance(value, dict):
        return {k: scrub_key(v, key) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub_key(v, key) for v in value]
    if isinstance(value, str) and key in value:
        return value.replace(key, 'REDACTED')
    return value


def parse_europeana(data):
    if not isinstance(data, dict) or data.get('success') is not True or not isinstance(data.get('items', []), list):
        raise ValueError('API_SCHEMA_MISMATCH')
    out = []
    for it in data.get('items', []):
        out.append({
            'identifier': str(it.get('id') or ''),
            'title': '; '.join(_uniq(it.get('title') or [])),
            'creator': '; '.join(_uniq(it.get('dcCreator') or [])),
            'year': '; '.join(_uniq(it.get('year') or [])),
            'item_url': _clean_link(it.get('guid')),
            'archive_url': '; '.join(_uniq(it.get('edmIsShownAt') or [])),
            'mediatype': str(it.get('type') or ''),
            'coverage': '; '.join(_uniq(it.get('edmPlaceLabel') or [])),
            'language': '; '.join(_uniq(it.get('dcLanguage') or it.get('language') or [])),
            'data_provider': '; '.join(_uniq(it.get('dataProvider') or [])),
            'rights': '; '.join(_uniq(it.get('rights') or [])),
        })
    return data.get('totalResults'), out


def _europeana_query(alias, client, rows, yf, yt, key):
    params = europeana_params(alias['name'], yf, yt, rows)
    shown = urllib.parse.urlencode(params)
    data, cached = client.get_json(europeana_url(params, key), SOURCES['europeana']['connector_id'],
                                   scrub=lambda d: scrub_key(d, key))
    total, docs = parse_europeana(data)
    return shown, total, [_base('europeana', alias, shown, **d) for d in docs], cached


# ---------------------------------------------------------------- HathiTrust (IA OCLC -> Bib API)
def _digits(v):
    return ''.join(c for c in str(v) if c.isdigit())


def hathitrust_ia_query(name, year_from=None, year_to=None):
    q = f'mediatype:texts AND ({oc._phrase(name)}) AND oclc-id:*'
    if year_from or year_to:
        q += f' AND year:[{int(year_from or 0)} TO {int(year_to or 9999)}]'
    return q


def hathitrust_ia_url(q, rows=25):
    fields = ['identifier', 'title', 'creator', 'year', 'oclc-id']
    params = [('q', q)] + [('fl[]', f) for f in fields] + [('rows', str(int(rows))), ('page', '1'), ('output', 'json')]
    return oc.IA_SEARCH + '?' + urllib.parse.urlencode(params)


def hathitrust_bib_url(oclcs):
    return HT_BIB + '|'.join('oclc:' + o for o in oclcs)


def parse_hathitrust(bib, ia_by_oclc):
    """One record per HathiTrust catalogue record found for the OCLC numbers."""
    if not isinstance(bib, dict):
        raise ValueError('API_SCHEMA_MISMATCH')
    out, seen = [], set()
    for spec, block in bib.items():
        oclc = _digits(spec)
        recs = block.get('records') if isinstance(block, dict) else None
        if not recs:
            continue
        items = block.get('items') or []
        for number, rec in recs.items():
            if number in seen:
                continue
            seen.add(number)
            mine = [i for i in items if i.get('fromRecord') == number]
            full = [i for i in mine if i.get('usRightsString') == 'Full view']
            ia = ia_by_oclc.get(oclc, {})
            out.append({
                'identifier': 'hathitrust:' + number,
                'title': '; '.join(_uniq((rec.get('titles') or [])[:1])),
                'date': '; '.join(_uniq(rec.get('publishDates') or [])),
                'item_url': rec.get('recordURL') or '',
                'archive_url': (oc.IA_DETAILS + urllib.parse.quote(ia['identifier'], safe='')) if ia.get('identifier') else '',
                'creator': oc._text(ia.get('creator')),
                'mediatype': 'texts',
                'rights': 'Full view' if full else ('Limited (search only)' if mine else ''),
                'oclc': oclc,
                'full_view_volumes': len(full),
                'volumes': [{'htid': i.get('htid', ''), 'url': i.get('itemURL', ''), 'rights': i.get('usRightsString', ''),
                             'enumcron': i.get('enumcron') or '', 'holding_library': i.get('orig', '')} for i in mine],
                'data_provider': 'HathiTrust',
                'discovered_via': 'Internet Archive advancedsearch (oclc-id) -> HathiTrust Bibliographic API',
            })
    return out


def _hathitrust_query(alias, client, rows, yf, yt):
    q = hathitrust_ia_query(alias['name'], yf, yt)
    cid = SOURCES['hathitrust']['connector_id']
    data, cached = client.get_json(hathitrust_ia_url(q, rows), 'internet_archive_texts')
    resp = data.get('response') if isinstance(data, dict) else None
    if not isinstance(resp, dict) or not isinstance(resp.get('docs'), list):
        raise ValueError('API_SCHEMA_MISMATCH')
    ia_by_oclc, order = {}, []
    for doc in resp['docs']:
        vals = doc.get('oclc-id')
        for v in (vals if isinstance(vals, list) else [vals]):
            o = _digits(v or '')
            if o and o not in ia_by_oclc:
                ia_by_oclc[o] = doc
                order.append(o)
    recs = []
    for i in range(0, len(order), HT_BATCH):
        bib, c2 = client.get_json(hathitrust_bib_url(order[i:i + HT_BATCH]), cid)
        cached = cached and c2
        recs += [_base('hathitrust', alias, q, **d) for d in parse_hathitrust(bib, ia_by_oclc)]
    return q, {'ia_num_found': resp.get('numFound'), 'oclc_looked_up': len(order)}, recs, cached


# ---------------------------------------------------------------- shared driver
def search_source(source, names, client, rows=25, year_from=None, year_to=None, demo_key=False):
    queries, records, index = [], [], {}
    key = europeana_key(demo_key) if source == 'europeana' else ''
    if source == 'europeana' and not key:
        return {'status': 'API_KEY_REQUIRED', 'hit_count': 0, 'request_performed': False,
                'queries': [{'alias': a['name'], 'status': 'API_KEY_REQUIRED'} for a in names],
                'detail': 'Set EUROPEANA_API_KEY (free key: https://pro.europeana.eu/page/get-api).'}, []
    for alias in names:
        row = {'alias': alias['name'], 'mode': 'plain'}
        try:
            if source == 'gallica':
                q, total, recs, cached = _gallica_query(alias, client, rows, year_from, year_to)
            elif source == 'europeana':
                q, total, recs, cached = _europeana_query(alias, client, rows, year_from, year_to, key)
            else:
                q, total, recs, cached = _hathitrust_query(alias, client, rows, year_from, year_to)
            row.update(q=q, status='EXECUTED', cached=cached, returned=len(recs))
            if isinstance(total, dict):
                row.update(total)
            else:
                row['num_found'] = total
            for rec in recs:
                if not rec['identifier']:
                    continue
                if rec['identifier'] in index:
                    prior = index[rec['identifier']]
                    if alias['name'] not in prior['matched_aliases']:
                        prior['matched_aliases'].append(alias['name'])
                    continue
                rec['matched_aliases'] = [alias['name']]
                index[rec['identifier']] = rec
                records.append(rec)
        except Exception as error:  # recorded, never raised; no retry on 429/403
            if isinstance(error, (ValueError, ET.ParseError)) and (str(error) == 'API_SCHEMA_MISMATCH' or isinstance(error, ET.ParseError)):
                status, code = 'API_SCHEMA_MISMATCH', 'API_SCHEMA_MISMATCH'
            else:
                status, code = oc._error_status(error)
            row.update(status=status, error_code=code)
        queries.append(row)
    ok = [r for r in queries if r['status'] == 'EXECUTED']
    if len(ok) == len(queries):
        status = 'EXECUTED'
    elif ok:
        status = 'PARTIAL'
    else:
        failed = {r['status'] for r in queries}
        status = 'REMOTE_RATE_LIMITED' if 'REMOTE_RATE_LIMITED' in failed else sorted(failed)[0] if failed else 'EXECUTED'
    return {'status': status, 'queries': queries, 'hit_count': len(records)}, records


def search(query, sources=tuple(SOURCES), client=None, rows=25, year_from=None, year_to=None, max_names=5,
           expand_aliases=True, knowledge_path=oc.KNOWLEDGE, gazetteer=None, all_years=False, demo_key=False):
    if not str(query or '').strip():
        raise ValueError('Search query must not be empty')
    if not 1 <= int(rows) <= 100:
        raise ValueError('rows must be between 1 and 100')
    client = client or oc.Client()
    if expand_aliases:
        names, warnings = oc.place_aliases(query, max_names, knowledge_path, gazetteer)
    else:
        names, warnings = [{'name': query.strip(), 'basis': 'QUERY', 'source': ''}], []
    for n in names:
        n['query'] = query.strip()
    report = {'schema': POLICY, 'retrieved_utc': datetime.now(timezone.utc).isoformat(), 'query': query,
              'aliases': names, 'year_from': year_from, 'year_to': year_to, 'sources': {}, 'records': [],
              'warnings': warnings,
              'notes': ['DISCOVERY_ONLY: catalogue metadata copied as returned; unknown fields left empty.',
                        'Gallica via the BnF catalogue SRU (bib.digitized=freeAccess); gallica.bnf.fr/SRU is '
                        'disallowed by gallica.bnf.fr/robots.txt (/*?) and is not called.',
                        'HathiTrust has no official search API: IA texts with an OCLC number are looked up '
                        'in the HathiTrust Bibliographic API. No HathiTrust full-text search is performed.']}
    if demo_key and not os.getenv('EUROPEANA_API_KEY'):
        report['notes'].append('Europeana queried with the public Europeana demo key (smoke test only).')
    for source in sources:
        if year_from or year_to or all_years:
            yf, yt = year_from, year_to
        else:
            yf, yt = SOURCES[source]['default_years']
        summary, records = search_source(source, names, client, rows, yf, yt, demo_key)
        summary['years'] = [yf, yt]
        report['sources'][source] = summary
        report['records'].extend(records)
    statuses = {s['status'] for s in report['sources'].values()}
    report['status'] = ('EXECUTED' if statuses == {'EXECUTED'} else
                        'PARTIAL' if 'EXECUTED' in statuses or 'PARTIAL' in statuses else sorted(statuses)[0])
    report['hits'] = len(report['records'])
    return report


# ---------------------------------------------------------------- lane adapter
ROUTES = {'gallica': 'GALLICA_VIA_BNF_CATALOGUE_SRU', 'europeana': 'EUROPEANA_SEARCH_API',
          'hathitrust': 'HATHITRUST_BIB_API_VIA_IA_OCLC'}


def lane_search(source, q, lane, client=None, rows=20):
    """repository_connectors-style adapter: (status, records, detail). Lane queries carry their own aliases."""
    client = client or oc.Client()
    names = [{'name': q, 'basis': 'LANE_QUERY', 'source': 'lane_repository_plan', 'query': q}]
    yf, yt = SOURCES[source]['default_years']
    summary, records = search_source(source, names, client, rows=rows, year_from=yf, year_to=yt)
    rows_out = [{**r, 'discovery_repository': r['source_name'], 'discovery_lane': lane, 'connector_status': 'EXECUTED',
                 'url': r['item_url'] or r['archive_url'], 'date': [r['date'] or r['year']] if (r['date'] or r['year']) else [],
                 'acquisition_route': ROUTES[source]} for r in records]
    return summary['status'], rows_out, json.dumps({'policy': POLICY, **summary}, ensure_ascii=False)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('queries', nargs='+')
    p.add_argument('--source', action='append', choices=sorted(SOURCES), help='default: all three')
    p.add_argument('--rows', type=int, default=25)
    p.add_argument('--year-from', type=int)
    p.add_argument('--year-to', type=int)
    p.add_argument('--max-names', type=int, default=5)
    p.add_argument('--no-aliases', action='store_true')
    p.add_argument('--all-years', action='store_true', help='drop the default 1450-1900 window')
    p.add_argument('--demo-key', action='store_true', help="Europeana: use the public demo key 'api2demo' if EUROPEANA_API_KEY is unset")
    p.add_argument('--output')
    a = p.parse_args(argv)
    client = oc.Client()
    runs = [search(q, tuple(a.source or SOURCES), client, a.rows, a.year_from, a.year_to, a.max_names,
                   not a.no_aliases, all_years=a.all_years, demo_key=a.demo_key) for q in a.queries]
    out = runs[0] if len(runs) == 1 else {'schema': POLICY + '-batch', 'status': (
        'EXECUTED' if all(r['status'] == 'EXECUTED' for r in runs) else 'PARTIAL'), 'runs': runs,
        'records': [x for r in runs for x in r['records']]}
    payload = json.dumps(out, ensure_ascii=False, indent=2) + '\n'
    if a.output:
        Path(a.output).write_text(payload, encoding='utf-8')
        print(json.dumps({'status': out['status'], 'output': a.output,
                          'hits': {r['query']: {s: v['hit_count'] for s, v in r['sources'].items()} for r in runs}},
                         ensure_ascii=False))
    else:
        print(payload, end='')
    return 0 if out['status'] in ('EXECUTED', 'PARTIAL', 'API_KEY_REQUIRED') else 1


if __name__ == '__main__':
    sys.exit(main())
