import base64
import hashlib
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('stager', Path(__file__).with_name('stage_openclaw.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class FakeFTP:
    def __init__(self):
        self.cwd_paths = []
        self.files = {}
        self.renames = []
    def cwd(self, path): self.cwd_paths.append(path)
    def size(self, path):
        if path not in self.files: raise m.ftplib.error_perm('550 Missing')
        return len(self.files[path])
    def storbinary(self, command, stream, blocksize=8192):
        self.files[command[5:]] = stream.read()
    def retrbinary(self, command, callback, blocksize=8192):
        callback(self.files[command[5:]])
    def rename(self, before, after):
        self.renames.append((before, after))
        self.files[after] = self.files.pop(before)

class TestStage(unittest.TestCase):
    def test_exact_pinned_npm_archive(self):
        data = b'test data only'
        with patch.object(m, 'EXPECTED_SHA512_B64', base64.b64encode(hashlib.sha512(data).digest()).decode()):
            info = m.checked_archive(data)
            self.assertEqual(info['version'], '2026.11.2')
            self.assertFalse(info['runtime_started'])

    def test_reject_bad_hash(self):
        with self.assertRaisesRegex(ValueError, 'INTEGRITY_FAILED'): m.checked_archive(b'impostor')

    def test_reject_large_archive(self):
        with patch.object(m, 'MAX_ARCHIVE', 4):
            with self.assertRaisesRegex(ValueError, 'SIZE_INVALID'): m.checked_archive(b'12345')

    def test_only_stage_area_and_readback(self):
        f = FakeFTP()
        meta = {'sha256': hashlib.sha256(b'abcd').hexdigest(), 'bytes': 4}
        m.stage(f, b'abcd', meta)
        self.assertEqual(f.cwd_paths, [m.FTP_ROOT, m.STAGING_DIR])
        self.assertEqual(f.files['openclaw-2026.11.2.tgz'], b'abcd')
        self.assertEqual(f.renames, [('openclaw-2026.11.2.tgz.uploading', 'openclaw-2026.11.2.tgz')])

    def test_reject_conflicting_existing_stage(self):
        f = FakeFTP()
        f.files['openclaw-2026.11.2.tgz'] = b'old'
        with self.assertRaisesRegex(ValueError, 'DIFFERENT_HASH'):
            m.stage(f, b'abcd', {'sha256': hashlib.sha256(b'abcd').hexdigest(), 'bytes': 4})
        self.assertEqual(f.renames, [])

if __name__ == '__main__': unittest.main()
