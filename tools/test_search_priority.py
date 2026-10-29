"""Kimolos run 40857073690: old names, piracy-first queries, Alpine homonyms,
question-derived date window and the CADN consulate register as a priority target."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from connectors.open_collections import knowledge_aliases
from excerpt_ranking import rank
from search_priority import (KNOWLEDGE, guard_candidates, homonym_check, infer_window, place_piracy_first,
                             priority_targets, put_priority_first, search_name_variants, names_only)

PROSE = ' '.join(['the traveller describes the town and its people and the road'] * 4)


def row(eid, text, years=()):
    return {'evidence_id': eid, 'text': text, 'years_in_scope': list(years), 'similar_text_fingerprint': eid,
            'uncertainties': [], 'source_bibliography': {}, 'occurrences': [{'title': 'Book', 'lane': 'french'}]}


class NameVariants(unittest.TestCase):
    def test_kimolos_old_names_come_from_the_repo_knowledge_file(self):
        names = names_only(search_name_variants('Κίμωλος', ['Kimolos']))
        self.assertEqual(names[:2], ['Κίμωλος', 'Kimolos'])  # request names first, unchanged
        for n in ('Cimoli', 'Kimolo', "l'Argentière", 'Argentière', 'Cimolis', 'Argentiera'):
            self.assertIn(n, names)

    def test_any_place_uses_its_knowledge_file_old_name(self):
        self.assertIn('Milo', names_only(search_name_variants('Μήλος')))
        self.assertIn('Cerigo', names_only(search_name_variants('Κύθηρα')))

    def test_annotated_and_multi_name_lines_parse(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'k.md'
            p.write_text('## Παλιά ονόματα τόπων\n- Syra / Siro = Σύρος (νησί) · πηγή: https://x · επιβεβαιωμένο\n'
                         '## Ευρήματα\n- Fake = Ψεύτικο\n', encoding='utf-8')
            self.assertEqual(knowledge_aliases(p), [('Syra', 'Σύρος'), ('Siro', 'Σύρος')])

    def test_opt_out_keeps_only_request_names(self):
        with mock.patch.dict(os.environ, {'PCT_NAME_VARIANTS': '0'}):
            self.assertEqual(names_only(search_name_variants('Κίμωλος', ['Kimolos'])), ['Κίμωλος', 'Kimolos'])

    def test_request_identity_hash_does_not_change(self):
        # Variants go to a separate field; the canonical request still hashes aliases only.
        import research_relevance
        ident = research_relevance.identity({'search_name_variants': ['Κίμωλος', 'Cimoli']},
                                            {'target': 'Κίμωλος', 'aliases': ['Kimolos'], 'purpose': '', 'date_range': ''})
        self.assertEqual(ident['aliases'], ['Kimolos', 'Cimoli'])
        self.assertEqual(research_relevance.request_digest({}, {'target': 'Κίμωλος', 'aliases': ['Kimolos'], 'purpose': '', 'date_range': ''}),
                         research_relevance.request_digest({'search_name_variants': ['Cimoli']},
                                                           {'target': 'Κίμωλος', 'aliases': ['Kimolos'], 'purpose': '', 'date_range': ''}))


class PiracyFirst(unittest.TestCase):
    GENERIC = ['Κίμωλος', 'Kimolos', '"Κίμωλος" 1680', 'Kimolos voyage']

    def test_variant_piracy_queries_lead_the_queue(self):
        names = ['Κίμωλος', "l'Argentière", 'Cimoli']
        out = place_piracy_first(self.GENERIC, names, 'french', limit=6)
        self.assertEqual(out[:3], ['"Κίμωλος" corsaires', '"l\'Argentière" corsaires', '"Cimoli" corsaires'])
        self.assertEqual(out[3:6], ['"Κίμωλος" pirates', '"l\'Argentière" pirates', '"Cimoli" pirates'])
        self.assertEqual(out[6:], self.GENERIC)  # nothing dropped, order kept

    def test_round_budget_of_three_reaches_piracy_queries(self):
        out = place_piracy_first(self.GENERIC, ['Κίμωλος', 'Argentiera'], 'venetian', limit=8)
        self.assertTrue(all(q.endswith(('corsari', 'pirati')) for q in out[:3]))

    def test_lane_terms_then_malta_then_general_terms(self):
        from search_priority import lane_piracy_terms
        terms = lane_piracy_terms('greek')
        self.assertEqual(terms[:3], ['κουρσάροι', 'πειρατές', 'Malta'])
        for t in ('corsari', 'corsaires', 'pirati', 'pirates', 'corsairs', 'korsan'):
            self.assertIn(t, terms)

    def test_existing_piracy_queries_move_ahead_of_generic(self):
        out = place_piracy_first(['Kimolos', '"Kimolos" korsan', '__SC_FILTER__|x'], ['Kimolos'], 'ottoman', limit=0)
        self.assertEqual(out, ['"Kimolos" korsan', 'Kimolos', '__SC_FILTER__|x'])


class AlpineHomonym(unittest.TestCase):
    NAMES = ['Κίμωλος', "l'Argentière"]

    def test_alpine_argentiere_is_flagged(self):
        self.assertTrue(homonym_check("Le glacier d'Argentière près de Chamonix, Mont-Blanc", self.NAMES))

    def test_aegean_context_keeps_the_hit(self):
        self.assertIsNone(homonym_check("L'Argentière, isle de l'Archipel près de Milo; les corsaires", self.NAMES))
        self.assertIsNone(homonym_check("Argentière glacier near Milo in the Cyclades", self.NAMES))

    def test_guard_only_applies_when_the_name_is_searched(self):
        self.assertIsNone(homonym_check("Argentière, Chamonix", ['Κύθηρα', 'Cerigo']))

    def test_ranking_reads_alpine_hit_after_aegean_hit(self):
        records = [row('alps', "Argentière glacier Chamonix Mont Blanc Savoie guides. " + PROSE),
                   row('aegean', "Argentière près de Milo, Archipel. " + PROSE)]
        ordered, report = rank(records, 'Κίμωλος', ["l'Argentière"], '', 'ρόλο κουρσάρων')
        self.assertEqual([r['evidence_id'] for r in ordered], ['aegean', 'alps'])
        self.assertEqual(report['dropped'], 0)
        self.assertEqual(report['homonym_penalised'], 1)

    def test_acquisition_holds_back_alpine_candidates_without_dropping(self):
        items = [{'title': "Ascension de l'aiguille d'Argentière (Chamonix)", 'relevance_assessment': {'status': 'PRIORITY'}, 'source_lead': True},
                 {'title': "Voyage à l'Argentière et Milo", 'relevance_assessment': {'status': 'PRIORITY'}}]
        kept, held = guard_candidates(items, self.NAMES)
        self.assertEqual([x['title'] for x in kept], ["Voyage à l'Argentière et Milo"])
        self.assertEqual(held[0]['relevance_assessment']['status'], 'EXCLUDE_FROM_ACQUISITION')
        self.assertNotIn('source_lead', held[0])


class Ranking(unittest.TestCase):
    def test_greek_question_words_are_not_topic_terms(self):
        _, report = rank([row('a', PROSE)], 'Κίμωλος', [], '', 'Τι ρόλο είχε η Κίμωλος στους κουρσάρους στα ταξίδια;')
        for weak in ('ειχε', 'ρολο', 'στουσ', 'ταξιδ'):
            self.assertNotIn(weak, report['purpose_terms'])
        for strong in ('corsai', 'corsar', 'pirat', 'κουρσα', 'πειρατ'):
            self.assertIn(strong, report['purpose_terms'])

    def test_piracy_passage_outranks_plain_place_passage(self):
        records = [row('plain', 'Kimolos ' + PROSE), row('pir', 'Kimolos les corsaires de Malte ' + PROSE)]
        ordered, report = rank(records, 'Kimolos', [], '', 'κουρσάροι')
        self.assertEqual(ordered[0]['evidence_id'], 'pir')
        self.assertEqual(report['piracy_boost'], 2.0)

    def test_period_in_question_sets_the_date_window(self):
        records = [row('late', 'Kimolos 1820 ' + PROSE), row('in', 'Kimolos 1675 ' + PROSE)]
        ordered, report = rank(records, 'Kimolos', [], '', 'κουρσάροι τον 17ο αιώνα')
        self.assertEqual(report['date_window'], [1600, 1699])
        self.assertEqual(report['date_window_basis'], 'QUESTION_CENTURY')
        self.assertEqual(ordered[0]['evidence_id'], 'in')


class Window(unittest.TestCase):
    def test_inference(self):
        self.assertEqual(infer_window('1660-1700', '18ος αιώνας'), (1660, 1700, 'REQUEST_DATE_RANGE'))
        self.assertEqual(infer_window('', 'corsaires 1680-1690'), (1680, 1690, 'QUESTION_YEARS'))
        self.assertEqual(infer_window('', 'corsaires en 1685'), (1675, 1695, 'QUESTION_YEAR_PLUS_MINUS_10'))
        self.assertEqual(infer_window('', 'pirates in the 17th century')[:2], (1600, 1699))
        self.assertEqual(infer_window('', 'corsaires au XVIIIe siècle')[:2], (1700, 1799))
        self.assertEqual(infer_window('', 'κουρσάροι'), (None, None, None))


class PriorityTargets(unittest.TestCase):
    def test_consulate_register_leads_the_queue_for_kimolos(self):
        names = names_only(search_name_variants('Κίμωλος', ['Kimolos']))
        targets = priority_targets(names)
        self.assertEqual(targets[0]['identifier'], '436PO/1/3')
        self.assertTrue(targets[0]['url'].endswith('xwtmg4b7rd1q'))
        existing = {'url': targets[0]['url'], 'title': 'already discovered', 'relevance_assessment': {'status': 'PRIORITY', 'score': 12}}
        other = {'url': 'https://example.org/b', 'relevance_assessment': {'status': 'PRIORITY'}}
        queue = put_priority_first([other, existing], targets)
        self.assertEqual(len([x for x in queue if x.get('url') == targets[0]['url']]), 1)  # moved, not duplicated
        self.assertEqual(queue[-1]['url'], 'https://example.org/b')
        self.assertTrue(all(x.get('priority_target') for x in queue[:3]))

    def test_unrelated_place_gets_no_target(self):
        self.assertEqual(priority_targets(['Κύθηρα', 'Cerigo']), [])

    def test_opt_out(self):
        with mock.patch.dict(os.environ, {'PCT_PRIORITY_TARGETS': '0'}):
            self.assertEqual(priority_targets(['Κίμωλος']), [])

    def test_knowledge_file_is_the_repo_copy(self):
        self.assertTrue(str(KNOWLEDGE).endswith('knowledge/pirates_bases.md'))
        self.assertIn('Cimolis', KNOWLEDGE.read_text(encoding='utf-8'))


TOOLS = Path(__file__).resolve().parent


def run_script(script, cwd, env):
    import subprocess, sys
    full = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', **env}
    return subprocess.run([sys.executable, str(TOOLS / script)], cwd=cwd, env=full, capture_output=True, text=True, timeout=120)


class ScriptWiring(unittest.TestCase):
    """Offline: zero discovery budget and citations-only acquisition, so no network call is made."""

    def test_lane_discovery_queues_piracy_variants_first_except_map_catalogues(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / 'repository_plans').mkdir()
            plan = {'target': 'Κίμωλος', 'aliases': ['Kimolos'], 'date_range': '',
                    'expanded_queries': ['Κίμωλος', 'Kimolos'],
                    'repositories': [{'name': 'Gallica/BnF', 'base_url': 'x'}, {'name': 'David Rumsey Map Collection', 'base_url': 'y'}],
                    'target_identity': {'target': 'Κίμωλος', 'aliases': ['Kimolos'],
                                        'focus': {'kind': 'place', 'target': 'Κίμωλος', 'aliases': ['Kimolos']}}}
            (Path(d) / 'repository_plans/french.json').write_text(json.dumps(plan, ensure_ascii=False))
            r = run_script('lane_repository_discovery.py', d, {'PCT_RESEARCH_LANE': 'french', 'PCT_DISCOVERY_BUDGET_SECONDS': '0'})
            self.assertEqual(r.returncode, 0, r.stderr)
            attempts = {a['repository']: a['deferred_queries'] for a in json.loads((Path(d) / 'lane_discovery/french.json').read_text())['attempts']}
            self.assertTrue(all('corsaires' in q for q in attempts['Gallica/BnF'][:3]))
            self.assertIn("\"l'Argentière\" corsaires", attempts['Gallica/BnF'])
            self.assertFalse(any('corsaires' in q for q in attempts['David Rumsey Map Collection']))

    def test_acquisition_puts_register_first_and_holds_alpine_candidate(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / 'citation_chase_candidates').mkdir()
            req = {'target': 'Κίμωλος', 'aliases': ['Kimolos'], 'date_range': '', 'purpose': 'κουρσάροι',
                   'search_name_variants': ['Κίμωλος', 'Kimolos', "l'Argentière"]}
            (Path(d) / 'req.json').write_text(json.dumps(req, ensure_ascii=False))
            (Path(d) / 'citation_chase_candidates/repository_candidates.json').write_text(json.dumps({'selected': [
                {'discovery_repository': 'Gallica/BnF', 'identifier': 'alps', 'title': "Le glacier d'Argentière, Chamonix", 'url': 'https://example.org/alps', 'source_lead': True},
                {'discovery_repository': 'Gallica/BnF', 'identifier': 'aeg', 'title': "Voyage au Levant: l'Argentière et Milo", 'url': 'https://example.org/aeg'}]}))
            r = run_script('acquire_library_candidate.py', d, {'PCT_REQUEST_FILE': str(Path(d) / 'req.json'), 'PCT_CONTINUE_CITATIONS_ONLY': '1'})
            self.assertEqual(r.returncode, 0, r.stderr)
            backlog = json.loads((Path(d) / 'library_acquisition/acquisition_backlog.json').read_text())
            self.assertEqual(backlog['deferred'][0]['identifier'], '436PO/1/3')
            self.assertEqual([x['identifier'] for x in backlog['excluded_from_auto_acquisition']], ['alps'])

    def test_preflight_records_variants_without_changing_request_hash(self):
        digests = []
        for flag in ('1', '0'):
            with tempfile.TemporaryDirectory() as d:
                (Path(d) / 'r.json').write_text(json.dumps({'target': 'Κίμωλος', 'aliases': ['Kimolos'], 'date_range': '',
                                                            'purpose': 'κουρσάροι'}, ensure_ascii=False))
                r = run_script('research_preflight.py', d, {'PCT_REQUEST_FILE': str(Path(d) / 'r.json'), 'PCT_NAME_VARIANTS': flag,
                                                            'PCT_TARGET': '', 'GITHUB_OUTPUT': ''})
                self.assertEqual(r.returncode, 0, r.stderr)
                resolved = json.loads((Path(d) / 'resolved_research_request.json').read_text())
                self.assertEqual(resolved['aliases'], ['Kimolos'])
                if flag == '1':
                    self.assertIn('Cimoli', resolved['search_name_variants'])
                digests.append(json.loads((Path(d) / 'research_request_identity.json').read_text())['request_sha256'])
        self.assertEqual(digests[0], digests[1])


if __name__ == '__main__':
    unittest.main()
