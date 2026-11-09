import ftplib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('capture', Path(__file__).with_name('capture_n7_live_source.py'))
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class ReadOnlyFTP:
    def __init__(self):
        self.files = {'server.js': b'// installed server', 'package.json': b'{"name":"independent-ai-bot"}',
                      'public/app.js': b'// installed UI', '.env': b'NEVER READ',
                      'data/private.js': b'NEVER READ', 'public/uploads/private.md': b'NEVER READ'}
        self.reads = []

    def mlsd(self, directory):
        prefix = directory.removeprefix(capture.ROOT).strip('/')
        prefix = prefix + '/' if prefix else ''
        entries = {}
        for name in self.files:
            if name.startswith(prefix):
                tail = name[len(prefix):]
                part = tail.split('/')[0]
                entries[part] = {'type': 'dir' if '/' in tail else 'file'}
        return list(entries.items())

    def retrbinary(self, command, callback):
        name = command.removeprefix('RETR ' + capture.ROOT + '/')
        self.reads.append(name)
        if name not in self.files:
            raise ftplib.error_perm('550 Not found')
        callback(self.files[name])


class CaptureTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.destination = Path(self.temp.name) / 'capture'
        self.ftp = ReadOnlyFTP()

    def test_reads_source_only_and_exports_exact_bytes(self):
        capture.capture(self.ftp, self.destination)
        self.assertEqual((self.destination / 'server.js').read_bytes(), self.ftp.files['server.js'])
        self.assertFalse(any(name.startswith(('data/', '.env', 'public/uploads/')) for name in self.ftp.reads))
        self.assertEqual(self.ftp.reads.count('server.js'), 2)

    def test_possible_secret_withholds_entire_artifact(self):
        self.ftp.files['server.js'] = b"const key='gsk_" + b'a' * 40 + b"';"
        with self.assertRaisesRegex(ValueError, 'credential'):
            capture.capture(self.ftp, self.destination)
        self.assertFalse(self.destination.exists())

    def test_change_during_capture_is_rejected(self):
        original = self.ftp.retrbinary
        def changing(command, callback):
            if command.endswith('/server.js') and 'server.js' in self.ftp.reads:
                self.ftp.files['server.js'] = b'changed while reading'
            return original(command, callback)
        self.ftp.retrbinary = changing
        with self.assertRaisesRegex(ValueError, 'changed during capture'):
            capture.capture(self.ftp, self.destination)
        self.assertFalse(self.destination.exists())


if __name__ == '__main__':
    unittest.main()
