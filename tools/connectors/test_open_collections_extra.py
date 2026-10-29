"""Offline tests for open_collections_extra (Gallica via BnF SRU, Europeana, HathiTrust).

No network: every HTTP call goes to a fake fetcher fed with recorded responses
(tools/fixtures/open_collections/, see README.md there).
"""
import json
import os
import sys
import tempfile
import unittest
import urllib.error
import urllib.parse
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import open_collections as oc  # noqa: E402
import open_collections_extra as ox  # noqa: E402

FIX = HERE.parent / 'fixtures' / 'open_collections'
EMPTY_SRU = ('<?xml version="1.0" encoding="UTF-8"?><srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">'
             '<srw:version>1.2</srw:version><srw:numberOfRecords>0</srw:numberOfRecords><srw:records/></srw:searchRetrieveResponse>')
EMPTY_IA = {'responseHeader': {'status': 0}, 'response': {'numFound': 0, 'start': 0, 'docs': []}}
EMPTY_EU = {'apikey': 'x', 'success': True, 'itemsCount': 0, 'totalResults': 0, 'items': []}


def raw(name):
    return (FIX / name).read_text(encoding='utf-8')


class FakeFetcher:
    """Routes by host and by the place name that appears in the URL."""

    def __init__(self, routes=None, error=None):
        self.routes, self.error, self.calls = routes or {}, error, []

    def __call__(self, url, headers=None, timeout=None):
        self.calls.append({'url': url, 'headers': headers, 'timeout': timeout})
        if self.error:
            raise self.error
        host = urllib.parse.urlsplit(url).hostname
        plain = urllib.parse.unquote_plus(url)
        for (h, needle), body in self.routes.items():
            if h == host and needle in plain:
                return body.encode('utf-8')
        if host == 'catalogue.bnf.fr':
            return EMPTY_SRU.encode()
        if host == 'api.europeana.eu':
            return json.dumps(EMPTY_EU).encode()
        if host == 'catalog.hathitrust.org':
            return b'{}'
        return json.dumps(EMPTY_IA).encode()


def client(fetcher, ttl=0, cache_dir=None):
    return oc.Client(cache_dir=cache_dir or tempfile.mkdtemp(), ttl=ttl, fetcher=fetcher, pace=False)


def one(name):
    return [{'name': name, 'basis': 'QUERY', 'source': '', 'query': name}]


class GallicaTests(unittest.TestCase):
    def test_cql_and_endpoint(self):
        cql = ox.gallica_cql('Ce"rigo', 1450, 1900)
        self.assertEqual(cql, 'bib.anywhere all "Ce rigo" and bib.digitized all "freeAccess" '
                              'and bib.publicationdate within "1450 1900"')
        url = ox.gallica_url(cql, 4)
        self.assertTrue(url.startswith('https://catalogue.bnf.fr/api/SRU?'))
        self.assertIn('recordSchema=unimarcXchange', url)
        self.assertNotIn('gallica.bnf.fr/SRU', url)  # disallowed by gallica.bnf.fr/robots.txt

    def test_records_from_recorded_response(self):
        f = FakeFetcher({('catalogue.bnf.fr', '"Cerigo"'): raw('gallica_cerigo_1450_1900.xml')})
        out = ox.search('Cerigo', sources=('gallica',), client=client(f), max_names=1)
        self.assertEqual(out['status'], 'EXECUTED')
        self.assertEqual(out['sources']['gallica']['queries'][0]['num_found'], 55)
        self.assertEqual(out['hits'], 4)
        r = {x['identifier']: x for x in out['records']}['ark:/12148/cb40681488r']
        self.assertEqual(r['title'], 'Cerigo')
        self.assertEqual(r['creator'], 'Coronelli, Vincenzo')
        self.assertEqual(r['date'], '[1689]')
        self.assertEqual(r['item_url'], 'https://gallica.bnf.fr/ark:/12148/btv1b55006138z')
        self.assertEqual(r['iiif_manifest'], 'https://gallica.bnf.fr/iiif/ark:/12148/btv1b55006138z/manifest.json')
        self.assertEqual(r['archive_url'], 'https://catalogue.bnf.fr/ark:/12148/cb40681488r')
        self.assertEqual(r['mediatype'], 'document cartographique imprimé')
        self.assertEqual(r['source_name'], 'Gallica (BnF)')
        self.assertEqual(r['evidence_level'], 'DISCOVERY_ONLY')
        self.assertFalse(r['verified'])
        self.assertEqual(f.calls[0]['headers']['User-Agent'], oc.USER_AGENT)
        self.assertEqual(f.calls[0]['timeout'], oc.DEFAULT_TIMEOUT)

    def test_unknown_fields_stay_empty(self):
        _, recs = ox.parse_gallica(raw('gallica_cerigo_1450_1900.xml'))
        first = recs[0]
        self.assertEqual(first['creator'], '')  # the 1880 map record names no 70x creator
        last = recs[3]
        self.assertEqual(last['title'], 'Napoli de Romanie ; Cerigo')
        self.assertEqual(last['mediatype'], '')  # truncated leader: type not guessed

    def test_milo_fixture(self):
        n, recs = ox.parse_gallica(raw('gallica_milo_1450_1900.xml'))
        self.assertEqual(n, 108)
        self.assertEqual(len(recs), 4)

    def test_sru_diagnostic_is_schema_mismatch(self):
        diag = ('<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/" '
                'xmlns:diag="http://www.loc.gov/zing/srw/diagnostic/"><srw:diagnostics><diag:diagnostic>'
                '<diag:message>bad</diag:message></diag:diagnostic></srw:diagnostics></srw:searchRetrieveResponse>')
        f = FakeFetcher({('catalogue.bnf.fr', 'Cerigo'): diag})
        out = ox.search('Cerigo', sources=('gallica',), client=client(f), max_names=1)
        self.assertEqual(out['sources']['gallica']['status'], 'API_SCHEMA_MISMATCH')

    def test_surrogate_record_diagnostic_is_skipped(self):
        # Shape seen live for "Milos" on 2026-10-29: one record replaced by a diagnostic.
        xml = raw('gallica_cerigo_1450_1900.xml')
        start = xml.index('<srw:recordData>')
        end = xml.index('</srw:recordData>') + len('</srw:recordData>')
        bad = ('<srw:recordData><srw:diagnostics><sd:diagnostic xmlns:sd="http://www.loc.gov/zing/srw/diagnostic/">'
               '<sd:uri>info:srw/diagnostic/1/131</sd:uri><sd:message>erreur de traitement</sd:message>'
               '</sd:diagnostic></srw:diagnostics></srw:recordData>')
        n, recs = ox.parse_gallica(xml[:start] + bad + xml[end:])
        self.assertEqual(n, 55)
        self.assertEqual(len(recs), 3)

    def test_non_gallica_856_not_used(self):
        xml = raw('gallica_cerigo_1450_1900.xml').replace('http://gallica.bnf.fr/ark:/12148/btv1b55010887g',
                                                          'https://evil.example/ark:/12148/x')
        _, recs = ox.parse_gallica(xml)
        self.assertEqual(recs[0]['item_url'], '')
        self.assertEqual(recs[0]['iiif_manifest'], '')


class EuropeanaTests(unittest.TestCase):
    def test_no_key_no_request(self):
        f = FakeFetcher()
        with mock.patch.dict(os.environ, {'EUROPEANA_API_KEY': ''}):
            out = ox.search('Cerigo', sources=('europeana',), client=client(f), max_names=1)
        self.assertEqual(out['status'], 'API_KEY_REQUIRED')
        self.assertEqual(f.calls, [])
        self.assertFalse(out['sources']['europeana']['request_performed'])

    def test_records_and_key_never_kept(self):
        f = FakeFetcher({('api.europeana.eu', '"Cerigo"'): raw('europeana_cerigo_1450_1900.json')})
        cache = tempfile.mkdtemp()
        with mock.patch.dict(os.environ, {'EUROPEANA_API_KEY': 'api2demo'}):
            c = client(f, ttl=3600, cache_dir=cache)
            out = ox.search('Cerigo', sources=('europeana',), client=c, max_names=1)
        self.assertEqual(out['status'], 'EXECUTED')
        self.assertEqual(out['sources']['europeana']['queries'][0]['num_found'], 194)
        r = out['records'][1]
        self.assertEqual(r['identifier'], '/447/GEO0005512')
        self.assertEqual(r['title'], 'Cerigo')
        self.assertEqual(r['creator'], 'Bordone, Benedetto')
        self.assertEqual(r['year'], '1528')
        self.assertEqual(r['item_url'], 'https://www.europeana.eu/item/447/GEO0005512')  # utm_* dropped
        self.assertEqual(r['data_provider'], 'Marciana National Library')
        self.assertIn('Cerigotto', r['coverage'])
        self.assertIn('wskey=api2demo', f.calls[0]['url'])  # sent to the API ...
        self.assertIn('qf=YEAR%3A%5B1450+TO+1900%5D', f.calls[0]['url'])
        blob = json.dumps(out) + json.dumps(c.requests) + ''.join(
            p.read_text(encoding='utf-8') for p in Path(cache).glob('*'))
        self.assertNotIn('api2demo', blob)  # ... but never in reports, receipts or cache

    def test_redact_url(self):
        self.assertEqual(oc.redact_url('https://a.b/s?query=x&wskey=SECRET'), 'https://a.b/s?query=x&wskey=REDACTED')
        import http_audit
        self.assertNotIn('SECRET', http_audit.safe_url('https://a.b/s?query=x&wskey=SECRET'))

    def test_demo_key_only_when_asked(self):
        with mock.patch.dict(os.environ, {'EUROPEANA_API_KEY': ''}):
            self.assertEqual(ox.europeana_key(), '')
            self.assertEqual(ox.europeana_key(demo=True), 'api2demo')
        with mock.patch.dict(os.environ, {'EUROPEANA_API_KEY': 'real'}):
            self.assertEqual(ox.europeana_key(demo=True), 'real')

    def test_403_reported_not_retried(self):
        err = urllib.error.HTTPError(ox.EUROPEANA_SEARCH, 403, 'Forbidden', {}, None)
        f = FakeFetcher(error=err)
        with mock.patch.dict(os.environ, {'EUROPEANA_API_KEY': 'k'}):
            out = ox.search('Cerigo', sources=('europeana',), client=client(f), max_names=1)
        self.assertEqual(out['status'], 'REMOTE_ACCESS_BLOCKED')
        self.assertEqual(len(f.calls), 1)


class HathiTrustTests(unittest.TestCase):
    def routes(self):
        return {('archive.org', '"Cerigo"'): raw('hathitrust_ia_cerigo_oclc.json'),
                ('catalog.hathitrust.org', 'oclc:6959535'): raw('hathitrust_bib_cerigo.json')}

    def test_ia_oclc_then_bib_api(self):
        f = FakeFetcher(self.routes())
        out = ox.search('Cerigo', sources=('hathitrust',), client=client(f), max_names=1)
        self.assertEqual(out['status'], 'EXECUTED')
        self.assertTrue(f.calls[0]['url'].startswith('https://archive.org/advancedsearch.php?'))
        self.assertIn('oclc-id:*', urllib.parse.unquote_plus(f.calls[0]['url']))
        self.assertTrue(f.calls[1]['url'].startswith(ox.HT_BIB))
        self.assertEqual(len(f.calls), 2)  # one batched Bib API lookup, no keyword search on HathiTrust
        q = out['sources']['hathitrust']['queries'][0]
        self.assertEqual((q['ia_num_found'], q['oclc_looked_up']), (9, 4))
        by = {r['identifier']: r for r in out['records']}
        self.assertEqual(set(by), {'hathitrust:000628074', 'hathitrust:009711455'})
        r = by['hathitrust:009711455']
        self.assertEqual(r['item_url'], 'https://catalog.hathitrust.org/Record/009711455')
        self.assertEqual(r['date'], '1800')
        self.assertEqual(r['rights'], 'Full view')
        self.assertEqual(r['full_view_volumes'], 3)
        self.assertEqual(r['volumes'][0]['url'], 'https://babel.hathitrust.org/cgi/pt?id=hvd.hxj4e9')
        self.assertEqual(r['oclc'], '7728152')

    def test_oclc_not_in_hathitrust_gives_no_record(self):
        bib = json.loads(raw('hathitrust_bib_cerigo.json'))
        self.assertEqual(bib['oclc:25337517'], {'records': [], 'items': []})
        recs = ox.parse_hathitrust(bib, {})
        self.assertNotIn('25337517', [r['oclc'] for r in recs])

    def test_batches_of_twenty(self):
        self.assertEqual(ox.HT_BATCH, 20)
        url = ox.hathitrust_bib_url(['1', '2'])
        self.assertEqual(url, 'https://catalog.hathitrust.org/api/volumes/brief/json/oclc:1|oclc:2')

    def test_rate_limit(self):
        err = urllib.error.HTTPError(oc.IA_SEARCH, 429, 'Too Many', {}, None)
        out = ox.search('Cerigo', sources=('hathitrust',), client=client(FakeFetcher(error=err)), max_names=1)
        self.assertEqual(out['status'], 'REMOTE_RATE_LIMITED')


class SharedTests(unittest.TestCase):
    def test_aliases_and_dedupe(self):
        body = raw('gallica_cerigo_1450_1900.xml')
        f = FakeFetcher({('catalogue.bnf.fr', '"Cerigo"'): body, ('catalogue.bnf.fr', '"Kythira"'): body})
        names = one('Cerigo') + [{'name': 'Kythira', 'basis': 'GAZETTEER_SOURCED_VARIANT', 'source': 'w', 'query': 'Cerigo'}]
        summary, recs = ox.search_source('gallica', names, client(f))
        self.assertEqual(len(recs), 4)
        self.assertEqual(recs[0]['matched_aliases'], ['Cerigo', 'Kythira'])

    def test_cache_avoids_second_request(self):
        cache = tempfile.mkdtemp()
        f = FakeFetcher({('catalogue.bnf.fr', '"Cerigo"'): raw('gallica_cerigo_1450_1900.xml')})
        c = client(f, ttl=3600, cache_dir=cache)
        ox.search('Cerigo', sources=('gallica',), client=c, max_names=1)
        out = ox.search('Cerigo', sources=('gallica',), client=c, max_names=1)
        self.assertEqual(len(f.calls), 1)
        self.assertTrue(out['sources']['gallica']['queries'][0]['cached'])

    def test_lane_adapter(self):
        f = FakeFetcher({('catalogue.bnf.fr', '"Cerigo"'): raw('gallica_cerigo_1450_1900.xml')})
        status, rows, detail = ox.lane_search('gallica', 'Cerigo', 'french', client=client(f))
        self.assertEqual(status, 'EXECUTED')
        self.assertEqual(rows[0]['discovery_repository'], 'Gallica (BnF)')
        self.assertEqual(rows[0]['acquisition_route'], 'GALLICA_VIA_BNF_CATALOGUE_SRU')
        self.assertEqual(rows[0]['url'], 'https://gallica.bnf.fr/ark:/12148/btv1b55010887g')
        self.assertEqual(rows[0]['date'], ['[1880]'])
        self.assertEqual(json.loads(detail)['policy'], ox.POLICY)

    def test_empty_query_rejected(self):
        with self.assertRaises(ValueError):
            ox.search(' ', client=client(FakeFetcher()))

    def test_registry_limits_dispatch_lanes(self):
        from connector_registry import connector
        from connector_rate_limit import config
        root = HERE.parent.parent
        for cid in ('gallica_bnf_digitized', 'europeana_search', 'hathitrust_bib'):
            self.assertTrue((root / connector(cid)['module']).is_file())
            self.assertEqual(config(cid)['max_concurrent'], 1)
        self.assertEqual(config('gallica_bnf_digitized')['min_interval_seconds'], 5)  # BnF Crawl-delay: 5
        import inspect
        import repository_connectors as rc
        src = inspect.getsource(rc.dispatch)
        for label in ('"Gallica (BnF digitized)"', '"Europeana"', '"HathiTrust Digital Library"'):
            self.assertIn(label, src)
        plan = (root / 'tools' / 'lane_repository_plan.py').read_text(encoding='utf-8')
        self.assertIn('("Gallica (BnF digitized)","https://gallica.bnf.fr")', plan)


if __name__ == '__main__':
    unittest.main()
