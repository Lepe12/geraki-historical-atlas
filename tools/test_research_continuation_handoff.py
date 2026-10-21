import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from research_continuation_handoff import decision, select, state
from research_continuation import digest


class HandoffTests(unittest.TestCase):
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

    def test_path_escape_is_rejected(self):
        self.write(self.root / 'research_continuation/active.json', {'queue': '../../outside.json'})
        with self.assertRaisesRegex(ValueError, 'UNSAFE_QUEUE_PATH'):
            state(self.root)


if __name__ == '__main__':
    unittest.main()
