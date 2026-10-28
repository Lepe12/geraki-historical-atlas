"""Unit tests for tools/zotero_sync.py with a mocked Zotero Web API (no network)."""
import io
import json
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import zotero_sync as zs  # noqa: E402

SECRET = 'k' * 24


def occurrence(url, title, finding, lane='british', scan=None, bib=None, ref=None):
    return {
        'lane': lane, 'url': url, 'title': title, 'finding_id': finding,
        'source_bibliography': bib, 'reported_archival_reference': ref,
        'locator': {'url': url, 'printed_page': None, 'scan_indexes_0_based': [scan] if scan is not None else [],
                    'start_line': 1, 'end_line': 2},
    }


def make_run(run_id='111', target='Ιωάννης Καψής'):
    saulger = "Saulger, Robert: Histoire nouvelle"
    return {
        'run_id': run_id,
        'mission': {'target': target},
        'research_answer': {
            'claims': [
                {'claim_id': 'c-1', 'statement': 'Jean Capsi named', 'quote': 'Jean Capfi', 'verified': False,
                 'source_occurrences': [
                     occurrence('https://api.digitale-sammlungen.de/iiif/image/v2/bsb10447069_00323/full/full/0/default.jpg',
                                saulger, 'f-1', scan=322, bib={'creator': None, 'date': ['1698']}),
                     occurrence('https://api.digitale-sammlungen.de/iiif/image/v2/bsb10447069_00337/full/full/0/default.jpg',
                                saulger, 'f-2', scan=336, bib={'creator': None, 'date': ['1698']}),
                 ]},
                {'claim_id': 'c-2', 'statement': 's', 'quote': 'q', 'verified': False, 'relevance_hold': True,
                 'source_occurrences': [occurrence('https://archive.org/details/diadromi_174', 'Διαδρομή 174', 'f-3', lane='travellers',
                                                   ref={'display': 'ASV, b.19, fol.81'})]},
            ],
            'synthesis_coverage': {'relevance_held_claim_ids': ['c-2']},
        },
        'evidence_package': {
            'assertions': [],
            'passages': [{'passage_id': 'travellers:f-3', 'source_id': 's-3'}],
            'sources': [{'source_id': 's-3', 'bibliography': {'title': 'Διαδρομή 174', 'creators': [], 'publication_date': None,
                                                              'archive': None, 'call_number': None}}],
        },
        'discoveries': [
            {'finding_id': 'f-3', 'repository': 'Internet Archive Full Text'},
            {'finding_id': 'f-uncited', 'repository': 'X', 'url': 'https://example.org/not-cited', 'title': 'Uncited'},
        ],
    }


def write_live(tmp, runs):
    live = Path(tmp) / 'live'
    (live / 'runs').mkdir(parents=True)
    (live / 'index.json').write_text(json.dumps({'runs': [{'run_id': r['run_id'], 'target': r['mission']['target']} for r in runs]}))
    for r in runs:
        (live / 'runs' / f"{r['run_id']}.json").write_text(json.dumps(r, ensure_ascii=False))
    return live


class Resp:
    def __init__(self, status, body=None, headers=None):
        self.status, self.headers, self._body = status, headers or {}, body

    def read(self):
        return b'' if self._body is None else json.dumps(self._body).encode()


class FakeZotero:
    """In-memory stand-in for the Zotero Web API v3 user library."""

    def __init__(self, notes=True):
        self.notes = notes
        self.items, self.collections, self.calls, self.tokens = {}, {}, [], []
        self.n = 0
        self.fail_next = []  # list of (status, headers) to return before real handling

    def _key(self):
        self.n += 1
        return f'K{self.n:07d}'

    def __call__(self, req):
        method, url = req.get_method(), req.full_url
        assert req.get_header('Zotero-api-key') == SECRET
        self.calls.append((method, url))
        if self.fail_next:
            status, headers = self.fail_next.pop(0)
            if status >= 400:
                raise urllib.error.HTTPError(url, status, 'err', headers, io.BytesIO(b''))
        if url.endswith('/keys/current'):
            return Resp(200, {'access': {'user': {'library': True, 'write': True, 'notes': self.notes}}})
        path = url.split('/users/42', 1)[1]
        route, _, query = path.partition('?')
        if method == 'GET':
            params = dict(p.split('=', 1) for p in query.split('&') if p)
            start, limit = int(params.get('start', 0)), int(params.get('limit', 100))
            visible = [i for i in self.items.values() if self.notes or i['itemType'] != 'note']
            if route == '/items/top':
                rows = [i for i in visible if i['itemType'] != 'note']
            elif route == '/collections':
                rows = list(self.collections.values())
            elif route.startswith('/items/') and route.endswith('/children'):
                parent = route.split('/')[2]
                rows = [i for i in visible if i.get('parentItem') == parent]
            else:
                raise AssertionError(route)
            page = [{'key': r['key'], 'data': r} for r in rows[start:start + limit]]
            return Resp(200, page, {'Total-Results': str(len(rows))})
        body = json.loads(req.data)
        if method == 'POST':
            self.tokens.append(req.get_header('Zotero-write-token'))
            out = {}
            store = self.items if route == '/items' else self.collections
            for i, obj in enumerate(body):
                key = self._key()
                store[key] = dict(obj, key=key, version=1)
                out[str(i)] = key
            return Resp(200, {'success': out, 'successful': {}, 'unchanged': {}, 'failed': {}})
        if method == 'PATCH':
            key = route.split('/')[2]
            self.items[key].update(body)
            return Resp(204)
        raise AssertionError(method)

    def writes(self):
        return [c for c in self.calls if c[0] != 'GET']


class ExtractionTests(unittest.TestCase):
    def test_source_key_is_work_level_and_stable(self):
        a = zs.source_key('https://api.digitale-sammlungen.de/iiif/image/v2/bsb10447069_00323/full/full/0/default.jpg')
        b = zs.source_key('https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb10447069/canvas/340')
        self.assertEqual(a, 'bsb:bsb10447069')
        self.assertEqual(a, b)
        self.assertEqual(zs.source_key('https://archive.org/stream/diadromi_174/x.txt'), 'archive.org:diadromi_174')
        self.assertEqual(zs.source_key('https://www.um.edu.mt/library/oar//handle/1/2'), zs.source_key('https://um.edu.mt/library/oar/handle/1/2'))

    def test_dates_and_creators_are_not_invented(self):
        self.assertEqual(zs.clean_date(['1890-01-01T00:00:00Z']), '1890')
        self.assertEqual(zs.clean_date('2020-12-29'), '2020-12-29')
        self.assertEqual(zs.clean_date([]), '')
        self.assertEqual(zs.clean_date(None), '')
        kept, dropped = zs.clean_creators(['Κώστας Ψυχογυιός, Στέλιος Ποπολάνος', 'https://odysee.com/x'])
        self.assertEqual(kept, ['Κώστας Ψυχογυιός, Στέλιος Ποπολάνος'])  # never split
        self.assertEqual(dropped, ['https://odysee.com/x'])

    def test_only_cited_sources_are_collected(self):
        with tempfile.TemporaryDirectory() as tmp:
            works, skipped = zs.collect_sources(write_live(tmp, [make_run()]))
        self.assertEqual(sorted(works), ['archive.org:diadromi_174', 'bsb:bsb10447069'])
        self.assertEqual(skipped, [])
        saulger = works['bsb:bsb10447069']
        self.assertEqual(saulger['meta']['creators'], [])
        self.assertEqual(saulger['meta']['date'], '1698')
        self.assertEqual(saulger['meta']['archive'], '')
        (cit,) = saulger['citations'].values()
        self.assertEqual([p['scan_indexes_0_based'] for p in cit['pages']], [[322], [336]])
        diadromi = works['archive.org:diadromi_174']
        self.assertEqual(diadromi['meta']['archive'], 'Internet Archive')
        (cit,) = diadromi['citations'].values()
        self.assertEqual(cit['holds'], ['relevance_hold'])
        self.assertEqual(cit['reported_archival_references'], ['ASV, b.19, fol.81'])

    def test_item_mapping_leaves_missing_fields_empty(self):
        work = {'source_key': 'bsb:bsb1', 'meta': {'title': 'T', 'creators': [], 'date': '', 'url': 'u', 'archive': '',
                                                   'call_number': '', 'container_title': '', 'doi': '', 'rights': ''}}
        item = zs.zotero_item(work, ['C1'])
        self.assertEqual(item['itemType'], 'document')
        self.assertEqual(item['creators'], [])
        self.assertEqual(item['date'], '')
        self.assertIn('NABOU-source-id: bsb:bsb1', item['extra'])
        work['meta']['call_number'] = 'b.19'
        self.assertEqual(zs.zotero_item(work, [])['itemType'], 'manuscript')
        work['meta']['doi'] = '10.1/x'
        self.assertEqual(zs.zotero_item(work, [])['itemType'], 'journalArticle')

    def test_doi_from_doi_url(self):
        meta = zs.occurrence_metadata({'url': 'https://doi.org/10.4401/ag-8504', 'title': 'x'})
        self.assertEqual(meta['doi'], '10.4401/ag-8504')


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.live = write_live(self.tmp.name, [make_run('111'), make_run('222', target='Μήλος')])
        self.fake = FakeZotero()
        self.sleeps = []
        self.client = zs.Zotero('42', SECRET, opener=self.fake, sleep=self.sleeps.append)

    def tearDown(self):
        self.tmp.cleanup()

    def test_dry_run_never_writes(self):
        works, _ = zs.collect_sources(self.live)
        report = zs.sync(works, self.client, apply=False, log=lambda m: None)
        self.assertEqual(self.fake.writes(), [])
        self.assertEqual(report['totals']['items_to_create'], 2)
        self.assertEqual(report['cases']['Μήλος']['sources'], 2)

    def test_apply_then_rerun_creates_nothing(self):
        works, _ = zs.collect_sources(self.live, cases=['Ιωάννης Καψής'])
        first = zs.sync(works, self.client, apply=True, log=lambda m: None)
        self.assertEqual(first['totals']['items_created'], 2)
        self.assertEqual(first['totals']['notes_created'], 2)
        names = {c['name']: c for c in self.fake.collections.values()}
        self.assertIn('NABOU//X', names)
        self.assertEqual(names['Ιωάννης Καψής']['parentCollection'], names['NABOU//X']['key'])
        notes = [i for i in self.fake.items.values() if i['itemType'] == 'note']
        self.assertTrue(all('NABOU-citation-id: 111/' in n['note'] for n in notes))
        self.assertTrue(all(n['parentItem'] in self.fake.items for n in notes))
        before = len(self.fake.writes())
        works, _ = zs.collect_sources(self.live, cases=['Ιωάννης Καψής'])
        second = zs.sync(works, self.client, apply=True, log=lambda m: None)
        self.assertEqual(len(self.fake.writes()), before)
        self.assertEqual(second['totals']['items_created'], 0)
        self.assertEqual(second['totals']['notes_created'], 0)
        self.assertEqual(second['totals']['items_existing'], 2)

    def test_new_case_adds_subcollection_to_existing_item(self):
        works, _ = zs.collect_sources(self.live, cases=['Ιωάννης Καψής'])
        zs.sync(works, self.client, apply=True, log=lambda m: None)
        works, _ = zs.collect_sources(self.live)
        report = zs.sync(works, self.client, apply=True, log=lambda m: None)
        self.assertEqual(report['totals']['items_created'], 0)
        self.assertEqual(report['totals']['notes_created'], 2)  # run 222 citations
        patched = [c for c in self.fake.calls if c[0] == 'PATCH']
        self.assertEqual(len(patched), 2)
        saulger = next(i for i in self.fake.items.values() if 'bsb:bsb10447069' in i.get('extra', ''))
        self.assertEqual(len(saulger['collections']), 2)

    def test_key_without_notes_access_writes_no_notes(self):
        self.fake.notes = False
        works, _ = zs.collect_sources(self.live, cases=['Ιωάννης Καψής'])
        report = zs.sync(works, self.client, apply=True, log=lambda m: None)
        self.assertFalse(report['key_notes_access'])
        self.assertEqual(report['totals']['notes_created'], 0)
        self.assertEqual(report['totals']['notes_skipped_no_notes_access'], 2)
        self.assertFalse([i for i in self.fake.items.values() if i['itemType'] == 'note'])
        again = zs.sync(zs.collect_sources(self.live, cases=['Ιωάννης Καψής'])[0], self.client, apply=True, log=lambda m: None)
        self.assertEqual(again['totals']['items_created'], 0)
        self.assertEqual(again['totals']['notes_created'], 0)

    def test_backoff_retries_and_reuses_write_token(self):
        self.fake.fail_next = [(429, {'Retry-After': '7'}), (503, {})]
        keys = self.client.create([{'name': 'x', 'parentCollection': False}], 'collections')
        self.assertEqual(len(keys), 1)
        self.assertEqual(self.sleeps, [7, 2])
        self.assertEqual(len(set(self.fake.tokens)), 1)
        self.assertEqual(len(self.fake.tokens[0]), 32)

    def test_errors_do_not_leak_key(self):
        self.fake.fail_next = [(403, {})]
        with self.assertRaises(zs.ZoteroError) as ctx:
            self.client.request('GET', '/items/top')
        self.assertNotIn(SECRET, str(ctx.exception))

    def test_cli_defaults_to_dry_run_without_writes(self):
        out = io.StringIO()
        import contextlib, os
        env = {k: os.environ.pop(k) for k in ('ZOTERO_API_KEY', 'ZOTERO_USER_ID') if k in os.environ}
        try:
            with contextlib.redirect_stdout(out):
                code = zs.main(['--live-dir', str(self.live)])
        finally:
            os.environ.update(env)
        self.assertEqual(code, 0)
        report = json.loads(out.getvalue())
        self.assertEqual(report['mode'], 'dry-run')
        self.assertFalse(report['library_checked'])


if __name__ == '__main__':
    unittest.main()
