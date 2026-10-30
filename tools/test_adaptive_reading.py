"""Adaptive first-pass reading budget (semantic_research_answer.adaptive_reading_settings).

Offline only: no model, no network, no backend. The two recorded fixtures are the
real excerpt corpora and recorded extractor responses of reliability-run items
that stopped at RESEARCH_COVERAGE_PENDING on 2026-10-29 (40826640986 Pietro Lanza,
40842355344 Agathonisi, 40848183067 Manetas). A fake clock advances by each call's recorded
duration (unrecorded calls: the run's median extractor duration).

Those runs used the engine before the excerpt ranking / pre-filter / screening gates were
merged, so RECORDED_PIPELINE switches those three gates off to replay the recorded run
exactly (every extractor prompt then matches a recorded prompt byte for byte).
"""
import hashlib
import json
import os
import statistics
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import semantic_research_answer as engine

FIXTURES = Path(__file__).resolve().parent / 'fixtures' / 'adaptive_reading'
RECORDED_PIPELINE = {'PCT_EXCERPT_RANKING': '0', 'PCT_PREFILTER': '0', 'PCT_SCREENING': '0'}
SETTINGS = {'enabled': True, 'max_batches': 12, 'read_share': 0.6,
            'first_batch_estimate_seconds': 300.0, 'reserve_calls': 12}


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def replay(fixture, env, extra_seconds=None):
    """Run the real engine on a recorded corpus; returns (answer, calls made)."""
    fx = json.loads((FIXTURES / fixture).read_text(encoding='utf-8'))
    recorded = {c['prompt_sha256']: c for c in fx['recorded']['calls'] if c['role'] == 'evidence_extractor'}
    durations = [c['elapsed_seconds'] for c in fx['recorded']['calls'] if c['elapsed_seconds']]
    unseen = extra_seconds or statistics.median(durations)
    clock = Clock()
    made = []

    def caller(role, prompt):
        hit = recorded.get(hashlib.sha256(prompt.encode()).hexdigest()) if role == 'evidence_extractor' else None
        made.append({'role': role, 'replayed_recording': bool(hit)})
        clock.now += hit['elapsed_seconds'] if hit else unseen
        if hit:
            return {'status': 'COMPLETED', 'content': hit['content']}
        if role == 'evidence_extractor':
            return {'status': 'COMPLETED', 'content': json.dumps({'items': []})}
        return {'status': 'FAILED', 'error': 'NOT_RECORDED_IN_FIXTURE'}

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root / 'lane' / 'run_manifest').mkdir(parents=True)
        (root / 'lane' / 'run_manifest' / 'manifest.json').write_text(
            json.dumps({'normalized_request': fx['normalized_request']}, ensure_ascii=False))
        base = {k: v for k, v in os.environ.items() if not k.startswith('PCT_')}
        base.update({'PCT_LLM_PROVIDER': 'local_llama_cpp', 'PCT_SEMANTIC_BUDGET_SECONDS': '1800'})
        base.update(env)
        with patch.dict('os.environ', base, clear=True), \
                patch.object(engine, 'collect', return_value=(fx['records'], [])), \
                patch.object(engine.time, 'monotonic', clock):
            out = engine.execute(root, fx['question'], caller=caller, config={'configured': True})
            queue = json.loads(next(root.glob('research_continuation/*/queue.json')).read_text())
    return fx, out, made, queue


def deferred_ids(out, reason='MODEL_CALL_BUDGET'):
    return {d['evidence_id'] for d in out['coverage']['deferred'] if d['reason'] == reason}


class ReadingAllowed(unittest.TestCase):
    def test_first_estimate_and_slowest_batch(self):
        self.assertTrue(engine.reading_allowed(700, [], 1800, 4, 48, SETTINGS))       # 700+300 <= 1080
        self.assertFalse(engine.reading_allowed(800, [], 1800, 4, 48, SETTINGS))      # 800+300 > 1080
        self.assertFalse(engine.reading_allowed(700, [100, 390], 1800, 4, 48, SETTINGS))  # slowest batch counts
        self.assertTrue(engine.reading_allowed(700, [100, 300], 1800, 4, 48, SETTINGS))

    def test_review_time_is_protected(self):
        # 300 s batches, 10 claims: 600+300+(14 x 150) > 1800 even though the reading share allows it.
        self.assertTrue(engine.reading_allowed(600, [300], 1800, 4, 48, {**SETTINGS, 'read_share': 0.9}, claims=0))
        self.assertFalse(engine.reading_allowed(600, [300], 1800, 4, 48, {**SETTINGS, 'read_share': 0.9}, claims=10))

    def test_review_call_reserve(self):
        self.assertTrue(engine.reading_allowed(0, [10], 1800, 34, 48, SETTINGS))
        self.assertFalse(engine.reading_allowed(0, [10], 1800, 35, 48, SETTINGS))

    def test_settings_default_on_only_without_explicit_batch_count(self):
        self.assertTrue(engine.adaptive_reading_settings({})['enabled'])
        # Continuation workflows set PCT_SEMANTIC_BATCHES=6 and keep their exact old behaviour.
        self.assertFalse(engine.adaptive_reading_settings({'PCT_SEMANTIC_BATCHES': '6'})['enabled'])
        self.assertTrue(engine.adaptive_reading_settings({'PCT_SEMANTIC_BATCHES': '6', 'PCT_SEMANTIC_ADAPTIVE': '1'})['enabled'])
        self.assertFalse(engine.adaptive_reading_settings({'PCT_SEMANTIC_ADAPTIVE': '0'})['enabled'])
        self.assertEqual(engine.adaptive_reading_settings({'PCT_SEMANTIC_READ_SHARE': '5'})['read_share'], 0.9)


class RecordedRuns(unittest.TestCase):
    def test_old_policy_reproduces_the_recorded_stall(self):
        for name in ('40826640986.json', '40842355344.json'):
            with self.subTest(name):
                fx, out, made, _ = replay(name, {**RECORDED_PIPELINE, 'PCT_SEMANTIC_ADAPTIVE': '0'})
                rec = fx['recorded']
                self.assertEqual(out['status'], 'RESEARCH_COVERAGE_PENDING')
                self.assertEqual(out['coverage']['selected_passages'], rec['selected_passages'])
                self.assertEqual(deferred_ids(out), {d['evidence_id'] for d in rec['deferred']})
                # The fixture really is the recorded run: every extractor prompt matched a recording.
                self.assertTrue(all(c['replayed_recording'] for c in made if c['role'] == 'evidence_extractor'))

    def test_review_time_keeps_the_last_excerpt_for_the_next_round(self):
        # Agathonisi: ~200 s per batch and 3 claims; one more batch would leave
        # too little of the 1800 s pass for review, so it stays recorded as pending.
        fx, out, made, queue = replay('40842355344.json', RECORDED_PIPELINE)
        ar = out['coverage']['adaptive_reading']
        self.assertEqual(ar['stopped']['reason'], 'READING_SHARE_OR_CALL_RESERVE')
        self.assertEqual(deferred_ids(out), {d['evidence_id'] for d in fx['recorded']['deferred']})
        self.assertEqual(queue['status'], 'PENDING')

    def test_adaptive_reads_the_remaining_excerpts_in_the_same_pass(self):
        for name in ('40826640986.json',):
            with self.subTest(name):
                fx, out, made, queue = replay(name, RECORDED_PIPELINE)
                self.assertEqual(deferred_ids(out), set())
                self.assertNotEqual(out['status'], 'RESEARCH_COVERAGE_PENDING')
                self.assertEqual(out['coverage']['selected_passages'], fx['recorded']['unique_passages'])
                self.assertEqual(queue['status'], 'COMPLETE')
                ar = out['coverage']['adaptive_reading']
                self.assertGreaterEqual(ar['extra_batches_read'], 1)
                self.assertIsNone(ar['stopped'])
                # The first batches are byte-identical to the recorded run (same prompts).
                extractor = [c for c in made if c['role'] == 'evidence_extractor']
                self.assertTrue(all(c['replayed_recording'] for c in extractor[:3]))

    def test_slow_model_stops_inside_the_reading_share_and_records_the_rest(self):
        # Reading share 0.2 x 1800 s = 360 s, already spent by the 3 guaranteed batches.
        fx, out, made, queue = replay('40826640986.json', {**RECORDED_PIPELINE, 'PCT_SEMANTIC_READ_SHARE': '0.2'})
        ar = out['coverage']['adaptive_reading']
        self.assertEqual(ar['extra_batches_read'], 0)
        self.assertEqual(ar['stopped']['reason'], 'READING_SHARE_OR_CALL_RESERVE')
        self.assertEqual(out['status'], 'RESEARCH_COVERAGE_PENDING')
        self.assertEqual(deferred_ids(out), {d['evidence_id'] for d in fx['recorded']['deferred']})
        self.assertEqual(queue['status'], 'PENDING')


class CurrentPipeline(unittest.TestCase):
    def test_current_default_pipeline_reads_more_of_the_manetas_corpus(self):
        # Today's default gates (ranking, pre-filter, screening) keep 29 of 34 excerpts.
        _, fixed, _, _ = replay('40848183067.json', {'PCT_SEMANTIC_ADAPTIVE': '0'})
        _, adaptive, _, queue = replay('40848183067.json', {})
        self.assertEqual(fixed['coverage']['unique_passages'], adaptive['coverage']['unique_passages'])
        self.assertEqual(fixed['status'], 'RESEARCH_COVERAGE_PENDING')
        self.assertGreater(len(deferred_ids(fixed)), 0)
        self.assertGreater(adaptive['coverage']['selected_passages'], fixed['coverage']['selected_passages'])
        self.assertLess(len(deferred_ids(adaptive)), len(deferred_ids(fixed)))


class SyntheticBudget(unittest.TestCase):
    def run_engine(self, n, seconds_per_call, env):
        from test_semantic_research_answer import fixture
        clock = Clock()

        def caller(role, prompt):
            clock.now += seconds_per_call
            return {'status': 'COMPLETED', 'content': json.dumps({'items': []})}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); fixture(root)
            row = engine.collect(root)[0][0]
            records = [{**row, 'evidence_id': 'e' + str(i), 'text': row['text'] + ' ' + ('context ' * 500)} for i in range(n)]
            with patch.object(engine, 'collect', return_value=(records, [])), \
                    patch.dict('os.environ', {'PCT_LLM_PROVIDER': 'local_llama_cpp', **env}), \
                    patch.object(engine.time, 'monotonic', clock):
                first = engine.execute(root, 'q', caller=caller, config={'configured': True})
                second = engine.execute(root, 'q', caller=caller, config={'configured': True})
        return first, second

    def test_fast_batches_read_up_to_the_cap(self):
        first, _ = self.run_engine(8, 100, {})
        self.assertEqual(first['coverage']['deferred'], [])
        self.assertEqual(first['coverage']['adaptive_reading']['new_batches_read'], 8)

    def test_unread_batches_are_continued_by_the_next_pass(self):
        first, second = self.run_engine(8, 400, {})
        # 3 guaranteed batches = 1200 s > 1080 s: nothing extra, 5 recorded as pending.
        self.assertEqual(len(deferred_ids(first)), 5)
        self.assertEqual(first['coverage']['selected_passages'], 3)
        self.assertEqual(len(deferred_ids(second)), 2)
        self.assertEqual(len(second['continuation_replays']), 3)

    def test_explicit_batch_count_keeps_the_old_fixed_limit(self):
        first, _ = self.run_engine(8, 1, {'PCT_SEMANTIC_BATCHES': '3'})
        self.assertEqual(len(deferred_ids(first)), 5)
        self.assertNotIn('adaptive_reading', first['coverage'])


if __name__ == '__main__':
    unittest.main()
