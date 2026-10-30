import json
from pathlib import Path
import tempfile
import unittest

from excerpt_ranking import expand_names, rank
from continuation_rounds import load, record, round_number, stop_rule, stopped
from semantic_research_answer import render, research_funnel


def row(eid, text, years=(), title='Book', fp=None):
    return {'evidence_id': eid, 'text': text, 'years_in_scope': list(years),
            'similar_text_fingerprint': fp or eid, 'uncertainties': [],
            'source_bibliography': {}, 'occurrences': [{'title': title, 'lane': 'travellers'}]}


PROSE = ' '.join(['the traveller describes the harbour and the town and its people'] * 4)
OTHER = ' '.join(['an unrelated discussion of the botany and soil of the region in general'] * 4)


class RankingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.gaz = Path(self.temp.name) / 'gaz.json'
        self.gaz.write_text(json.dumps({'places': [{'seed_title': 'Kimolos', 'modern_name': {'el': 'Κίμωλος'},
            'variants': [{'name': 'Argentiera'}, {'name': 'Cimolos'}]}]}))

    def test_alias_and_old_name_expansion_from_gazetteer(self):
        names = expand_names(['Κίμωλος'], self.gaz)
        self.assertIn('Argentiera', names); self.assertIn('Cimolos', names)

    def test_target_and_old_name_ranked_before_first_n(self):
        records = [row('e-a', OTHER), row('e-b', OTHER + ' soil'),
                   row('e-c', 'At Argentière the corsairs anchored. ' + PROSE)]
        ordered, report = rank(records, 'Κίμωλος', [], '', 'role for corsairs', self.gaz)
        self.assertEqual(ordered[0]['evidence_id'], 'e-c')
        self.assertEqual(report['dropped'], 0)
        self.assertEqual(len(ordered), 3)
        self.assertGreater(report['scores'][0]['name_bm25'], 0)

    def test_date_window_prefers_in_scope(self):
        records = [row('e-out', 'Kimolos in 1850. ' + PROSE), row('e-in', 'Kimolos in 1670. ' + PROSE, [1670])]
        ordered, _ = rank(records, 'Kimolos', [], '1660-1680', '', self.gaz)
        self.assertEqual(ordered[0]['evidence_id'], 'e-in')

    def test_near_duplicates_read_last_never_dropped(self):
        a = 'Kimolos ' + PROSE
        b = 'Kimolos  ' + PROSE.replace('people', 'peo-ple')  # OCR variant via a second lane
        records = [row('e-a', a), row('e-b', b), row('e-c', 'Kimolos harbour ' + OTHER)]
        ordered, report = rank(records, 'Kimolos', [], '', '', self.gaz)
        self.assertEqual(ordered[-1]['evidence_id'], 'e-b')
        self.assertEqual(report['near_duplicate_ids'], ['e-b'])
        self.assertEqual({r['evidence_id'] for r in ordered}, {'e-a', 'e-b', 'e-c'})

    def test_same_fingerprint_is_duplicate(self):
        records = [row('e-a', 'Kimolos ' + PROSE, fp='x'), row('e-b', 'Kimolos ' + OTHER, fp='x')]
        _, report = rank(records, 'Kimolos', [], '', '', self.gaz)
        self.assertEqual(report['near_duplicates_read_last'], 1)

    def test_deterministic(self):
        records = [row('e-%d' % i, ('Kimolos ' if i % 3 == 0 else '') + PROSE + ' %d' % i) for i in range(30)]
        first = rank(records, 'Kimolos', [], '', '', self.gaz)
        second = rank(list(reversed(records)), 'Kimolos', [], '', '', self.gaz)
        self.assertEqual(first[1]['scores'][0], first[1]['scores'][0])
        self.assertEqual(rank(records, 'Kimolos', [], '', '', self.gaz), first)
        self.assertEqual({r['evidence_id'] for r in second[0]}, {r['evidence_id'] for r in first[0]})

    def test_bare_heading_does_not_outrank_prose(self):
        records = [row('e-h', 'ΚΙΜΩΛΟΣ'), row('e-p', 'The island of Kimolos has a harbour. ' + PROSE)]
        ordered, _ = rank(records, 'Κίμωλος', ['Kimolos'], '', '', self.gaz)
        self.assertEqual(ordered[0]['evidence_id'], 'e-p')


def answer(supported=(), unsupported=(), sections=0, status='RESEARCH_COVERAGE_PENDING'):
    claims = [{'claim_id': c, 'status': 'QUOTATION_SUPPORTED_HISTORY_PENDING'} for c in supported]
    claims += [{'claim_id': c, 'status': 'INSUFFICIENT_EVIDENCE'} for c in unsupported]
    return {'status': status, 'claim_evidence_assessment': {'claims': claims},
            'answer_sections': [{}] * sections, 'calls': []}


class RoundTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cont = self.root / 'research_continuation'
        (self.cont / 'g').mkdir(parents=True)
        (self.cont / 'active.json').write_text(json.dumps({'queue': 'g/queue.json'}))
        self.env = {'PCT_CONTINUATION_MAX_ROUNDS': '5', 'PCT_CONTINUATION_NO_GAIN_ROUNDS': '2'}

    def queue(self, examined, total=398):
        status = 'COMPLETE' if examined >= total else 'PENDING'
        (self.cont / 'g/queue.json').write_text(json.dumps({'total': total, 'completed': examined, 'status': status,
            'items':[{'evidence_id':'e%d'%i,'status':'EXAMINED' if i<examined else 'PENDING'} for i in range(total)]}))

    def test_metrics_per_round(self):
        self.queue(8); record(self.root, answer(unsupported=['c1', 'c2']), 0, 'research_answer', self.env)
        self.queue(20); ledger = record(self.root, answer(['c3'], ['c1']), 1, 'semantic_reanalysis_1', self.env)
        last = ledger['rounds'][-1]
        self.assertEqual((last['examined'], last['remaining'], last['new_examined'], last['new_supported_claims']),
                         (20, 378, 12, 1))
        self.assertIsNone(ledger['stop_reason'])
        self.assertTrue((self.cont / 'rounds.json').is_file())

    def test_stop_when_all_read(self):
        self.queue(10, total=10)
        self.assertEqual(record(self.root, answer(['c1']), 1, None, self.env)['stop_reason'], 'ALL_EXCERPTS_READ')

    def test_stop_after_consecutive_rounds_without_new_supported_claims(self):
        self.queue(8); record(self.root, answer(['c1']), 0, None, self.env)
        self.queue(20); self.assertIsNone(record(self.root, answer(['c1'], ['c2']), 1, None, self.env)['stop_reason'])
        self.queue(30); self.assertEqual(record(self.root, answer(['c1']), 2, None, self.env)['stop_reason'],
                                         'NO_NEW_SUPPORTED_CLAIMS')
        self.assertEqual(stopped(self.root), 'NO_NEW_SUPPORTED_CLAIMS')

    def test_single_round_rule_when_configured(self):
        self.queue(8); record(self.root, answer(), 0, None, self.env)
        self.queue(20)
        env = {**self.env, 'PCT_CONTINUATION_NO_GAIN_ROUNDS': '1'}
        self.assertEqual(record(self.root, answer(), 1, None, env)['stop_reason'], 'NO_NEW_SUPPORTED_CLAIMS')

    def test_max_rounds_cap(self):
        for n in range(6):
            self.queue(8 + 10 * n)
            ledger = record(self.root, answer(['c%d' % n]), n, None, self.env)
        self.assertEqual(ledger['stop_reason'], 'MAX_CONTINUATION_ROUNDS')

    def test_round_number_counts_published_passes(self):
        (self.root / 'semantic_reanalysis_1').mkdir(); (self.root / 'semantic_reanalysis_2').mkdir()
        self.assertEqual(round_number(self.root, 'semantic_reanalysis_3'), 3)
        self.assertEqual(round_number(self.root, 'semantic_reanalysis_2'), 2)

    def test_no_ledger_means_no_stop(self):
        self.assertIsNone(stopped(self.root)); self.assertEqual(load(self.root)['rounds'], [])
        self.assertIsNone(stop_rule({'rounds': []}, {'max_rounds': 5, 'no_gain_rounds': 2}))


class FunnelTests(unittest.TestCase):
    def test_funnel_counts_and_report_stages(self):
        out = {'question': 'Κίμωλος', 'status': 'RESEARCH_COVERAGE_PENDING',
               'coverage': {'unique_passages': 398, 'excluded': [{}] * 62, 'selected_passages': 8,
                            'deferred': [{'evidence_id': 'x%d' % i} for i in range(390)]},
               'evidence': [{'evidence_id': 'e%d' % i} for i in range(8)],
               'claims': [{'claim_id': 'c1'}, {'claim_id': 'c2'}], 'rejected': [{}] * 8,
               'answer_sections': [], 'configuration': {'missing': []}, 'human_reviewed': False,
               'claim_evidence_assessment': {'claims': [{'claim_id': 'c1', 'status': 'INSUFFICIENT_EVIDENCE', 'label_el': 'x'},
                                                        {'claim_id': 'c2', 'status': 'INSUFFICIENT_EVIDENCE', 'label_el': 'x'}]}}
        funnel = research_funnel(out)
        self.assertEqual(funnel['collected']['unique_excerpts'], 398)
        self.assertEqual(funnel['examined'], {'excerpts': 8, 'remaining': 390, 'deferred': 390})
        self.assertEqual(funnel['claims']['supported_by_quotation'], 0)
        self.assertEqual(funnel['provisional_synthesis']['paragraphs'], 0)
        out['research_funnel'] = funnel
        text = render(out)
        for stage in ('Collected', 'Examined', 'Supported claims', 'Provisional synthesis', 'Human verification'):
            self.assertIn(stage, text)
        self.assertNotIn('Η απάντηση είναι ανάλυση μοντέλου', text)
        self.assertIn('Δεν υπάρχει ακόμη τελική σύνθεση', text)


class HandoffStopTests(unittest.TestCase):
    def test_clean_stop_is_not_held_or_failed(self):
        from research_continuation_handoff import handoff_outputs, clean
        self.assertTrue(clean('CONTINUATION_STOPPED:MAX_CONTINUATION_ROUNDS'))
        self.assertEqual(handoff_outputs({'1': (False, 'CONTINUATION_STOPPED:NO_NEW_SUPPORTED_CLAIMS')}),
                         {'restart': False, 'held_runs': []})

    def test_coordinator_skips_stopped_corpus(self):
        from research_continuation_handoff import select
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            for run, reason in (('100', 'MAX_CONTINUATION_ROUNDS'), ('200', None)):
                cont = base / 'evidence/runs' / run / 'research_continuation'
                (cont / 'g').mkdir(parents=True)
                (cont / 'active.json').write_text(json.dumps({'queue': 'g/queue.json'}))
                (cont / 'g/queue.json').write_text(json.dumps({'total': 2, 'completed': 0, 'status': 'PENDING',
                    'items': [{'evidence_id': 'a', 'status': 'PENDING'}, {'evidence_id': 'b', 'status': 'PENDING'}]}))
                if reason:
                    (cont / 'rounds.json').write_text(json.dumps({'schema': 'research-continuation-rounds-v1',
                                                                  'rounds': [], 'stop_reason': reason}))
            (base / 'research_continuation_requests').mkdir()
            self.assertEqual(list(select(base)), ['200'])

    def test_decision_reports_recorded_stop(self):
        from unittest.mock import patch
        import research_continuation_handoff as handoff
        with patch.object(handoff, 'progress_decision', return_value=(True, 'NEW_EXAMINED_ITEMS:5')), \
             patch.object(handoff, 'stopped', return_value='NO_NEW_SUPPORTED_CLAIMS'):
            self.assertEqual(handoff.decision(Path('.'), {}, 1),
                             (False, 'CONTINUATION_STOPPED:NO_NEW_SUPPORTED_CLAIMS'))
        with patch.object(handoff, 'progress_decision', return_value=(True, 'NEW_EXAMINED_ITEMS:5')), \
             patch.object(handoff, 'stopped', return_value=None):
            self.assertEqual(handoff.decision(Path('.'), {}, 1), (True, 'NEW_EXAMINED_ITEMS:5'))


if __name__ == '__main__':
    unittest.main()
