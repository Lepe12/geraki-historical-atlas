import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import place_context
from place_context import AMBIGUOUS, NO_MENTION, ON_TARGET, OTHER_PLACE, classify, profile
from excerpt_screening import screen
from search_priority import guard_candidates

FIXTURE = {'schema': 'pct-place-context-v1', 'places': {
    'gz:Q919194': {'wikidata': 'Q919194', 'names': ['Κίμωλος', 'Kimolos', 'Cimolo', 'Argentière', 'Argentiera'],
                   'context': ['Μήλος', 'Milo', 'Milos', 'Polyaigos', 'Siphanto', 'Cyclades', 'Archipel', 'Levant',
                               'Greek Archipelago'],
                   'ambiguous_names': {'Argentière': [{'qid': 'Q1', 'km': 2000}], 'Argentiera': [{'qid': 'Q2', 'km': 1500}]}}}}
NAMES = ['Κίμωλος', 'Kimolos', 'Argentière', 'Argentiera']


class Base(unittest.TestCase):
    def setUp(self):
        d = tempfile.TemporaryDirectory(); self.addCleanup(d.cleanup)
        path = Path(d.name) / 'ctx.json'; path.write_text(json.dumps(FIXTURE))
        p = mock.patch.object(place_context, 'CACHE', path); p.start(); self.addCleanup(p.stop)
        place_context._load.cache_clear(); self.addCleanup(place_context._load.cache_clear)


class PlaceContextTests(Base):
    def test_profile_splits_clear_and_ambiguous(self):
        prof = profile(NAMES)
        self.assertEqual(prof['place_ids'], ['gz:Q919194'])
        self.assertEqual(set(prof['ambiguous_names']), {'Argentière', 'Argentiera'})
        self.assertIn('Kimolos', prof['clear_names'])

    def test_unambiguous_name_alone_is_on_target(self):
        self.assertEqual(classify('Les corsaires mouillaient à Kimolos.', NAMES)[0], ON_TARGET)
        self.assertEqual(classify('οι πειραταί της Κιμώλου', NAMES)[0], ON_TARGET)

    def test_ambiguous_name_needs_context(self):
        self.assertEqual(classify("Le consul de l'Argentière écrit au sujet des corsaires.", NAMES)[0], AMBIGUOUS)
        status, detail = classify("Le consul de l'Argentière et de Milo, dans l'Archipel.", NAMES)
        self.assertEqual(status, ON_TARGET); self.assertIn('AMBIGUOUS_NAME_WITH_CONTEXT', detail)
        self.assertEqual(classify('the Argentiera, near Polyaigos', NAMES)[0], ON_TARGET)

    def test_other_place_homonym_and_no_mention(self):
        self.assertEqual(classify("L'Argentière-la-Bessée, Hautes-Alpes, mines du Dauphiné", NAMES)[0], OTHER_PLACE)
        self.assertEqual(classify('Rien sur cette île.', NAMES)[0], NO_MENTION)

    def test_generic_for_any_place_without_cache_entry(self):
        prof = profile(['Nowhere-on-map'])
        self.assertEqual(prof['ambiguous_names'], [])
        self.assertEqual(classify('Nowhere-on-map harbour', ['Nowhere-on-map'], prof)[0], ON_TARGET)

    def test_acquisition_holds_ambiguous_candidate_for_review(self):
        items = [{'title': "Mémoire sur l'Argentière", 'relevance_assessment': {'status': 'PRIORITY'}, 'source_lead': {}},
                 {'title': "Lettres de l'Argentière et Milo", 'relevance_assessment': {'status': 'PRIORITY'}},
                 {'title': 'Kimolos', 'relevance_assessment': {'status': 'PRIORITY'}}]
        kept, held = guard_candidates(items, NAMES, env={})
        self.assertEqual([x['title'] for x in kept], ["Lettres de l'Argentière et Milo", 'Kimolos'])
        self.assertEqual(held[0]['relevance_assessment']['status'], 'REVIEW_REQUIRED')
        self.assertIn('AMBIGUOUS_PLACE_NAME_WITHOUT_CONTEXT', held[0]['relevance_assessment']['reason'])
        self.assertNotIn('source_lead', held[0])
        kept, held = guard_candidates(items, NAMES, env={'PCT_PLACE_CONTEXT': '0'})
        self.assertEqual(len(kept), 3)


def rec(eid, text, years=()):
    return {'evidence_id': eid, 'text': text, 'years_in_scope': list(years),
            'occurrences': [{'title': 'T ' + eid, 'url': 'u', 'lane': 'gallica'}]}


class ScreeningTests(Base):
    PURPOSE = 'Πειρατές και κουρσάροι στην Κίμωλο, ορμητήρια, 17ος αιώνας'

    def records(self):
        return [rec('ok', 'Les corsaires relâchaient à Kimolos en 1672.', [1672]),
                rec('amb', "Les corsaires à l'Argentière en 1680.", [1680]),
                rec('amb_ctx', "Les corsaires à l'Argentière près de Milo en 1680.", [1680]),
                rec('topic', 'Kimolos produit de la terre cimolée.'),
                rec('period', 'Les pirates de Kimolos en 1941.', [1941])]

    def test_explicit_criteria_and_reasons(self):
        passed, failed, report = screen(self.records(), 'place', 'Κίμωλος', ['Kimolos', 'Argentière'], '', self.PURPOSE, env={})
        self.assertEqual([r['evidence_id'] for r in passed], ['ok', 'amb_ctx'])
        why = {f['evidence_id']: f['detail'] for f in failed}
        self.assertEqual(why, {'amb': 'NO_PLACE', 'topic': 'NO_TOPIC', 'period': 'NO_PERIOD'})
        self.assertEqual(report['model_calls'], 0); self.assertEqual(report['deleted'], 0)
        self.assertEqual(report['criteria']['themes'][0], 'piracy')
        self.assertEqual(passed[0]['screening']['period']['answer'], 'YES')
        self.assertTrue(all(f['re_include_with'].startswith('PCT_SCREENING_REINCLUDE=') for f in failed))

    def test_no_years_is_unknown_and_passes(self):
        passed, _, _ = screen([rec('n', 'Pirates at Kimolos.')], 'place', 'Kimolos', [], '', self.PURPOSE, env={})
        self.assertEqual(passed[0]['screening']['period']['answer'], 'UNKNOWN')

    def test_reinclude_and_disable(self):
        passed, failed, _ = screen(self.records(), 'place', 'Κίμωλος', ['Kimolos', 'Argentière'], '', self.PURPOSE,
                                   env={'PCT_SCREENING_REINCLUDE': 'amb'})
        self.assertIn('amb', [r['evidence_id'] for r in passed]); self.assertEqual(len(failed), 2)
        passed, failed, report = screen(self.records(), 'place', 'Κίμωλος', [], '', self.PURPOSE, env={'PCT_SCREENING': '0'})
        self.assertEqual((len(passed), failed, report['applied']), (5, [], False))

    def test_topic_questions_not_screened_and_theme_free_questions_skip_topic(self):
        _, failed, report = screen(self.records(), 'topic', 'piracy', [], '', '', env={})
        self.assertFalse(report['applied']); self.assertEqual(failed, [])
        passed, failed, _ = screen(self.records(), 'place', 'Κίμωλος', ['Kimolos', 'Argentière'], '', 'Ιστορία της Κιμώλου', env={})
        self.assertEqual({f['evidence_id'] for f in failed}, {'amb'})


class DiminishingReturnsTests(unittest.TestCase):
    def setUp(self):
        d = tempfile.TemporaryDirectory(); self.addCleanup(d.cleanup)
        self.root = Path(d.name); cont = self.root / 'research_continuation'; (cont / 'g').mkdir(parents=True)
        (cont / 'active.json').write_text(json.dumps({'queue': 'g/queue.json'})); self.cont = cont
        self.env = {'PCT_CONTINUATION_MAX_ROUNDS': '5', 'PCT_CONTINUATION_NO_GAIN_ROUNDS': '2'}

    def queue(self, n):
        (self.cont / 'g/queue.json').write_text(json.dumps({'total': 398, 'completed': n, 'status': 'PENDING', 'items': [{'evidence_id': str(i), 'status': 'EXAMINED'} for i in range(n)]}))

    def answer(self, sup=(), uns=()):
        cl = [{'claim_id': c, 'status': 'QUOTATION_SUPPORTED_HISTORY_PENDING'} for c in sup]
        cl += [{'claim_id': c, 'status': 'INSUFFICIENT_EVIDENCE'} for c in uns]
        return {'status': 'RESEARCH_COVERAGE_PENDING', 'claim_evidence_assessment': {'claims': cl}, 'calls': []}

    def test_round_without_any_new_claim_stops(self):
        from continuation_rounds import CLEAN_STOPS, record
        self.queue(8); record(self.root, self.answer(['c1']), 0, None, self.env)
        self.queue(20); ledger = record(self.root, self.answer(['c1'], ['c2']), 1, None, self.env)
        self.assertIsNone(ledger['stop_reason']); self.assertEqual(ledger['rounds'][-1]['new_claims'], 1)
        self.queue(30); ledger = record(self.root, self.answer(['c1'], ['c2']), 2, None, self.env)
        self.assertEqual(ledger['stop_reason'], 'NO_NEW_SUPPORTED_CLAIMS')  # older rule keeps precedence
        self.assertIn('DIMINISHING_RETURNS', CLEAN_STOPS)

    def test_diminishing_returns_when_only_supported_rule_would_wait(self):
        from continuation_rounds import record
        self.queue(8); record(self.root, self.answer(['c1']), 0, None, self.env)
        self.queue(20); ledger = record(self.root, self.answer(['c1']), 1, None, self.env)
        self.assertEqual(ledger['stop_reason'], 'DIMINISHING_RETURNS')
        self.queue(20)
        env = {**self.env, 'PCT_CONTINUATION_DIMINISHING_RETURNS': '0'}
        self.assertIsNone(record(self.root, self.answer(['c1']), 1, None, env)['stop_reason'])

    def test_legacy_ledgers_without_claim_ids_do_not_trigger(self):
        from continuation_rounds import stop_rule
        rounds = [{'round': 0, 'examined': 8, 'remaining': 390, 'new_examined': 8, 'new_supported_claims': 1, 'total': 398},
                  {'round': 1, 'examined': 20, 'remaining': 378, 'new_examined': 12, 'new_supported_claims': 1, 'total': 398,
                   'new_claims': None}]
        self.assertIsNone(stop_rule({'rounds': rounds}, {'max_rounds': 5, 'no_gain_rounds': 2}))


class CommittedCacheTests(unittest.TestCase):
    def test_kimolos_entry_when_cache_present(self):
        path = Path(__file__).resolve().parents[1] / 'data/gazetteer/place_context.v1.json'
        if not path.exists():
            self.skipTest('cache not built')
        k = json.loads(path.read_text())['places']['gz:Q919194']
        ctx = {c.lower() for c in k['context']}
        for want in ('milos', 'cyclades', 'archipel', 'levant'):
            self.assertIn(want, ctx)
        self.assertIn('Argentière', k['ambiguous_names'])


if __name__ == '__main__':
    unittest.main()
