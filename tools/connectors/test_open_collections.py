"""Offline tests for open_collections (Internet Archive texts, David Rumsey maps).

No network: every HTTP call goes to a fake fetcher fed with recorded responses.
"""
import json
import sys
import tempfile
import unittest
import urllib.error
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import open_collections as oc  # noqa: E402

FIX = HERE.parent / 'fixtures' / 'open_collections'
EMPTY = {'responseHeader': {'status': 0}, 'response': {'numFound': 0, 'start': 0, 'docs': []}}


def load(name):
    return json.loads((FIX / name).read_text(encoding='utf-8'))


class FakeFetcher:
    def __init__(self, routes=None, error=None):
        self.routes, self.error, self.calls = routes or {}, error, []

    def __call__(self, url, headers=None, timeout=None):
        self.calls.append({'url': url, 'headers': headers, 'timeout': timeout})
        if self.error:
            raise self.error
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)['q'][0]
        for needle, body in self.routes.items():
            if needle in q:
                return json.dumps(body).encode()
        return json.dumps(EMPTY).encode()


def client(fetcher, ttl=0, cache_dir=None):
    return oc.Client(cache_dir=cache_dir or tempfile.mkdtemp(), ttl=ttl, fetcher=fetcher, pace=False)


class AliasTests(unittest.TestCase):
    def test_knowledge_file_pairs(self):
        pairs = oc.knowledge_aliases()
        self.assertIn(('Milo', 'Μήλος'), pairs)
        self.assertIn(('Cerigo', 'Κύθηρα'), pairs)

    def test_milo_expands_from_sourced_gazetteer(self):
        names, warnings = oc.place_aliases('Milo', max_names=10)
        by = {n['name']: n for n in names}
        self.assertEqual(names[0]['basis'], 'QUERY')
        self.assertEqual(by['Μήλος']['basis'], 'KNOWLEDGE_FILE')
        self.assertIn('Milos', by)
        self.assertTrue(by['Milos']['source'].startswith('https://www.wikidata.org/wiki/'))
        self.assertNotIn('Mint of Melos', by)  # long descriptive aliases are not search names
        self.assertEqual(warnings, [])

    def test_greek_query_reaches_cerigo(self):
        names, _ = oc.place_aliases('Κύθηρα', max_names=10)
        self.assertIn('Cerigo', [n['name'] for n in names])

    def test_ambiguous_name_not_expanded(self):
        names, warnings = oc.place_aliases('Candia')
        self.assertEqual([n['name'] for n in names], ['Candia'])
        self.assertTrue(warnings[0].startswith('AMBIGUOUS_PLACE_NAME_NOT_EXPANDED:Candia'))

    def test_unknown_place_is_query_only(self):
        names, warnings = oc.place_aliases('Zzyzxville')
        self.assertEqual(names, [{'name': 'Zzyzxville', 'basis': 'QUERY', 'source': ''}])


class QueryTests(unittest.TestCase):
    def test_rumsey_query_uses_collection_on_archive_org(self):
        q = oc.build_query('david_rumsey', 'Cerigo')
        self.assertEqual(q, 'collection:david-rumsey-map-collection AND ("Cerigo")')
        url = oc.search_url(q)
        self.assertTrue(url.startswith('https://archive.org/advancedsearch.php?'))
        self.assertNotIn('davidrumsey.com', url)

    def test_texts_topic_and_years(self):
        q = oc.build_query('internet_archive', 'Mi"lo', 'topic', 1600, 1700)
        self.assertTrue(q.startswith('mediatype:texts AND ("Mi lo") AND (pirate OR pirates'))
        self.assertNotIn('*', q)  # archive.org does not expand wildcards in its default field
        self.assertTrue(q.endswith('AND year:[1600 TO 1700]'))


class SearchTests(unittest.TestCase):
    def test_rumsey_record_fields_and_canonical_url(self):
        f = FakeFetcher({'"Cerigo"': load('ia_rumsey_cerigo.json')})
        out = oc.search('Cerigo', sources=('david_rumsey',), client=client(f), max_names=1)
        self.assertEqual(out['status'], 'EXECUTED')
        self.assertEqual(out['hits'], 4)
        r = out['records'][1]
        self.assertEqual(r['source_name'], 'David Rumsey Map Collection')
        self.assertEqual(r['item_url'], 'https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~2767~270040')
        self.assertTrue(r['archive_url'].startswith('https://archive.org/details/dr_map-of-the-ionian-islands'))
        self.assertEqual(r['creator'], 'Arrowsmith, John')
        self.assertEqual(r['date'], '1844-01-01T00:00:00Z')
        self.assertEqual(r['matched_query'], 'Cerigo')
        self.assertEqual(r['matched_alias'], 'Cerigo')
        self.assertEqual(r['evidence_level'], 'DISCOVERY_ONLY')
        self.assertFalse(r['verified'])
        self.assertEqual(f.calls[0]['headers']['User-Agent'], oc.USER_AGENT)
        self.assertEqual(f.calls[0]['timeout'], oc.DEFAULT_TIMEOUT)

    def test_missing_fields_stay_empty(self):
        f = FakeFetcher({'"Milo"': load('ia_texts_milo_1500_1800.json')})
        out = oc.search('Milo', sources=('internet_archive',), client=client(f), max_names=1)
        first = out['records'][0]
        self.assertEqual(first['creator'], '')  # not in the catalogue record, so not invented
        self.assertEqual(first['coverage'], '')
        self.assertEqual(first['item_url'], 'https://archive.org/details/driscoll_bx_205_series_9_sheet_music_back_cover_050')
        self.assertEqual(first['year'], '1770')

    def test_untrusted_source_url_is_not_used(self):
        doc = {'identifier': 'dr_x', 'source': 'https://evil.example/luna/servlet/detail/RUMSEY~1'}
        url, archive = oc.item_url('david_rumsey', doc)
        self.assertEqual(url, 'https://archive.org/details/dr_x')

    def test_dedupe_keeps_all_matching_aliases(self):
        body = load('ia_rumsey_cerigo.json')
        f = FakeFetcher({'"Cerigo"': body, '"Kythira"': body})
        names = [{'name': 'Cerigo', 'basis': 'QUERY', 'source': '', 'query': 'Cerigo'},
                 {'name': 'Kythira', 'basis': 'GAZETTEER_SOURCED_VARIANT', 'source': 'w', 'query': 'Cerigo'}]
        summary, recs = oc.search_source('david_rumsey', names, client(f))
        self.assertEqual(len(recs), 4)
        self.assertEqual(recs[0]['matched_aliases'], ['Cerigo', 'Kythira'])
        self.assertEqual(summary['queries'][0]['num_found'], 19)

    def test_rate_limit_is_reported_not_raised(self):
        err = urllib.error.HTTPError('https://archive.org/advancedsearch.php', 429, 'Too Many', {}, None)
        out = oc.search('Cerigo', sources=('david_rumsey',), client=client(FakeFetcher(error=err)), max_names=1)
        self.assertEqual(out['status'], 'REMOTE_RATE_LIMITED')
        self.assertEqual(out['records'], [])
        self.assertEqual(out['sources']['david_rumsey']['queries'][0]['error_code'], 'HTTP_429')

    def test_schema_mismatch(self):
        f = FakeFetcher({'"Cerigo"': {'unexpected': True}})
        out = oc.search('Cerigo', sources=('david_rumsey',), client=client(f), max_names=1)
        self.assertEqual(out['sources']['david_rumsey']['status'], 'API_SCHEMA_MISMATCH')

    def test_cache_avoids_second_request(self):
        cache = tempfile.mkdtemp()
        f = FakeFetcher({'"Cerigo"': load('ia_rumsey_cerigo.json')})
        c = client(f, ttl=3600, cache_dir=cache)
        oc.search('Cerigo', sources=('david_rumsey',), client=c, max_names=1)
        out = oc.search('Cerigo', sources=('david_rumsey',), client=c, max_names=1)
        self.assertEqual(len(f.calls), 1)
        self.assertTrue(out['sources']['david_rumsey']['queries'][0]['cached'])

    def test_lane_adapter_shape(self):
        f = FakeFetcher({'"Cerigo"': load('ia_rumsey_cerigo.json')})
        status, rows, detail = oc.lane_search('david_rumsey', 'Cerigo', 'travellers', client=client(f))
        self.assertEqual(status, 'EXECUTED')
        self.assertEqual(rows[0]['discovery_repository'], 'David Rumsey Map Collection')
        self.assertEqual(rows[0]['discovery_lane'], 'travellers')
        self.assertEqual(rows[0]['url'], rows[0]['item_url'])
        self.assertEqual(rows[0]['date'], ['1623-01-01T00:00:00Z'])
        self.assertEqual(json.loads(detail)['policy'], oc.POLICY)

    def test_empty_query_rejected(self):
        with self.assertRaises(ValueError):
            oc.search('  ', client=client(FakeFetcher()))


class DefaultYearTests(unittest.TestCase):
    def test_texts_get_period_window_maps_do_not(self):
        f = FakeFetcher()
        out = oc.search('Cerigo', client=client(f), max_names=1)
        qs = [urllib.parse.parse_qs(urllib.parse.urlsplit(c['url']).query)['q'][0] for c in f.calls]
        texts = [q for q in qs if q.startswith('mediatype:texts')]
        maps = [q for q in qs if q.startswith('collection:david-rumsey')]
        self.assertTrue(texts and all(q.endswith('year:[1450 TO 1900]') for q in texts))
        self.assertTrue(maps and not any('year:' in q for q in maps))
        self.assertEqual(out['sources']['internet_archive']['years'], [1450, 1900])

    def test_all_years_drops_window(self):
        f = FakeFetcher()
        oc.search('Cerigo', sources=('internet_archive',), client=client(f), max_names=1, all_years=True)
        self.assertTrue(f.calls)
        self.assertFalse(any('year:' in urllib.parse.parse_qs(urllib.parse.urlsplit(c['url']).query)['q'][0] for c in f.calls))


class RegistryTests(unittest.TestCase):
    def test_registered_with_existing_modules_and_limits(self):
        from connector_registry import connector
        from connector_rate_limit import config
        root = HERE.parent.parent
        for cid in ('internet_archive_texts', 'david_rumsey_maps'):
            meta = connector(cid)
            self.assertTrue((root / meta['module']).is_file())
            self.assertEqual(config(cid)['max_concurrent'], 1)

    def test_dispatch_labels(self):
        import repository_connectors as rc
        import inspect
        src = inspect.getsource(rc.dispatch)
        self.assertIn('"David Rumsey Map Collection": return david_rumsey_maps', src)


if __name__ == '__main__':
    unittest.main()
