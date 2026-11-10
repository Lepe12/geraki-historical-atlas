import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('backup', Path(__file__).with_name('private_backup.py'))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupTest(unittest.TestCase):
    def test_full_private_data_roundtrip_and_tamper(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            source = root / 'private'
            source.mkdir()
            for name in ['conversations.json', 'n7-workspaces/projects/book.json', 'n7-source-library/doc/original', 'n7-workspaces/jobs/job.json']:
                p = source / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(('private ' + name).encode())
            with self.assertRaises(ValueError):
                backup.create(source, root / 'snapshot')
            backup.create(source, root / 'snapshot', offline=True)
            backup.restore(root / 'snapshot', root / 'restored', offline=True)
            self.assertEqual({n: p.read_bytes() for n, p in backup.files(source).items()}, {n: p.read_bytes() for n, p in backup.files(root / 'restored').items()})
            with self.assertRaises(ValueError):
                backup.restore(root / 'snapshot', source, offline=True)
            (root / 'snapshot/data/conversations.json').write_text('tampered')
            with self.assertRaisesRegex(ValueError, 'digest'):
                backup.verify(root / 'snapshot')

    def test_symlink_and_recursive_backup_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            source = Path(d) / 'source'
            source.mkdir()
            with self.assertRaises(ValueError):
                backup.create(source, source / 'backup', offline=True)
            (source / 'link').symlink_to('/etc/passwd')
            with self.assertRaisesRegex(ValueError, 'Symlinks'):
                backup.create(source, Path(d) / 'backup', offline=True)


if __name__ == '__main__':
    unittest.main()
