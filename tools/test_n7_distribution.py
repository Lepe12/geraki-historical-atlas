import base64
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('checker', Path(__file__).with_name('check_n7_distribution.py'))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class DistributionProofTest(unittest.TestCase):
    def setUp(self):
        self.data = b'// exact canonical file\n'
        blob = checker.git_hash('blob', self.data)
        leaf = b'100644 file.js\0' + bytes.fromhex(blob)
        branch = b'40000 n7\0' + bytes.fromhex(checker.git_hash('tree', leaf))
        root = b'40000 tools\0' + bytes.fromhex(checker.git_hash('tree', branch))
        commit = b'tree ' + checker.git_hash('tree', root).encode() + b'\n\nFixture\n'
        self.manifest = {'commit': checker.git_hash('commit', commit), 'git_proof': {
            'commit': base64.b64encode(commit).decode(),
            'trees': {checker.git_hash('tree', tree): base64.b64encode(tree).decode() for tree in (root, branch, leaf)}}}

    def test_exact_file_is_verified_against_commit(self):
        checker.verify_proof(self.manifest, {'tools/n7/file.js': self.data})

    def test_changed_file_fails_even_if_manifest_hash_were_updated(self):
        with self.assertRaisesRegex(ValueError, 'differs from pinned'):
            checker.verify_proof(self.manifest, {'tools/n7/file.js': b'manual duplicate implementation'})

    def test_forged_commit_or_tree_fails(self):
        self.manifest['git_proof']['commit'] = base64.b64encode(b'forged').decode()
        with self.assertRaisesRegex(ValueError, 'commit proof mismatch'):
            checker.verify_proof(self.manifest, {'tools/n7/file.js': self.data})

    def test_changed_tree_object_fails(self):
        key = next(iter(self.manifest['git_proof']['trees']))
        self.manifest['git_proof']['trees'][key] = base64.b64encode(b'forged').decode()
        with self.assertRaisesRegex(ValueError, 'tree proof mismatch'):
            checker.verify_proof(self.manifest, {'tools/n7/file.js': self.data})


if __name__ == '__main__':
    unittest.main()
