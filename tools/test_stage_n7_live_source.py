import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('stage', Path(__file__).with_name('stage_n7_live_source.py'))
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)


class SourceStagingTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        subprocess.run(['git', 'init', '-q', str(self.repo)], check=True)
        self.capture = self.root / 'capture'
        self.capture.mkdir()
        self.files = {'server.js': b'// installed code', 'package.json': b'{"name":"independent-ai-bot"}',
                      'public/app.js': b'// installed UI', 'public/n7-pdf/pdf.js': b'large vendor',
                      'data/private.js': b'private data'}
        for name, data in self.files.items():
            target = self.capture / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        self.manifest = {'schema': 'n7-live-source/v1', 'read_only': True,
                         'files': {n: hashlib.sha256(v).hexdigest() for n, v in self.files.items()}}
        self.save_manifest()

    def save_manifest(self):
        (self.capture / 'capture-manifest.json').write_text(json.dumps(self.manifest))

    def test_staged_tree_contains_only_exact_source_without_main_write(self):
        commit, count = stage.stage(self.repo, self.capture, 'capture/n7-live-123-1', True)
        self.assertEqual(count, 3)
        names = subprocess.check_output(['git', '-C', str(self.repo), 'ls-tree', '-r', '--name-only', commit], text=True).splitlines()
        self.assertEqual(set(names), {'server.js', 'package.json', 'public/app.js', 'capture-manifest.json'})
        self.assertEqual(subprocess.check_output(['git', '-C', str(self.repo), 'show', commit + ':server.js']), self.files['server.js'])
        self.assertNotEqual(subprocess.run(['git', '-C', str(self.repo), 'show-ref', '--verify', '--quiet', 'refs/heads/main']).returncode, 0)

    def test_public_repository_and_unexpected_branch_are_refused(self):
        with self.assertRaisesRegex(ValueError, 'private'):
            stage.stage(self.repo, self.capture, 'capture/n7-live-123-1', False)
        with self.assertRaisesRegex(ValueError, 'branch'):
            stage.stage(self.repo, self.capture, 'main', True)

    def test_modified_source_or_path_traversal_is_refused(self):
        (self.capture / 'server.js').write_bytes(b'changed after capture')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            stage.source_payload(self.capture)
        self.manifest['files'] = {'../.env': '0' * 64}
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'Unsafe'):
            stage.source_payload(self.capture)


if __name__ == '__main__':
    unittest.main()
