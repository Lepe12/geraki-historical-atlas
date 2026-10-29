import json
import unittest

from query_plan import OR_SYNTAX, REGISTER, combined_queries, search_log, with_combined_first

IA = OR_SYNTAX['Internet Archive']
NAMES = ['Kimolos', 'Argentière', "l'Argentière", 'Cimolo', 'Κίμωλος']
TERMS = ['corsaires', 'pirates', 'forbans']


class Combined(unittest.TestCase):
    def test_one_boolean_query_with_all_variants_and_terms(self):
        q = combined_queries(NAMES, TERMS, IA)
        self.assertEqual(len(q), 1)
        self.assertEqual(q[0], '("Kimolos" OR "Argentière" OR "l\'Argentière" OR "Cimolo" OR "Κίμωλος") AND (corsaires OR pirates OR forbans)')

    def test_split_when_too_long_and_no_name_lost(self):
        names = ['Name%02d' % i for i in range(40)]
        q = combined_queries(names, TERMS, IA, max_chars=200)
        self.assertGreater(len(q), 1); self.assertTrue(all(len(x) <= 200 for x in q))
        self.assertTrue(all('Name%02d' % i in ' '.join(q) for i in range(40)))

    def test_names_only_and_filter_markers(self):
        self.assertEqual(combined_queries(['A', '__SC_FILTER__|x'], [], IA), ['"A"'])
        self.assertEqual(combined_queries([], TERMS, IA), [])

    def test_only_or_capable_sources_get_it_and_switches(self):
        q, note = with_combined_first('Internet Archive', ['Kimolos'], NAMES, TERMS, env={})
        self.assertTrue(note['combined_or']); self.assertTrue(q[0].startswith('(')); self.assertIn('Kimolos', q)
        q, note = with_combined_first('Gallica/BnF', ['Kimolos'], NAMES, TERMS, env={})
        self.assertEqual((q, note['combined_or']), (['Kimolos'], False))
        q, note = with_combined_first('Gallica/BnF', ['Kimolos'], NAMES, TERMS, env={'PCT_OR_QUERY_SOURCES': 'Gallica/BnF'})
        self.assertTrue(note['combined_or'])
        q, note = with_combined_first('Internet Archive', ['Kimolos'], NAMES, TERMS, env={'PCT_OR_QUERIES': '0'})
        self.assertEqual(q, ['Kimolos'])


class Log(unittest.TestCase):
    def test_prisma_s_counts_and_requests(self):
        attempts = [{'repository': 'Internet Archive', 'status': 'PARTIAL', 'hits': 7, 'base_url': 'https://archive.org',
                     'queries': [{'query': 'a', 'status': 'EXECUTED', 'hits': 7}], 'deferred_queries': ['b', 'c']},
                    {'repository': 'PARES', 'status': 'AUTH_OR_BROWSER_REQUIRED', 'hits': 0, 'base_url': 'x',
                     'queries': [{'query': 'a', 'status': 'AUTH_OR_BROWSER_REQUIRED', 'hits': 0}],
                     'remaining_queries_not_retried': ['b'], 'deferred_queries': []}]
        log = search_log('french', attempts, [['a', 'b', 'c'], ['a', 'b']], {'Internet Archive': {'combined_or': True}}, 220, 3)
        self.assertEqual(log['totals'], {'planned': 5, 'run': 2, 'deferred_to_next_pass': 2, 'not_retried_after_block': 1, 'hits': 7})
        self.assertTrue(log['sources'][0]['combined_or'])
        names = [r['source'] for r in log['access_requests_for_historian']]
        self.assertIn('PARES', names)
        self.assertIn('PORTIC / Navigocorpus API', [r['name'] for r in log['not_searched_automatically']])
        self.assertEqual(log['deleted_queries'], 0)

    def test_register_records_portic_as_unreachable_not_connected(self):
        reg = json.loads(REGISTER.read_text())
        portic = [r for r in reg['sources'] if r['name'].startswith('PORTIC')][0]
        self.assertEqual(portic['status'], 'UNREACHABLE')


class ScriptWiring(unittest.TestCase):
    def test_lane_discovery_writes_search_log_and_puts_or_query_first_offline(self):
        import tempfile
        from pathlib import Path
        from test_search_priority import run_script
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / 'repository_plans').mkdir()
            plan = {'target': 'Κίμωλος', 'aliases': ['Kimolos'], 'date_range': '', 'expanded_queries': ['Κίμωλος', 'Kimolos'],
                    'repositories': [{'name': 'Internet Archive', 'base_url': 'https://archive.org'}, {'name': 'Gallica/BnF', 'base_url': 'x'}],
                    'target_identity': {'target': 'Κίμωλος', 'aliases': ['Kimolos'],
                                        'focus': {'kind': 'place', 'target': 'Κίμωλος', 'aliases': ['Kimolos']}}}
            (Path(d) / 'repository_plans/french.json').write_text(json.dumps(plan, ensure_ascii=False))
            r = run_script('lane_repository_discovery.py', d, {'PCT_RESEARCH_LANE': 'french', 'PCT_DISCOVERY_BUDGET_SECONDS': '0'})
            self.assertEqual(r.returncode, 0, r.stderr)
            out = json.loads((Path(d) / 'lane_discovery/french.json').read_text())
            ia = [a for a in out['attempts'] if a['repository'] == 'Internet Archive'][0]
            self.assertIn(' OR ', ia['deferred_queries'][0]); self.assertIn('Argenti', ia['deferred_queries'][0])
            gallica = [a for a in out['attempts'] if a['repository'] == 'Gallica/BnF'][0]
            self.assertNotIn(' OR ', gallica['deferred_queries'][0])
            log = json.loads((Path(d) / 'lane_discovery/french.search_log.json').read_text())
            self.assertEqual(log['totals']['run'], 0)
            self.assertEqual(log['totals']['planned'], log['totals']['deferred_to_next_pass'])
            self.assertEqual(out['search_log']['policy'], 'prisma-s-query-plan-v1')


if __name__ == '__main__':
    unittest.main()
