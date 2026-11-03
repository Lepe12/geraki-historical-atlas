import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from nabou_coding_agent import AgentError, build_candidate, main, parse_proposal, validate_target


class CodingAgentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.frontend = self.root / 'jarvis-intelligence-chamber'
        self.frontend.mkdir()
        self.safe = self.frontend / 'nabou-shell.js'
        self.safe.write_text('const status = "old";\n', encoding='utf-8')

    def test_safe_path(self):
        self.assertEqual(validate_target(self.root, 'jarvis-intelligence-chamber/nabou-shell.js'), self.safe)

    def test_blocked_files_and_traversal(self):
        for value in ('jarvis-intelligence-chamber/../tools/pwn.py',
                      'jarvis-intelligence-chamber/map-3d.js',
                      'jarvis-intelligence-chamber/index.html',
                      '.github/workflows/nabou-coding-agent.yml',
                      'jarvis-intelligence-chamber/nabou-shell.js/../nabou-shell.js',
                      'jarvis-intelligence-chamber/../../etc/passwd'):
            with self.subTest(value=value), self.assertRaises(AgentError):
                validate_target(self.root, value)

    def test_unique_edit(self):
        self.assertEqual(build_candidate('ab xyz', {'edits': [{'old': 'xyz', 'new': 'def'}]}), 'ab def')
        with self.assertRaises(AgentError):
            build_candidate('aaa aaa', {'edits': [{'old': 'aaa', 'new': 'bbb'}]})

    def test_reject_malformed_model_result(self):
        for raw in ('nonsense', '{"edits":[]}', '{"edits":[{"old":"x"}]}',
                    '{"edits":[{"old":"x","new":"x"}]}'):
            with self.subTest(raw=raw), self.assertRaises(AgentError):
                parse_proposal(raw)

    def test_preview_never_edits(self):
        proposal = self.root / 'proposal.json'
        proposal.write_text(json.dumps({'summary': 'δοκιμή', 'edits': [{'old': 'old', 'new': 'new'}]}))
        report = self.root / 'result.json'
        code = main(['--repo', str(self.root), '--file', 'jarvis-intelligence-chamber/nabou-shell.js',
                     '--task', 'Change the test status', '--proposal-file', str(proposal), '--report', str(report)])
        self.assertEqual(code, 0)
        self.assertIn('old', self.safe.read_text())
        self.assertEqual(json.loads(report.read_text())['status'], 'preview_only')

    @unittest.skipUnless(subprocess.run(['which', 'node'], capture_output=True).returncode == 0, 'node missing')
    def test_apply_and_syntax_rollback(self):
        proposal = self.root / 'proposal.json'
        report = self.root / 'result.json'
        proposal.write_text(json.dumps({'edits': [{'old': '"old"', 'new': '"new"'}]}))
        common = ['--repo', str(self.root), '--file', 'jarvis-intelligence-chamber/nabou-shell.js',
                  '--task', 'Change the test status', '--proposal-file', str(proposal),
                  '--report', str(report), '--apply']
        self.assertEqual(main(common), 0)
        self.assertIn('"new"', self.safe.read_text())
        self.assertEqual(json.loads(report.read_text())['status'], 'applied')
        proposal.write_text(json.dumps({'edits': [{'old': '"new"', 'new': '"'}]}))
        self.assertEqual(main(common), 1)
        self.assertIn('"new"', self.safe.read_text())
        self.assertEqual(json.loads(report.read_text())['status'], 'blocked')


if __name__ == '__main__':
    unittest.main()
