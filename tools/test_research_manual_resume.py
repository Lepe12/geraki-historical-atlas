import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

from research_manual_resume import submit


class ManualResumeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.path = self.base / 'research_continuation_requests/resume.json'
        self.path.parent.mkdir()
        checkpoint = self.base / 'evidence/runs/123/research_continuation/active.json'
        checkpoint.parent.mkdir(parents=True)
        checkpoint.write_text('{}')
        self.request = {'action': 'resume_once', 'run_id': '123',
                        'resume_stopped_research': True, 'semantic_shards': 4,
                        'reason': 'Resume after unread-batch repair'}
        self.dispatch = Mock()

    def run_request(self, active=()):
        self.path.write_text(json.dumps(self.request))
        return submit(self.path, self.base, 'owner/repo', '456',
                      active_check=lambda *args: active, dispatch=self.dispatch)

    def test_dispatches_existing_workflow_once_without_self_chaining(self):
        self.assertEqual(self.run_request()['status'], 'DISPATCH_SUBMITTED_NOT_COMPLETED')
        command = self.dispatch.call_args.args[0]
        self.assertIn('research-semantic-reanalysis.yml', command)
        self.assertIn('run_id=123', command)
        self.assertIn('semantic_shards=4', command)
        self.assertIn('auto_continue=false', command)
        self.assertEqual(self.run_request()['status'], 'ALREADY_RECORDED')
        self.dispatch.assert_called_once()

    def test_acquired_only_request_skips_citation_downloads(self):
        self.request['skip_citation_acquisition'] = True
        result = self.run_request()
        self.assertTrue(result['skip_citation_acquisition'])
        self.assertIn('skip_citation_acquisition=true', self.dispatch.call_args.args[0])

    def test_acquisition_flag_rejects_string_boolean(self):
        self.request['skip_citation_acquisition'] = 'false'
        with self.assertRaisesRegex(ValueError, 'SKIP_ACQUISITION_MUST_BE_BOOLEAN'):
            self.run_request()
        self.dispatch.assert_not_called()

    def test_active_research_is_not_dispatched_twice(self):
        with self.assertRaisesRegex(ValueError, 'RESEARCH_ALREADY_RUNNING'):
            self.run_request(active={'789'})
        self.dispatch.assert_not_called()

    def test_requires_literal_explicit_resume_and_valid_run(self):
        for field, value in [('resume_stopped_research', 'true'), ('run_id', '../123'),
                             ('semantic_shards', True), ('semantic_shards', 5)]:
            with self.subTest(field=field, value=value):
                previous = self.request[field]
                self.request[field] = value
                with self.assertRaises(ValueError):
                    self.run_request()
                self.request[field] = previous
        self.dispatch.assert_not_called()

    def test_failed_submission_keeps_a_receipt_and_does_not_retry(self):
        self.dispatch.side_effect = RuntimeError('transport failed')
        with self.assertRaises(RuntimeError):
            self.run_request()
        receipt = json.loads((self.path.parent / 'receipts/resume.json').read_text())
        self.assertEqual(receipt['status'], 'SUBMISSION_FAILED_OR_UNCERTAIN')
        self.assertEqual(self.run_request()['status'], 'ALREADY_RECORDED')
        self.dispatch.assert_called_once()


if __name__ == '__main__':
    unittest.main()
