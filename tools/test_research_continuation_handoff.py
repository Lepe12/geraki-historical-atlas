import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from research_continuation_handoff import active_parents, cancel_superseded_pending, decision, select, state, handoff_outputs, dispatch_selected
from research_continuation import digest


class HandoffTests(unittest.TestCase):
    @patch('research_continuation_handoff.subprocess.check_call')
    def test_dispatch_submits_workers_without_waiting_for_completion(self, call):
        dispatch_selected('owner/repo',{'123':{},'456':{}})
        self.assertEqual(call.call_count,2)
        self.assertEqual(call.call_args_list[0].args[0][-1],'run_id=123')
        self.assertEqual(call.call_args_list[1].args[0][-1],'run_id=456')
        self.assertTrue(all('research-semantic-reanalysis.yml' in c.args[0] for c in call.call_args_list))

    @patch('research_continuation_handoff.subprocess.check_call')
    def test_failed_dispatch_does_not_prevent_other_worker_submission(self, call):
        import subprocess
        call.side_effect=[subprocess.CalledProcessError(1,'gh'),None]
        with self.assertRaisesRegex(SystemExit,'CONTINUATION_DISPATCH_FAILED:123'):
            dispatch_selected('owner/repo',{'123':{},'456':{}})
        self.assertEqual(call.call_count,2)

    @patch('research_continuation_handoff.subprocess.check_call')
    def test_all_parent_ids_validated_before_dispatch(self, call):
        with self.assertRaisesRegex(ValueError,'NUMERIC_PARENT_RUN_REQUIRED'):
            dispatch_selected('owner/repo',{'123':{},'bad':{}})
        call.assert_not_called()

    def test_failed_corpus_does_not_freeze_healthy_progress(self):
        result=handoff_outputs({'123':(True,'NEW_EXAMINED_ITEMS:3'),
            '456':(False,'CONTINUATION_RECEIPTS_INVALID')})
        self.assertEqual(result,{'restart':True,'held_runs':['456']})

    def test_failed_corpus_cannot_self_restart_and_holds_are_carried_forward(self):
        self.assertEqual(handoff_outputs({'456':(False,'NO_CHECKPOINT_PROGRESS')}),
                         {'restart':False,'held_runs':['456']})
        self.assertEqual(handoff_outputs({'123':(True,'NEW_EXAMINED_ITEMS:2')},['456']),
                         {'restart':True,'held_runs':['456']})

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'evidence/runs/123'
        self.queue = self.root / 'research_continuation/generation/queue.json'
        self.write(self.root / 'research_continuation/active.json', {'queue': 'generation/queue.json'})
        self.inventory(['a'])
        self.before = state(self.root)
        self.inventory(['a', 'b'])
        self.publish()

    def write(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))

    def inventory(self, examined):
        self.write(self.queue, {'status': 'PENDING', 'total': 3, 'completed': len(examined),
                   'items': [{'evidence_id': key, 'status': 'EXAMINED' if key in examined else 'PENDING'} for key in 'abc']})

    def publish(self, status='RESEARCH_COVERAGE_PENDING', calls=None):
        out = self.root / 'semantic_reanalysis_456/research_answer'
        self.write(out / 'answer.json', {'status': status, 'calls': calls or []})
        self.write(out / 'validation_report.json', {'status': 'INCOMPLETE'})
        self.write(self.root / 'research_continuation/latest.json', {
            'analysis_path': 'semantic_reanalysis_456',
            'answer_sha256': hashlib.sha256((out / 'answer.json').read_bytes()).hexdigest(),
            'validation_sha256': hashlib.sha256((out / 'validation_report.json').read_bytes()).hexdigest()})

    def test_expected_incomplete_advances_and_stays_pending(self):
        self.assertEqual(decision(self.root, self.before, '456'), (True, 'NEW_EXAMINED_ITEMS:1'))
        self.assertEqual(select(self.base)['123']['completed'], ['a', 'b'])

    def test_same_sample_does_not_restart(self):
        self.assertEqual(decision(self.root, state(self.root), '456'), (False, 'NO_CHECKPOINT_PROGRESS'))

    def test_crash_stale_publication_does_not_restart(self):
        self.assertEqual(decision(self.root, self.before, '457'), (False, 'CURRENT_EXECUTION_NOT_PUBLISHED'))

    def test_corrupt_published_bytes_do_not_restart(self):
        (self.root / 'semantic_reanalysis_456/research_answer/answer.json').write_text('{}')
        self.assertEqual(decision(self.root, self.before, '456'), (False, 'INVALID_PUBLISHED_CHECKSUMS'))

    def test_lost_work_does_not_restart(self):
        self.inventory(['b'])
        self.assertEqual(decision(self.root, self.before, '456'), (False, 'PREVIOUS_COMPLETED_ITEMS_LOST'))

    def test_failed_model_call_does_not_restart(self):
        self.publish(calls=[{'status': 'FAILED'}])
        self.assertEqual(decision(self.root, self.before, '456'), (False, 'MODEL_CALL_NOT_COMPLETED'))

    def test_analysis_failure_does_not_restart(self):
        self.publish(status='EXTRACTION_FAILED_OR_UNSUPPORTED')
        self.assertFalse(decision(self.root, self.before, '456')[0])

    def test_valid_zero_claim_extraction_still_advances(self):
        self.publish(status='EXTRACTION_FAILED_OR_UNSUPPORTED', calls=[{'status': 'COMPLETED'}])
        self.assertEqual(decision(self.root, self.before, '456'), (True, 'NEW_EXAMINED_ITEMS:1'))

    def test_review_only_progress_can_restart(self):
        before = state(self.root)
        q = json.loads(self.queue.read_text()); q['phase'] = 'REVIEW_AND_SYNTHESIS'
        self.write(self.queue, q)
        self.write(self.queue.parent / 'responses/new.json', {'result': {}, 'result_sha256': digest({})})
        self.assertEqual(decision(self.root, before, '456'), (True, 'NEW_REVIEW_OR_SYNTHESIS_RESPONSES'))

    def test_duplicate_items_are_rejected(self):
        q = json.loads(self.queue.read_text()); q['items'][2]['evidence_id'] = 'a'
        self.write(self.queue, q)
        with self.assertRaisesRegex(ValueError, 'INCONSISTENT_QUEUE_COUNTS'):
            state(self.root)

    def test_corrupt_batch_receipt_is_rejected(self):
        self.write(self.queue.parent / 'batches/source.json', {'source_sha256': 'source',
                   'payload': {'items': []}, 'payload_sha256': 'incorrect'})
        with self.assertRaisesRegex(ValueError, 'INVALID_BATCH_RECEIPT'):
            state(self.root)

    def test_corrupt_immutable_replay_receipt_is_rejected(self):
        self.write(self.queue.parent / 'replays/source/incorrect.json',
            {'source_sha256':'source','payload':{'items':[]},'payload_sha256':'incorrect'})
        with self.assertRaisesRegex(ValueError,'INVALID_REPLAY_RECEIPT'):
            state(self.root)

    def test_new_generation_preserves_archived_work_and_continues(self):
        new_queue = self.queue.parent.parent / 'new-generation/queue.json'
        self.write(new_queue, json.loads(self.queue.read_text()))
        self.write(self.root / 'research_continuation/active.json', {'queue': 'new-generation/queue.json'})
        self.assertEqual(decision(self.root, self.before, '456'),
                         (True, 'CHECKPOINT_GENERATION_MIGRATED:archived=2:current=2'))

    def test_new_generation_cannot_hide_lost_old_work(self):
        new_queue = self.queue.parent.parent / 'new-generation/queue.json'
        self.write(new_queue, json.loads(self.queue.read_text()))
        self.inventory(['b'])
        self.write(self.root / 'research_continuation/active.json', {'queue': 'new-generation/queue.json'})
        self.assertEqual(decision(self.root, self.before, '456'), (False, 'PREVIOUS_GENERATION_WORK_LOST'))

    def test_path_escape_is_rejected(self):
        self.write(self.root / 'research_continuation/active.json', {'queue': '../../outside.json'})
        with self.assertRaisesRegex(ValueError, 'UNSAFE_QUEUE_PATH'):
            state(self.root)

    def test_busy_corpus_is_not_scheduled_twice(self):
        self.assertEqual(select(self.base, {'123'}), {})

    @patch('research_continuation_handoff.gh_pages')
    def test_running_jobs_exclude_completed_jobs_and_own_coordinator(self, pages):
        pages.side_effect = [[{'workflow_runs': [
            {'id': 1, 'path': '.github/workflows/research-continuation.yml'},
            {'id': 2, 'path': '.github/workflows/research-continuation.yml'}]}],
            [{'jobs': [{'name': 'continue (123) / Reanalyse actual sources 123', 'status': 'completed'},
                       {'name': 'continue (456) / Reanalyse actual sources 456', 'status': 'in_progress'}]}]]
        self.assertEqual(active_parents('owner/repo', '2'), {'456'})

    @patch('research_continuation_handoff.subprocess.check_call')
    @patch('research_continuation_handoff.gh_pages')
    def test_only_older_unstarted_coordinators_are_cancelled(self, pages, call):
        pages.side_effect = [[{'workflow_runs': [
            {'id': 1, 'path': '.github/workflows/research-continuation.yml', 'status': 'pending', 'head_branch': 'main'},
            {'id': 2, 'path': '.github/workflows/research-continuation.yml', 'status': 'in_progress'},
            {'id': 5, 'path': '.github/workflows/research-continuation.yml', 'status': 'pending'},
            {'id': 1, 'path': '.github/workflows/research-semantic-reanalysis.yml', 'status': 'queued'}]}], []]
        cancel_superseded_pending('owner/repo', '3')
        call.assert_called_once_with(['gh', 'api', '--method', 'POST', 'repos/owner/repo/actions/runs/1/cancel'])


if __name__ == '__main__':
    unittest.main()


