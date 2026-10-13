import os
from pathlib import Path
import tempfile
import unittest
from publish_library_results import allowed, copy_bundle, validate_paths


class LibraryWriteScope(unittest.TestCase):
    def test_only_actual_run_data_allowed(self):
        self.assertTrue(allowed('evidence/runs/123/travellers/index.json', '123'))
        self.assertTrue(allowed('evidence/runs/123/MARIADB_STORAGE_INTENT.json', '123'))
        for path in ['.github/workflows/x.yml', 'tools/x.py', 'evidence/runs/124/travellers/x',
                     'evidence/runs/123/venetian/x', 'evidence/runs/123/travellers/../x',
                     '/evidence/runs/123/travellers/x', 'evidence/runs/123/travellers/.git/x',
                     'evidence/runs/123/travellers/a\nb', 'evidence/runs/123/travellers/x\\y']:
            self.assertFalse(allowed(path, '123'), path)
        self.assertFalse(allowed('evidence/runs/123/travellers/x', '../123'))

    def test_control_does_not_enter_research_import(self):
        path = 'evidence/library_agent_controls/123/write_test.json'
        self.assertTrue(allowed(path, '123', True))
        self.assertFalse(allowed(path, '123'))
        self.assertFalse(allowed('evidence/runs/123/travellers/index.json', '123', True))

    def test_staged_code_and_other_runs_rejected(self):
        with self.assertRaises(ValueError):
            validate_paths(b'evidence/runs/123/travellers/index.json\0tools/x.py\0', '123', False)

    def test_bundle_symlink_rejected_before_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            bundle = Path(tmp) / 'bundle'
            leaf = bundle / 'evidence/runs/123/travellers'
            leaf.mkdir(parents=True)
            (leaf / 'bad').symlink_to('/etc/passwd')
            with self.assertRaisesRegex(ValueError, 'SYMLINK'):
                copy_bundle(bundle, '123')


if __name__ == '__main__':
    unittest.main()
