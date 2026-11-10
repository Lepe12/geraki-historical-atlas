import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import ftps_private_restore as audit


class FTP:
    def __init__(self):
        project = '11111111-1111-4111-8111-111111111111'
        doc = 'a' * 32
        text = b'PRIVATE_FIXTURE_DOCUMENT'
        digest = hashlib.sha256(text).hexdigest()
        rows = {
            'conversations.json': [{'id': 'chat', 'projectId': project, 'messages': [{'role': 'user', 'content': 'PRIVATE_FIXTURE_MESSAGE'}, {'role': 'assistant', 'content': 'reply'}]}],
            'n7-workspaces/projects.json': [{'id': project, 'name': 'Fixture', 'entries': [{'id': 'entry', 'kind': 'decision', 'text': 'PRIVATE_FIXTURE_CANON', 'approved': True, 'version': 1}]}],
            'n7-source-library/' + doc + '/metadata.json': {'id': doc, 'title': 'Fixture', 'kind': 'text', 'sourceHash': digest, 'status': 'ready', 'totalPages': 1, 'nextPage': 2},
            'n7-source-library/' + doc + '/pages/1.json': {'page': 1, 'text': text.decode(), 'textHash': digest, 'sourceHash': digest, 'method': 'manual', 'reviewed': True},
        }
        self.files = {audit.DATA + '/' + p: json.dumps(v).encode() for p, v in rows.items()}
        self.files[audit.DATA + '/n7-source-library/' + doc + '/original'] = text
        self.files[audit.DATA + '/.sessions/token'] = b'LIVE_AUTH_SESSION_NOT_BACKED_UP'
        self.dirs = {audit.ROOT, audit.DATA}
        self.writes = []
        self.corrupt = False

    def mlsd(self, folder):
        prefix = folder.rstrip('/') + '/'
        found = {}
        for p, content in self.files.items():
            if p.startswith(prefix):
                tail = p[len(prefix):]
                name = tail.split('/')[0]
                found[name] = {'type': 'dir'} if '/' in tail else {'type': 'file', 'size': str(len(content))}
        for p in self.dirs:
            if p.startswith(prefix) and '/' not in p[len(prefix):]:
                found[p[len(prefix):]] = {'type': 'dir'}
        return sorted(found.items())

    def retrbinary(self, command, callback):
        callback(self.files[command[5:]])

    def storbinary(self, command, source):
        p = command[5:]
        self.writes.append(p)
        self.files[p] = source.read()
        if self.corrupt and p.endswith('.upload.zip'):
            self.files[p] += b'corrupt'

    def mkd(self, p):
        self.dirs.add(p)

    def sendcmd(self, command):
        return '200 CHMOD OK'

    def delete(self, p):
        self.files.pop(p)

    def rename(self, source, destination):
        self.files[destination] = self.files.pop(source)


class RealRestoreProtocolTest(unittest.TestCase):
    def test_private_roundtrip_uses_actual_readers_and_never_writes_source(self):
        ftp = FTP()
        original = dict(ftp.files)
        with patch.object(audit, 'public_status', return_value=404):
            result = audit.execute(ftp, dry=False)
        self.assertEqual(result['result'], 'REAL_PRIVATE_RESTORE_VERIFIED')
        self.assertEqual(result['records']['conversations'], 1)
        self.assertEqual(result['records']['messages'], 2)
        self.assertEqual(result['records']['documents'], 1)
        self.assertEqual(result['records']['projects'], 1)
        self.assertEqual(result['records']['approvedEntries'], 1)
        self.assertEqual(result['productionDataWrites'], 0)
        self.assertTrue(all(p.startswith(audit.BACKUPS + '/') for p in ftp.writes))
        self.assertEqual({p: ftp.files[p] for p in original}, original)
        archive = next(v for p, v in ftp.files.items() if p.startswith(audit.BACKUPS) and p.endswith('.zip'))
        self.assertNotIn(b'LIVE_AUTH_SESSION_NOT_BACKED_UP', archive)

    def test_readonly_preflight_has_zero_writes(self):
        ftp = FTP()
        self.assertEqual(audit.execute(ftp, dry=True)['files'], 5)
        self.assertEqual(ftp.writes, [])

    def test_public_access_gate_fails_before_private_upload(self):
        ftp = FTP()
        with patch.object(audit, 'public_status', return_value=200):
            with self.assertRaisesRegex(ValueError, 'public_access_guard'):
                audit.execute(ftp, dry=False)
        self.assertTrue(all(p.endswith('.probe.zip') for p in ftp.writes))
        self.assertFalse(any(p.startswith(audit.BACKUPS) for p in ftp.files))

    def test_corrupt_remote_copy_fails_closed(self):
        ftp = FTP()
        ftp.corrupt = True
        original = dict(ftp.files)
        with patch.object(audit, 'public_status', return_value=404):
            with self.assertRaisesRegex(ValueError, 'upload_mismatch'):
                audit.execute(ftp, dry=False)
        self.assertEqual({p: ftp.files[p] for p in original}, original)

    def test_changed_live_source_is_not_accepted_as_stable(self):
        ftp = FTP()
        old = ftp.retrbinary
        counter = 0
        def mutate(command, callback):
            nonlocal counter
            old(command, callback)
            counter += 1
            if counter == 5:
                p = audit.DATA + '/conversations.json'
                ftp.files[p] = ftp.files[p].replace(b'PRIVATE_FIXTURE_MESSAGE', b'PRIVATE_FIXTURE_CHANGED')
        ftp.retrbinary = mutate
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError, 'live_source_changed'):
                audit.capture_stable(ftp, Path(d) / 'captured', attempts=1)
        self.assertEqual(ftp.writes, [])


if __name__ == '__main__':
    unittest.main()
