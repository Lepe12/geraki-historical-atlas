import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import auto_chain
from auto_chain import active_rounds, decide, log, marker_enabled, round_cap, rounds_done, write_marker
from continuation_rounds import SCHEMA as ROUNDS_SCHEMA, record

ROOT = Path(__file__).resolve().parents[1]


def corpus(tmp, marker=True, queue_status='PENDING', total=10, examined=3, rounds=None, stop=None):
    root = Path(tmp) / 'evidence/runs/123'
    cont = root / 'research_continuation'
    cont.mkdir(parents=True)
    (cont / 'active.json').write_text(json.dumps({'queue': 'gen/queue.json'}))
    (cont / 'gen').mkdir()
    (cont / 'gen/queue.json').write_text(json.dumps({'total': total, 'completed': examined, 'status': queue_status}))
    rows = rounds if rounds is not None else [{'round': 0, 'remaining': total - examined, 'queue_status': queue_status, 'examined': examined,
                                                'new_supported_claims': 1}]
    (cont / 'rounds.json').write_text(json.dumps({'schema': ROUNDS_SCHEMA, 'rounds': rows, 'stop_reason': stop}))
    if marker:
        write_marker(root, '123', now='2026-10-29T12:00:00Z')
    return root


class DecisionTests(unittest.TestCase):
    def test_marked_pending_corpus_continues(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = corpus(tmp)
            self.assertEqual(decide(root, True, True, set()), (True, 'NEXT_ROUND:1/10'))
            self.assertTrue(decide(root, True, False, set(), first_pass=True)[0])

    def test_older_corpus_without_marker_never_self_chains(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = corpus(tmp, marker=False)
            self.assertEqual(decide(root, True, True, set()), (False, 'NO_AUTO_CHAIN_MARKER'))

    def test_unreadable_or_disabled_marker_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = corpus(tmp)
            (root / auto_chain.MARKER).write_text('{broken')
            self.assertFalse(marker_enabled(root))
            (root / auto_chain.MARKER).write_text(json.dumps({'schema': auto_chain.SCHEMA, 'auto_chain': False}))
            self.assertFalse(decide(root, True, True, set())[0])

    def test_auto_continue_false_and_hold_stop(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = corpus(tmp)
            self.assertEqual(decide(root, False, True, set()), (False, 'AUTO_CONTINUE_FALSE'))
            (root / 'research_continuation/auto_continue.json').write_text('{"auto_continue": false}')
            self.assertEqual(decide(root, True, True, set()), (False, 'AUTO_CONTINUE_HELD'))

    def test_no_progress_handoff_stops(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = corpus(tmp)
            self.assertEqual(decide(root, True, False, set())[1], 'HANDOFF_NO_PROGRESS_OR_NOT_RESUMABLE')

    def test_first_pass_needs_pending_coverage(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = corpus(tmp, queue_status='COMPLETE', examined=10)
            self.assertEqual(decide(root, True, True, set(), first_pass=True),
                             (False, 'FIRST_PASS_COVERAGE_NOT_PENDING'))

    def test_clean_stop_in_rounds_json_stops(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = corpus(tmp, stop='NO_NEW_SUPPORTED_CLAIMS')
            self.assertEqual(decide(root, True, True, set()), (False, 'CONTINUATION_STOPPED:NO_NEW_SUPPORTED_CLAIMS'))

    def test_round_cap_uses_existing_max_else_ten_never_above_ten(self):
        self.assertEqual(round_cap({}), 10)
        self.assertEqual(round_cap({'PCT_CONTINUATION_MAX_ROUNDS': '5'}), 5)
        self.assertEqual(round_cap({'PCT_CONTINUATION_MAX_ROUNDS': '50'}), 10)
        with tempfile.TemporaryDirectory() as tmp:
            rows = [{'round': n, 'remaining': 5, 'queue_status': 'PENDING', 'new_supported_claims': 1} for n in range(4)]
            root = corpus(tmp, rounds=rows)
            for n in range(1, 3):
                (root / ('semantic_reanalysis_%d' % n)).mkdir()
            self.assertEqual(rounds_done(root), 3)
            self.assertEqual(decide(root, True, True, set(), env={'PCT_CONTINUATION_MAX_ROUNDS': '3'}),
                             (False, 'ROUND_CAP_REACHED:3/3'))

    def test_active_round_for_same_run_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = corpus(tmp)
            self.assertEqual(decide(root, True, True, {'999'}), (False, 'ROUND_ALREADY_QUEUED_OR_RUNNING:999'))

    def test_decision_log_survives_next_round_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = corpus(tmp)
            log(root, {'decision': 'continue', 'reason': 'NEXT_ROUND:1/10'})
            record(root, {'status': 'RESEARCH_COVERAGE_PENDING'}, 1, 'semantic_reanalysis_1', env={})
            ledger = json.loads((root / 'research_continuation/rounds.json').read_text())
            self.assertEqual(ledger['auto_chain_decisions'][0]['reason'], 'NEXT_ROUND:1/10')
            self.assertEqual([r['round'] for r in ledger['rounds']], [0, 1])


class ActiveRoundTests(unittest.TestCase):
    def pages(self, runs, jobs=None):
        def fake(path):
            if '/jobs' in path:
                run = path.split('/runs/')[1].split('/')[0]
                return [{'jobs': (jobs or {}).get(run, [])}]
            return [{'workflow_runs': runs if 'status=queued' in path else []}]
        return fake

    def test_matches_title_or_old_job_names_and_skips_self_and_others(self):
        runs = [{'id': 1, 'display_title': 'Semantic reanalysis 123'},
                {'id': 2, 'display_title': 'Real acquired-source semantic reanalysis'},
                {'id': 3, 'display_title': 'Semantic reanalysis 1234'},
                {'id': 4, 'display_title': 'Semantic reanalysis 123'}]
        jobs = {'2': [{'name': 'Reanalyse actual sources 123'}]}
        self.assertEqual(active_rounds('o/r', '123', '4', self.pages(runs, jobs)), {'1', '2'})

    @patch('auto_chain.active_rounds', side_effect=OSError('api'))
    def test_api_failure_fails_closed(self, _):
        with tempfile.TemporaryDirectory() as tmp:
            corpus(tmp)
            out = Path(tmp) / 'out'
            with patch.dict('os.environ', {'GITHUB_REPOSITORY': 'o/r', 'GITHUB_RUN_ID': '5', 'GITHUB_OUTPUT': str(out)}), \
                    patch('auto_chain.Path', side_effect=lambda *a: Path(tmp, *a) if a == ('evidence/runs',) else Path(*a)):
                auto_chain.main(['chain', '--run-id', '123', '--restart', 'true'])
            self.assertIn('dispatch=false', out.read_text())
            ledger = json.loads((Path(tmp) / 'evidence/runs/123/research_continuation/rounds.json').read_text())
            self.assertEqual(ledger['auto_chain_decisions'][-1]['reason'], 'ACTIVE_ROUND_CHECK_FAILED')


class PrefilteredQueueTests(unittest.TestCase):
    def test_baseline_accepts_listed_filtered_excerpts(self):
        # Kimolos 40857073690: total 259 kept, 148 FILTERED listed, 407 items.
        from research_continuation_handoff import state
        with tempfile.TemporaryDirectory() as tmp:
            cont = Path(tmp) / 'research_continuation'
            (cont / 'g').mkdir(parents=True)
            (cont / 'active.json').write_text(json.dumps({'queue': 'g/queue.json'}))
            items = ([{'evidence_id': 'e%d' % n, 'status': 'EXAMINED'} for n in range(2)] +
                     [{'evidence_id': 'p%d' % n, 'status': 'PENDING'} for n in range(3)] +
                     [{'evidence_id': 'f%d' % n, 'status': 'FILTERED'} for n in range(4)])
            queue = {'total': 5, 'completed': 2, 'status': 'PENDING', 'filtered': 4, 'items': items}
            (cont / 'g/queue.json').write_text(json.dumps(queue))
            self.assertEqual(state(tmp)['completed'], ['e0', 'e1'])
            queue['filtered'] = 3
            (cont / 'g/queue.json').write_text(json.dumps(queue))
            with self.assertRaisesRegex(ValueError, 'INCONSISTENT_QUEUE_COUNTS'):
                state(tmp)


class WorkflowWiringTests(unittest.TestCase):
    def test_reanalysis_rounds_are_serialised_and_guarded(self):
        text = (ROOT / '.github/workflows/research-semantic-reanalysis.yml').read_text()
        self.assertIn('group: research-reanalysis-round-${{ inputs.run_id', text)
        self.assertIn('run-name: Semantic reanalysis ${{ inputs.run_id }}', text)
        self.assertEqual(text.count('tools/auto_chain.py chain'), 2)
        self.assertNotIn('gh workflow run', text)  # every dispatch goes through the guard

    def test_first_pass_marks_and_chains_but_not_eval_or_push(self):
        text = (ROOT / '.github/workflows/pct-parallel-multi-agent.yml').read_text()
        self.assertIn('tools/auto_chain.py mark', text)
        self.assertIn('"$PCT_EVAL_FAST_MODE" != "true"', text)
        self.assertIn('"$GITHUB_EVENT_NAME" = "workflow_dispatch"', text)
        self.assertIn('tools/auto_chain.py chain --first-pass', text)

    def test_hourly_coordinator_untouched_by_auto_chain(self):
        text = (ROOT / '.github/workflows/research-continuation.yml').read_text()
        self.assertNotIn('auto_chain', text)


if __name__ == '__main__':
    unittest.main()
