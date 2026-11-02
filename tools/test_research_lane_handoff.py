"""Exercise actual evidence transport, tampering, sparse Git and durable publication."""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from research_lane_handoff import pack, merge, digest
from publish_research_outputs import publish


class LaneTransport(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.incoming = self.root / 'incoming'
        self.incoming.mkdir()

    def bundle(self, lane='travellers', run='123', content=b'original OCR\x00\xff'):
        source = self.root / ('source-' + lane)
        path = source / 'evidence/runs' / run / lane / 'ocr/page.txt'
        path.parent.mkdir(parents=True)
        path.write_bytes(content)
        output = self.incoming / lane
        manifest = pack(source, run, lane, output)
        return output, manifest

    def test_two_lanes_preserve_exact_bytes_and_idempotent_replay(self):
        for lane in ['travellers', 'greek']:
            self.bundle(lane)
        destination = self.root / 'recovered'
        for _ in range(2):
            result = merge(destination, '123', ['travellers', 'greek'], self.incoming)
            self.assertEqual(result['missing_lanes'], [])
            self.assertEqual(result['files'], 2)
            self.assertFalse(result['historical_verified'])
            self.assertEqual((destination / 'evidence/runs/123/greek/ocr/page.txt').read_bytes(), b'original OCR\x00\xff')

    def test_missing_lane_report_retains_available_evidence(self):
        self.bundle()
        result = merge(self.root / 'recovered', '123', ['travellers', 'greek'], self.incoming)
        self.assertEqual(result['missing_lanes'], ['greek'])
        self.assertEqual(result['files'], 1)

    def test_wrong_run_or_unselected_lane_rejected(self):
        self.bundle()
        for run, lanes in [('124', ['travellers']), ('123', ['greek'])]:
            with self.assertRaises(ValueError):
                merge(self.root / 'recovered', run, lanes, self.incoming)

    def test_corrupt_archive_rejected_before_any_lane_is_written(self):
        self.bundle('greek')
        bundle, _ = self.bundle('travellers')
        with (bundle / 'evidence.tar.gz').open('ab') as out:
            out.write(b'tampered')
        with self.assertRaisesRegex(ValueError, 'CHECKSUM'):
            merge(self.root / 'recovered', '123', ['greek', 'travellers'], self.incoming)
        self.assertFalse((self.root / 'recovered/evidence').exists())

    def test_changed_file_rejected_even_with_updated_archive_checksum(self):
        bundle, manifest = self.bundle()
        entry = manifest['files'][0]
        with tarfile.open(bundle / 'evidence.tar.gz', 'w:gz') as tar:
            member = tarfile.TarInfo(entry['path'])
            member.size = 7
            tar.addfile(member, io.BytesIO(b'changed'))
        manifest['archive_sha256'] = digest(bundle / 'evidence.tar.gz')
        (bundle / 'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'CHECKSUM'):
            merge(self.root / 'recovered', '123', ['travellers'], self.incoming)

    def test_path_escape_and_symlink_are_rejected(self):
        bundle, manifest = self.bundle()
        for name, symlink in [('../escape', False), ('evidence/runs/123/travellers/link', True)]:
            with tarfile.open(bundle / 'evidence.tar.gz', 'w:gz') as tar:
                member = tarfile.TarInfo(name)
                member.size = 0
                if symlink:
                    member.type = tarfile.SYMTYPE
                    member.linkname = '/etc/passwd'
                tar.addfile(member, io.BytesIO(b''))
            manifest['files'] = [{'path': name, 'bytes': 0, 'sha256': hashlib.sha256(b'').hexdigest()}]
            manifest['archive_sha256'] = digest(bundle / 'evidence.tar.gz')
            (bundle / 'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'UNSAFE'):
                merge(self.root / 'recovered', '123', ['travellers'], self.incoming)

    def test_conflicting_existing_evidence_not_overwritten(self):
        self.bundle()
        destination = self.root / 'recovered'
        path = destination / 'evidence/runs/123/travellers/ocr/page.txt'
        path.parent.mkdir(parents=True)
        path.write_bytes(b'existing different evidence')
        with self.assertRaisesRegex(ValueError, 'CONFLICT'):
            merge(destination, '123', ['travellers'], self.incoming)
        self.assertEqual(path.read_bytes(), b'existing different evidence')

    def test_same_lane_twice_rejected(self):
        import shutil
        bundle, _ = self.bundle()
        shutil.copytree(bundle, self.incoming / 'duplicate')
        with self.assertRaisesRegex(ValueError, 'DUPLICATE'):
            merge(self.root / 'recovered', '123', ['travellers'], self.incoming)

    def test_pack_refuses_symlink(self):
        self.bundle()
        source = self.root / 'source-travellers'
        (source / 'evidence/runs/123/travellers/link').symlink_to('/etc/passwd')
        with self.assertRaisesRegex(ValueError, 'SYMLINK'):
            pack(source, '123', 'travellers', self.incoming / 'other')

    def test_sparse_checkout_and_real_publisher_preserve_other_runs(self):
        def git(cwd, *args):
            return subprocess.check_output(['git', '-C', str(cwd), *args], stderr=subprocess.PIPE).decode().strip()
        repo, remote, worker = (self.root / n for n in ['repo', 'remote.git', 'worker'])
        repo.mkdir()
        git(repo, 'init', '-b', 'main')
        git(repo, 'config', 'user.email', 'test@example.org')
        git(repo, 'config', 'user.name', 'test')
        for name in ['evidence/runs/122/old.txt', 'evidence/specialist_runs/122/old.txt',
                     'backups/old.txt', 'tools/keep.txt', 'data/keep.txt']:
            path = repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(name)
        git(repo, 'add', '.')
        git(repo, 'commit', '-m', 'seed')
        git(repo, 'commit', '--allow-empty', '-m', 'parent available')
        subprocess.run(['git', 'clone', '--bare', str(repo), str(remote)], check=True, capture_output=True)
        subprocess.run(['git', 'clone', '--depth=2', '--no-local', '--no-checkout', str(remote), str(worker)], check=True, capture_output=True)
        git(worker, 'sparse-checkout', 'init', '--no-cone')
        patterns = '/*\n!/evidence/runs/\n/evidence/runs/123/\n!/evidence/specialist_runs/\n/evidence/specialist_runs/123/\n!/backups/\n'
        (worker / '.git/info/sparse-checkout').write_text(patterns)
        git(worker, 'checkout', 'main')
        self.assertFalse((worker / 'evidence/runs/122/old.txt').exists())
        self.assertTrue((worker / 'tools/keep.txt').exists())
        git(worker, 'config', 'user.email', 'test@example.org')
        git(worker, 'config', 'user.name', 'test')
        self.bundle()
        merge(worker, '123', ['travellers'], self.incoming)
        git(worker, 'add', 'evidence/runs/123/')
        git(worker, 'commit', '-m', 'all lane evidence')
        previous = Path.cwd()
        try:
            os.chdir(worker)
            with patch.dict(os.environ, {'GITHUB_RUN_ID': '123', 'GITHUB_REF': 'refs/heads/main', 'GITHUB_EVENT_NAME': 'workflow_dispatch'}):
                result = publish()
        finally:
            os.chdir(previous)
        self.assertEqual(result['status'], 'SUCCEEDED')
        self.assertEqual(git(remote, 'show', 'main:evidence/runs/122/old.txt'), 'evidence/runs/122/old.txt')
        report = json.loads(git(remote, 'show', 'main:evidence/runs/123/LANE_HANDOFF.json'))
        self.assertEqual(report['received_lanes'], ['travellers'])
        self.assertEqual(git(remote, 'rev-parse', 'main:evidence/runs/123/travellers/ocr/page.txt'),
                         git(worker, 'hash-object', 'evidence/runs/123/travellers/ocr/page.txt'))


if __name__ == '__main__':
    unittest.main()
