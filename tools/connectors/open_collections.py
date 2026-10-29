#!/usr/bin/env python3
"""Open-collection discovery for NABOU//X: Internet Archive texts and
David Rumsey Map Collection maps, with historical place-name aliases.

Both sources are queried only through the Internet Archive's official,
documented advanced-search API (https://archive.org/advancedsearch.php):

* Internet Archive texts: ``mediatype:texts``.
* David Rumsey maps: the ``david-rumsey-map-collection`` collection on the
  Internet Archive.  Each of its items carries the canonical davidrumsey.com
  record URL in its ``source`` field, which is returned as the item URL.
  davidrumsey.com's own LUNA search API (``/luna/servlet/as/...``) and its
  search pages are disallowed for all user agents in
  https://www.davidrumsey.com/robots.txt, so this module never calls them.

Place-name aliases are never typed here.  They come from:
1. ``knowledge/pirates_bases.md`` ("Παλιά ονόματα τόπων"), the shared,
   historian-curated knowledge file; and
2. the SOURCED variants of the Wikidata-built gazetteer
   (data/gazetteer/mediterranean_gazetteer.v1.json, via tools/place_resolver).
An AMBIGUOUS name (e.g. Candia = Crete or Heraklion) is not expanded.

Every record copies catalogue metadata as returned; unknown fields stay
empty.  A hit is a DISCOVERY_ONLY lead, never a verified source statement.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parent
ROOT = TOOLS.parent
for p in (str(HERE), str(TOOLS)):
    if p not in sys.path:
        sys.path.insert(0, p)

POLICY = 'nabou-open-collections-v1'
IA_SEARCH = 'https://archive.org/advancedsearch.php'
IA_DETAILS = 'https://archive.org/details/'
RUMSEY_COLLECTION = 'david-rumsey-map-collection'
RUMSEY_HOSTS = ('www.davidrumsey.com', 'davidrumsey.com')
KNOWLEDGE = ROOT / 'knowledge' / 'pirates_bases.md'
USER_AGENT = ('GERAKI-NABOU-Historical-Research/1.0 '
              '(+https://github.com/Lepe12/geraki-historical-atlas; scholarly catalogue discovery)')
DEFAULT_TIMEOUT = 25
DEFAULT_CACHE_TTL = 7 * 24 * 3600
FIELDS = ['identifier', 'title', 'creator', 'date', 'year', 'mediatype', 'collection', 'source', 'coverage', 'language']

SOURCES = {
    'internet_archive': {
        'connector_id': 'internet_archive_texts',
        'source_name': 'Internet Archive',
        'base_query': 'mediatype:texts',
        'modes': ('plain', 'topic'),
        # Without a period window a bare place name is swamped by modern namesakes
        # ('Milo' -> 5,039 texts, mostly 20th-century authors named Milo). Override
        # with year_from/year_to, or all_years=True.
        'default_years': (1450, 1900),
    },
    'david_rumsey': {
        'connector_id': 'david_rumsey_maps',
        'source_name': 'David Rumsey Map Collection',
        'base_query': 'collection:' + RUMSEY_COLLECTION,
        # Map titles name places, rarely pirates: a topic filter would remove most maps.
        'modes': ('plain',),
    },
}
# Controlled search vocabulary (query terms only, never record metadata), from the
# same languages as tools/historical_query_expansion.EVENT_TERMS. Whole words only:
# the archive.org advanced search does not expand wildcards (pirat*) into its
# default text field, so 'pirat*' silently returns 0 hits (checked 2026-10-29).
TOPIC_TERMS = ('pirate', 'pirates', 'piracy', 'corsair', 'corsairs', 'corsaire', 'corsaires',
               'corsaro', 'corsari', 'corsario', 'corsarios', 'pirata', 'pirati', 'piratas',
               'privateer', 'privateers', 'forban', 'forbans', 'Seeräuber', 'korsan',
               'πειρατής', 'πειρατές', 'πειρατεία', 'κουρσάρος', 'κουρσάροι')
GREEK = re.compile(r'[\u0370-\u03ff\u1f00-\u1fff]')
LANG_ORDER = ('el', 'it', 'vec', 'fr', 'la', 'en', 'es', 'ca', 'de', 'nl', 'pt', 'tr', 'grc')


# ---------------------------------------------------------------- aliases
def _fold(text):
    from place_resolver import fold
    return fold(text)


def knowledge_aliases(path=KNOWLEDGE):
    """Pairs from the 'Παλιά ονόματα τόπων' section: [(left, right)]."""
    try:
        text = Path(path).read_text(encoding='utf-8')
    except OSError:
        return []
    pairs, inside = [], False
    for line in text.splitlines():
        if line.startswith('## '):
            inside = 'Παλιά ονόματα' in line
            continue
        m = re.match(r'^\s*-\s*(.+?)\s*=\s*(.+?)\s*$', line) if inside else None
        if m:
            pairs.append((m.group(1), m.group(2)))
    return pairs


def _usable_variant(name):
    tokens = name.split()
    # Short, proper-name forms only: drops e.g. 'Mint of Melos', 'Unidad periférica de Milo'.
    return 1 <= len(tokens) <= 2 and all(t[:1].isupper() for t in tokens)


def place_aliases(query, max_names=5, knowledge_path=KNOWLEDGE, gazetteer=None):
    """Search names for a place query, each with its basis. The query itself is first."""
    import place_resolver as pr
    names, warnings, seen = [], [], set()

    def add(name, basis, source):
        k = _fold(name)
        if name and k not in seen:
            seen.add(k)
            names.append({'name': name, 'basis': basis, 'source': source})

    add(query.strip(), 'QUERY', '')
    for left, right in knowledge_aliases(knowledge_path):
        for a, b in ((left, right), (right, left)):
            if _fold(a) == _fold(query):
                add(b, 'KNOWLEDGE_FILE', 'knowledge/pirates_bases.md')
    g = gazetteer or pr.load()
    place_ids = set()
    for item in list(names):
        hit = pr.lookup(item['name'], g)
        if not hit:
            continue
        if hit['status'] != 'RESOLVED':
            warnings.append(f"AMBIGUOUS_PLACE_NAME_NOT_EXPANDED:{item['name']}:{','.join(hit['place_ids'])}")
            continue
        place_ids.update(hit['place_ids'])
    for pid in sorted(place_ids):
        variants = [v for v in g['places'][pid]['variants'] if v.get('status') == 'SOURCED'
                    and len(_fold(v['name']).replace(' ', '')) >= pr.MIN_LEN
                    and v['name'].casefold() not in pr.COMMON_WORD_COLLISIONS and _usable_variant(v['name'])]
        variants.sort(key=lambda v: (v.get('kind') != 'wikidata_label',
                                     LANG_ORDER.index(v['lang']) if v.get('lang') in LANG_ORDER else 99))
        for v in variants:
            add(v['name'], 'GAZETTEER_SOURCED_VARIANT', v.get('source', ''))
    return names[:max(1, max_names)], warnings


def _http_audit():
    # Same module instance as repository_connectors, so audited_dispatch() records receipts.
    try:
        from . import http_audit
    except ImportError:
        import http_audit
    return http_audit


def _rate_limit():
    try:
        from . import connector_rate_limit
    except ImportError:
        import connector_rate_limit
    return connector_rate_limit


# ---------------------------------------------------------------- transport
class Client:
    """Polite GET client: user-agent, timeout, per-connector pacing, disk cache."""

    def __init__(self, cache_dir=None, ttl=DEFAULT_CACHE_TTL, timeout=DEFAULT_TIMEOUT, fetcher=None, pace=True):
        self.cache_dir = Path(cache_dir or os.getenv('NABOU_OPEN_COLLECTIONS_CACHE')
                              or Path(tempfile.gettempdir()) / 'nabou-open-collections-cache')
        self.ttl, self.timeout, self.pace = ttl, timeout, pace
        self.fetcher = fetcher
        self.requests = []

    def _fetch(self, url):
        if self.fetcher:
            return self.fetcher(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'}, timeout=self.timeout)
        return _http_audit().fetch(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'}, timeout=self.timeout)

    def get_json(self, url, connector_id, scrub=None):
        """scrub(data) runs before caching, e.g. to drop an API key a response echoes back."""
        key = hashlib.sha256(url.encode('utf-8')).hexdigest()
        path = self.cache_dir / (key + '.json')
        if self.ttl > 0 and path.is_file() and time.time() - path.stat().st_mtime < self.ttl:
            try:
                data = json.loads(path.read_text(encoding='utf-8'))
                self.requests.append({'url': redact_url(url), 'cached': True})
                return data, True
            except ValueError:
                pass
        if self.pace:
            with _rate_limit().ConnectorLease(connector_id):
                raw = self._fetch(url)
        else:
            raw = self._fetch(url)
        data = json.loads(raw.decode('utf-8', 'replace') if isinstance(raw, bytes) else raw)
        if scrub:
            data = scrub(data)
        self.requests.append({'url': redact_url(url), 'cached': False})
        if self.ttl > 0:
            try:
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                tmp = path.with_suffix('.tmp')
                tmp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
                tmp.replace(path)
            except OSError:
                pass
        return data, False

    def get_text(self, url, connector_id):
        """Same politeness and cache as get_json, for XML APIs (e.g. SRU)."""
        key = hashlib.sha256(url.encode('utf-8')).hexdigest()
        path = self.cache_dir / (key + '.txt')
        if self.ttl > 0 and path.is_file() and time.time() - path.stat().st_mtime < self.ttl:
            self.requests.append({'url': redact_url(url), 'cached': True})
            return path.read_text(encoding='utf-8'), True
        if self.pace:
            with _rate_limit().ConnectorLease(connector_id):
                raw = self._fetch(url)
        else:
            raw = self._fetch(url)
        text = raw.decode('utf-8', 'replace') if isinstance(raw, bytes) else raw
        self.requests.append({'url': redact_url(url), 'cached': False})
        if self.ttl > 0:
            try:
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                tmp = path.with_suffix('.tmp')
                tmp.write_text(text, encoding='utf-8')
                tmp.replace(path)
            except OSError:
                pass
        return text, False


SECRET_PARAMS = re.compile(r'^(?:wskey|api_?key|key|access_token|token|secret|password)$', re.I)


def redact_url(url):
    """URL with API keys masked, for reports and receipts (the real key is never stored)."""
    parts = urllib.parse.urlsplit(str(url))
    if not parts.query:
        return str(url)
    params = [(k, 'REDACTED' if SECRET_PARAMS.match(k) else v)
              for k, v in urllib.parse.parse_qsl(parts.query, keep_blank_values=True)]
    return urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(params)))


def _error_status(error):
    try:
        code = _http_audit().error_code(error)
    except Exception:
        code = type(error).__name__
    if code == 'HTTP_429':
        return 'REMOTE_RATE_LIMITED', code
    if code in ('HTTP_401', 'HTTP_403'):
        return 'REMOTE_ACCESS_BLOCKED', code
    return 'REMOTE_ERROR', code


# ---------------------------------------------------------------- queries
def _phrase(name):
    return '"' + re.sub(r'["\\]', ' ', name).strip() + '"'


def build_query(source, name, mode='plain', year_from=None, year_to=None, topic_terms=TOPIC_TERMS):
    q = f"{SOURCES[source]['base_query']} AND ({_phrase(name)})"
    if mode == 'topic' and topic_terms:
        q += ' AND (' + ' OR '.join(topic_terms) + ')'
    if year_from or year_to:
        q += f" AND year:[{int(year_from or 0)} TO {int(year_to or 9999)}]"
    return q


def search_url(q, rows=25, page=1):
    params = [('q', q)] + [('fl[]', f) for f in FIELDS] + [('rows', str(int(rows))), ('page', str(int(page))), ('output', 'json')]
    return IA_SEARCH + '?' + urllib.parse.urlencode(params)


def _text(value):
    if value is None:
        return ''
    if isinstance(value, list):
        return '; '.join(str(v) for v in value if v not in (None, ''))
    return str(value)


def item_url(source, doc):
    ident = str(doc.get('identifier') or '')
    archive = (IA_DETAILS + urllib.parse.quote(ident, safe='')) if ident else ''
    if source == 'david_rumsey':
        for value in (doc.get('source') if isinstance(doc.get('source'), list) else [doc.get('source')]):
            parts = urllib.parse.urlsplit(str(value or ''))
            if parts.scheme in ('http', 'https') and parts.hostname in RUMSEY_HOSTS and '/luna/servlet/detail/' in parts.path:
                return urllib.parse.urlunsplit(('https',) + tuple(parts[1:])), archive
    return archive, archive


def normalize_doc(source, doc, alias, search_query, mode):
    url, archive = item_url(source, doc)
    return {
        'source_name': SOURCES[source]['source_name'],
        'connector_id': SOURCES[source]['connector_id'],
        'identifier': _text(doc.get('identifier')),
        'title': _text(doc.get('title')),
        'creator': _text(doc.get('creator')),
        'date': _text(doc.get('date')),
        'year': _text(doc.get('year')),
        'item_url': url,
        'archive_url': archive,
        'mediatype': _text(doc.get('mediatype')),
        'coverage': _text(doc.get('coverage')),
        'language': _text(doc.get('language')),
        'matched_query': alias['query'],
        'matched_alias': alias['name'],
        'alias_basis': alias['basis'],
        'alias_source': alias['source'],
        'search_query': search_query,
        'query_mode': mode,
        'evidence_level': 'DISCOVERY_ONLY',
        'verified': False,
    }


def search_source(source, names, client, rows=25, year_from=None, year_to=None, modes=None, topic_terms=TOPIC_TERMS):
    """Run each name (and mode) once; deduplicate by identifier, keeping every matching alias."""
    cid = SOURCES[source]['connector_id']
    queries, records, index = [], [], {}
    for alias in names:
        for mode in (modes or SOURCES[source]['modes']):
            q = build_query(source, alias['name'], mode, year_from, year_to, topic_terms)
            row = {'alias': alias['name'], 'mode': mode, 'q': q}
            try:
                data, cached = client.get_json(search_url(q, rows), cid)
                resp = data.get('response') if isinstance(data, dict) else None
                if not isinstance(resp, dict) or not isinstance(resp.get('docs'), list):
                    raise ValueError('API_SCHEMA_MISMATCH')
                row.update(status='EXECUTED', num_found=resp.get('numFound'), returned=len(resp['docs']), cached=cached)
                for doc in resp['docs']:
                    rec = normalize_doc(source, doc, alias, q, mode)
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
            except Exception as error:  # recorded, never raised: one failed query must not hide others
                if isinstance(error, ValueError) and str(error) == 'API_SCHEMA_MISMATCH':
                    status, code = 'API_SCHEMA_MISMATCH', 'API_SCHEMA_MISMATCH'
                else:
                    status, code = _error_status(error)
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


def search(query, sources=('internet_archive', 'david_rumsey'), client=None, rows=25, year_from=None,
           year_to=None, max_names=5, expand_aliases=True, knowledge_path=KNOWLEDGE, gazetteer=None,
           all_years=False):
    if not str(query or '').strip():
        raise ValueError('Search query must not be empty')
    if not 1 <= int(rows) <= 100:
        raise ValueError('rows must be between 1 and 100')
    client = client or Client()
    if expand_aliases:
        names, warnings = place_aliases(query, max_names, knowledge_path, gazetteer)
    else:
        names, warnings = [{'name': query.strip(), 'basis': 'QUERY', 'source': ''}], []
    for n in names:
        n['query'] = query.strip()
    report = {'schema': POLICY, 'retrieved_utc': datetime.now(timezone.utc).isoformat(), 'query': query,
              'aliases': names, 'year_from': year_from, 'year_to': year_to, 'sources': {}, 'records': [],
              'warnings': warnings,
              'notes': ['DISCOVERY_ONLY: catalogue metadata copied as returned; unknown fields left empty.',
                        'David Rumsey results come from its Internet Archive collection; davidrumsey.com '
                        'search API is disallowed by its robots.txt and is not called.']}
    for source in sources:
        if year_from or year_to or all_years:
            yf, yt = year_from, year_to
        else:
            yf, yt = SOURCES[source].get('default_years', (None, None))
        summary, records = search_source(source, names, client, rows, yf, yt)
        summary['years'] = [yf, yt]
        report['sources'][source] = summary
        report['records'].extend(records)
    statuses = {s['status'] for s in report['sources'].values()}
    report['status'] = ('EXECUTED' if statuses == {'EXECUTED'} else
                        'PARTIAL' if 'EXECUTED' in statuses or 'PARTIAL' in statuses else sorted(statuses)[0])
    report['hits'] = len(report['records'])
    return report


# ---------------------------------------------------------------- lane adapter
def lane_search(source, q, lane, client=None, rows=20):
    """repository_connectors-style adapter: (status, records, detail) for one lane query.

    Lane queries already carry their own aliases/terms, so no expansion here.
    """
    client = client or Client()
    names = [{'name': q, 'basis': 'LANE_QUERY', 'source': 'lane_repository_plan', 'query': q}]
    summary, records = search_source(source, names, client, rows=rows, modes=('plain',))
    rows_out = []
    for r in records:
        rows_out.append({**r, 'discovery_repository': r['source_name'], 'discovery_lane': lane,
                         'connector_status': 'EXECUTED', 'url': r['item_url'],
                         'date': [r['date']] if r['date'] else [],
                         'acquisition_route': 'INTERNET_ARCHIVE' if source == 'internet_archive' else 'DAVID_RUMSEY_VIA_INTERNET_ARCHIVE'})
    return summary['status'], rows_out, json.dumps({'policy': POLICY, **summary}, ensure_ascii=False)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('queries', nargs='+')
    p.add_argument('--source', action='append', choices=sorted(SOURCES), help='default: both')
    p.add_argument('--rows', type=int, default=25)
    p.add_argument('--year-from', type=int)
    p.add_argument('--year-to', type=int)
    p.add_argument('--max-names', type=int, default=5)
    p.add_argument('--no-aliases', action='store_true')
    p.add_argument('--all-years', action='store_true', help='drop the default 1450-1900 window for texts')
    p.add_argument('--output')
    a = p.parse_args(argv)
    client = Client()
    runs = [search(q, tuple(a.source or SOURCES), client, a.rows, a.year_from, a.year_to, a.max_names, not a.no_aliases,
                   all_years=a.all_years)
            for q in a.queries]
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
    return 0 if out['status'] in ('EXECUTED', 'PARTIAL') else 1


if __name__ == '__main__':
    sys.exit(main())
