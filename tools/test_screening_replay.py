"""Screening over-pruning regression (explicit-criteria-screening v1 -> v2).

Offline only: no model, network or backend. fixtures/screening_replay/ holds the
excerpt corpora collected by the 2026-10-29 reliability run (23 of 24 items;
FC-05 is omitted for size, it has no theme so screening cannot change it):
the normalized request and, per excerpt, only the fields the ranking, pre-filter
and screening gates read. Each test runs the same rank -> gate -> screen sequence
as semantic_research_answer._execute.

v1 required a theme keyword (e.g. piracy) in every excerpt that names the target,
which left 0 excerpts for ID-02, PN-04, FC-06 and NG-04, 1 for SY-01 and 3 for
PN-01. v2 keeps the place/name criterion unchanged and limits topic/period:
identity questions are exempt, on-target in-window excerpts are rescued, and a
topic-only failure can never empty the corpus (floor 3).
"""
import gzip
import json
import unittest
from pathlib import Path

from excerpt_prefilter import gate
from excerpt_ranking import rank
from excerpt_screening import NO, YES, question_criteria, screen

FIXTURES = Path(__file__).resolve().parent / 'fixtures' / 'screening_replay'
V1_BEHAVIOUR = {'PCT_SCREENING_IDENTITY_EXEMPTION': '0', 'PCT_SCREENING_WINDOW_RESCUE': '0',
                'PCT_SCREENING_TOPIC_FLOOR': '0'}
# item: (after pre-filter, after v1 screening, after v2 screening)
COUNTS = {
    'ID-01-lantzas-aliases': (1, 1, 1), 'ID-02-lanza-namesakes': (3, 0, 3),
    'ID-03-kapsis-aliases': (60, 60, 60), 'ID-04-creveliers-aliases': (21, 21, 21),
    'FC-01-capsi-hanged-1680': (79, 76, 76), 'FC-02-creveliers-petra-1676': (22, 22, 22),
    'FC-03-lantzas-1596-arrest': (1, 1, 1), 'FC-04-pirate-season-milos': (209, 44, 45),
    'FC-06-siphanto-provencal-corsair': (19, 0, 3),
    'CT-01-creveliers-death-date': (21, 21, 21), 'CT-02-kapsis-origin': (58, 58, 58),
    'CT-03-kapsis-dates': (60, 60, 60), 'CT-04-manetas-legend-place': (29, 29, 29),
    'NG-01-lantzas-milos-premise': (3, 3, 3), 'NG-02-kapsis-morosini-battle': (96, 89, 89),
    'NG-03-fictional-zerphalon': (0, 0, 0), 'NG-04-manetas-phournoi-base': (1, 0, 1),
    'SY-01-milos-1660-1680': (234, 1, 3), 'SY-02-kapsis-kingdom': (2, 2, 2),
    'PN-01-argentiere': (240, 3, 108), 'PN-02-antimilo': (19, 19, 19),
    'PN-03-cerigo': (96, 96, 96), 'PN-04-gadronise-agathonisi': (8, 0, 8)}
NEGATIVE_TRAPS = ('NG-01-lantzas-milos-premise', 'NG-02-kapsis-morosini-battle',
                  'NG-03-fictional-zerphalon', 'NG-04-manetas-phournoi-base')
_CACHE = {}
_RUNS = {}


def load(item):
    if item not in _CACHE:
        _CACHE[item] = json.loads(gzip.decompress((FIXTURES / (item + '.json.gz')).read_bytes()))
    return _CACHE[item]


def run(item, env=None):
    """rank -> pre-filter -> screen, with the same arguments as _execute (memoised)."""
    key = (item, tuple(sorted((env or {}).items())))
    if key not in _RUNS:
        _RUNS[key] = _run(item, env)
    return _RUNS[key]


def _run(item, env):
    fx = load(item)
    q, kind = fx['normalized_request'], fx['question_kind']
    names = [*(q.get('aliases') or []), *(q.get('search_name_variants') or [])]
    dates, purpose = q.get('date_range') or '', q.get('purpose') or ''
    ranked, ranking = rank(fx['records'], q['target'], names, dates, purpose)
    kept, _, _ = gate(ranked, kind, q['target'], q.get('aliases') or [], dates, purpose,
                      near_duplicate_of=ranking.get('near_duplicate_of'), env={})
    passed, failed, report = screen(kept, kind, q['target'], names, dates, purpose, env=env or {})
    return kept, passed, failed, report


def ids(rows):
    return [r['evidence_id'] for r in rows]


class ReplayCounts(unittest.TestCase):
    def test_all_fixtures_present(self):
        self.assertEqual(sorted(p.name[:-8] for p in FIXTURES.glob('*.json.gz')), sorted(COUNTS))

    def test_pinned_before_and_after_counts(self):
        for item, (prefiltered, before, after) in COUNTS.items():
            with self.subTest(item=item):
                kept, passed, _, _ = run(item)
                self.assertEqual(len(kept), prefiltered)
                self.assertEqual(len(run(item, V1_BEHAVIOUR)[1]), before)
                self.assertEqual(len(passed), after)

    def test_v2_only_adds_never_removes(self):
        for item in COUNTS:
            with self.subTest(item=item):
                self.assertLessEqual(set(ids(run(item, V1_BEHAVIOUR)[1])), set(ids(run(item)[1])))

    def test_previously_emptied_items_keep_excerpts(self):
        for item in ('ID-02-lanza-namesakes', 'PN-04-gadronise-agathonisi', 'FC-06-siphanto-provencal-corsair',
                     'NG-04-manetas-phournoi-base', 'SY-01-milos-1660-1680', 'PN-01-argentiere'):
            with self.subTest(item=item):
                self.assertGreater(len(run(item)[1]), len(run(item, V1_BEHAVIOUR)[1]))

    def test_identity_questions_read_every_prefiltered_name_mention(self):
        # "which island is Gadronise today", "tell the Lanza namesakes apart":
        # every excerpt naming the target survives; PN-01 still drops the
        # ambiguous 'Argentière' excerpts with no Aegean context (NO_PLACE).
        for item in ('ID-02-lanza-namesakes', 'PN-04-gadronise-agathonisi'):
            kept, passed, failed, report = run(item)
            self.assertTrue(report['criteria']['identity_question'])
            self.assertEqual(ids(passed), ids(kept))
        _, passed, failed, report = run('PN-01-argentiere')
        self.assertTrue(report['criteria']['identity_question'])
        self.assertEqual({f['detail'] for f in failed}, {'NO_PLACE'})
        self.assertTrue(any('argentiera' in r['text'].lower() and 'silver' in r['text'].lower() for r in passed))

    def test_topic_still_filters_off_topic_text_on_large_corpora(self):
        # SY-01: 220 of the 231 topic failures are a 1820 Venus-de-Milo story and a
        # geology monograph; they stay filtered (listed, re-includable).
        _, passed, failed, report = run('SY-01-milos-1660-1680')
        self.assertFalse(report['criteria']['identity_question'])
        self.assertGreater(sum('NO_TOPIC' in f['detail'] for f in failed), 200)
        self.assertEqual(report['topic_rescued']['TOPIC_FLOOR_NO_EXCERPT_PASSED'], [])
        self.assertEqual(len(report['topic_rescued']['TARGET_AND_YEAR_IN_WINDOW']), 2)

    def test_floor_keeps_best_ranked_target_mentions_only_when_none_pass(self):
        kept, passed, _, report = run('FC-06-siphanto-provencal-corsair')
        self.assertEqual(ids(passed), ids(kept)[:3])
        self.assertEqual(report['topic_rescued']['TOPIC_FLOOR_NO_EXCERPT_PASSED'], ids(passed))
        self.assertTrue(all(r['screening']['topic']['answer'] == NO for r in passed))  # honest record


class NoInventedEvidence(unittest.TestCase):
    def test_every_read_excerpt_still_names_the_target(self):
        for item in COUNTS:
            with self.subTest(item=item):
                for row in run(item)[1]:
                    answers = row.get('screening') or {}
                    target = answers.get('place') or answers.get('name')
                    self.assertEqual(target['answer'], YES, row['evidence_id'])

    def test_rescues_never_override_place_name_or_period_failures(self):
        for item in COUNTS:
            with self.subTest(item=item):
                for row in run(item)[1]:
                    answers = row['screening']
                    self.assertNotEqual((answers.get('period') or {}).get('answer'), NO)


class NegativeTraps(unittest.TestCase):
    def test_traps_without_theme_are_unchanged(self):
        for item in NEGATIVE_TRAPS[:3]:
            with self.subTest(item=item):
                before, after = run(item, V1_BEHAVIOUR), run(item)
                self.assertEqual(ids(after[1]), ids(before[1]))
                self.assertEqual([(f['evidence_id'], f['detail']) for f in after[2]],
                                 [(f['evidence_id'], f['detail']) for f in before[2]])

    def test_fictional_target_still_has_nothing_to_cite(self):
        self.assertEqual(run('NG-03-fictional-zerphalon')[1], [])

    def test_morosini_trap_keeps_period_filter(self):
        _, _, failed, _ = run('NG-02-kapsis-morosini-battle')
        self.assertEqual(sum(f['detail'] == 'NO_PERIOD' for f in failed), 7)

    def test_traps_read_nothing_the_passing_2026_10_29_run_did_not_read(self):
        # NG-04 passed on 2026-10-29 after reading exactly this one excerpt (a
        # Portuguese 'manetas' namesake); v1 left 0. NG-01/NG-02 are subsets of
        # their own pre-filtered corpora as before.
        fx = load('NG-04-manetas-phournoi-base')
        self.assertEqual(fx['recorded_2026_10_29']['result'], 'PASS')
        self.assertEqual(ids(run('NG-04-manetas-phournoi-base')[1]), fx['recorded_2026_10_29']['read_evidence_ids'])


class EngineReplay(unittest.TestCase):
    def test_engine_reads_agathonisi_again_with_default_gates(self):
        # Full engine on the recorded Agathonisi corpus (fixtures/adaptive_reading):
        # v1 screening sent 0 excerpts to the readers; v2 sends the 8 that name it.
        from test_adaptive_reading import replay
        _, out, made, _ = replay('40842355344.json', {})
        self.assertEqual(out['coverage']['unique_passages'], 8)
        self.assertGreater(out['coverage']['selected_passages'], 0)
        self.assertNotEqual(out['status'], 'INSUFFICIENT_ACQUIRED_EVIDENCE')
        self.assertTrue(any(c['role'] == 'evidence_extractor' for c in made))
        _, old, _, _ = replay('40842355344.json', V1_BEHAVIOUR)
        self.assertEqual(old['coverage']['unique_passages'], 0)


class Criteria(unittest.TestCase):
    def test_identity_intent_detection(self):
        def ident(purpose):
            return question_criteria('place', 'X', [], '', purpose)['identity_question']
        self.assertTrue(ident('Ποιο νησί λέγεται «Argentiere» στους παλιούς ταξιδιώτες;'))
        self.assertTrue(ident('Το «Gadronise»: ποιο νησί είναι σήμερα;'))
        self.assertTrue(ident('βρες τον κουρσάρο και ξεχώρισε τους συνώνυμους'))
        self.assertTrue(ident("'Gadronise' in pirate sources: which island is it today?"))
        self.assertFalse(ident('Ερεύνησε τη δραστηριότητα πειρατών στη Μήλο μεταξύ 1660 και 1680'))
        self.assertFalse(ident('Αποδεικνύεται ότι ο Μανέτας είχε ορμητήριο στους Φούρνους το 1694–1695;'))
        self.assertFalse(ident('Τι έκανε ο Προβηγκιανός κουρσάρος της Μήλου για λογαριασμό των Σιφνίων, και πότε;'))

    def test_switches_restore_v1(self):
        for item in ('PN-01-argentiere', 'SY-01-milos-1660-1680', 'FC-06-siphanto-provencal-corsair'):
            self.assertEqual(len(run(item, V1_BEHAVIOUR)[1]), COUNTS[item][1])


if __name__ == '__main__':
    unittest.main()
