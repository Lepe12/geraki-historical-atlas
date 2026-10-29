import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import citation_snowball as cs


W = lambda i, title, year=1990, doi=None, refs=(): {'id': 'https://openalex.org/' + i, 'display_name': title,
    'publication_year': year, 'doi': ('https://doi.org/' + doi) if doi else None,
    'authorships': [{'author': {'display_name': 'A. Author'}}], 'referenced_works': ['https://openalex.org/' + r for r in refs]}


class FakeOpenAlex:
    def __init__(self):
        self.calls = []

    def __call__(self, url):
        from urllib.parse import unquote
        self.calls.append(url); url = unquote(url)
        if '/works/doi:10.1/seed' in url:
            return W('W1', 'Seed book on Aegean corsairs', doi='10.1/seed', refs=('W2', 'W3'))
        if 'openalex_id' in url:
            return {'results': [W('W2', 'Les corsaires de Kimolos', 1960), W('W3', 'Wine trade of Naxos', 1950)]}
        if 'cites:W1' in url:
            return {'results': [W('W4', 'Piracy in the Archipelago', 2001, doi='10.2/b')]}
        if 'search=' in url:
            return {'results': [W('W9', 'A different book entirely', 1990)]}
        return None


class Snowball(unittest.TestCase):
    def test_committed_seed_file_is_empty_for_the_historian(self):
        data = json.loads(cs.SEEDS.read_text())
        self.assertEqual(data['seeds'], [])
        self.assertEqual(cs.snowball(cs.load_seeds())['status'], 'NO_SEEDS_PROVIDED')

    def test_no_seeds_means_no_network(self):
        class Boom:
            name = 'x'
            def resolve(self, s): raise AssertionError('network')
        self.assertEqual(cs.snowball([], sources=[Boom()])['status'], 'NO_SEEDS_PROVIDED')

    def test_backward_and_forward_with_request_matching(self):
        fake = FakeOpenAlex()
        rep = cs.snowball([{'doi': '10.1/seed'}], {'target': 'Κίμωλος', 'aliases': ['Kimolos']},
                          sources=[cs.OpenAlex(get=fake, env={})], pause=0)
        self.assertEqual(rep['status'], 'OK'); self.assertEqual(rep['seeds'][0]['referenced_by_seed'], 2)
        titles = [c['title'] for c in rep['candidates']]
        self.assertEqual(len(titles), 3); self.assertEqual(rep['deleted'], 0)
        self.assertEqual(rep['candidates'][-1]['reading_priority'], 'NO_TERM_MATCH_IN_TITLE')  # Naxos kept, last
        first = {c['title']: c for c in rep['candidates']}
        self.assertIn('kimolos', first['Les corsaires de Kimolos']['matched_request_terms'])
        self.assertEqual(first['Piracy in the Archipelago']['via'][0]['relation'], 'CITES_SEED')
        rows = cs.as_discovery_candidates(rep)
        self.assertEqual(rows[0]['discovery_repository'], 'citation_snowball')
        self.assertTrue(all('api_key' not in u for u in fake.calls))

    def test_title_seed_never_guessed(self):
        rep = cs.snowball([{'title': 'Seed book on Aegean corsairs', 'author': 'Author'}], {},
                          sources=[cs.OpenAlex(get=FakeOpenAlex(), env={})], pause=0)
        self.assertEqual(rep['seeds'][0]['status'], 'UNRESOLVED'); self.assertEqual(rep['candidates'], [])

    def test_rate_limit_recorded_and_fallback_used(self):
        def limited(url): raise cs.SourceStop('RATE_LIMITED')
        class S2Fake(cs.SemanticScholar):
            def __init__(self): super().__init__(get=lambda url: (
                {'paperId': 'P1', 'title': 'Seed', 'externalIds': {'DOI': '10.1/seed'}} if '/paper/DOI:' in url else
                {'data': [{'citedPaper': {'paperId': 'P2', 'title': 'Corsairs at Milo'}}]} if 'references' in url else {'data': []}))
        rep = cs.snowball([{'doi': '10.1/seed'}], {}, sources=[cs.OpenAlex(get=limited, env={}), S2Fake()], pause=0)
        self.assertEqual(rep['source_status'], {'openalex': 'RATE_LIMITED'})
        self.assertEqual(rep['seeds'][0]['source'], 'semantic_scholar')
        self.assertEqual(rep['candidates'][0]['title'], 'Corsairs at Milo')

    def test_optional_key_and_mailto_from_env(self):
        oa = cs.OpenAlex(get=lambda u: None, env={'OPENALEX_API_KEY': 'k', 'PCT_OPENALEX_MAILTO': 'm@x'})
        self.assertIn('api_key=k', oa.url('/works')); self.assertIn('mailto=m%40x', oa.url('/works'))

    def test_cli_with_empty_seed_file_is_offline(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'o.json'
            subprocess.run([sys.executable, str(Path(cs.__file__)), '--out', str(out)], check=True, capture_output=True)
            self.assertEqual(json.loads(out.read_text())['status'], 'NO_SEEDS_PROVIDED')


if __name__ == '__main__':
    unittest.main()
