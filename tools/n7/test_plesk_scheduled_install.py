"""Run the guarded Plesk transaction against files in a temporary app root."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit

spec = importlib.util.spec_from_file_location('deploy', Path(__file__).with_name('deploy_reconciled_runtime.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class PleskInstallTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'n7-app'
        self.root.mkdir()
        (self.root / 'tmp').mkdir()
        self.release = deploy.contract()
        self.initial = {name: ('live ' + name).encode() for name in deploy.SECURITY_READ_ONLY}
        self.initial.update({'public/app.js': b'actual live UI', 'data/conversations.json': b'private data'})
        self.release['security_live_prerequisites'] = {
            name: deploy.sha(self.initial[name]) for name in deploy.SECURITY_READ_ONLY
        }
        for name in deploy.SECURITY_FILES:
            if name in self.release['previous_files']:
                self.initial[name] = ('old ' + name).encode()
                self.release['previous_files'][name] = deploy.sha(self.initial[name])
        hashes = {name: deploy.sha(data) for name, data in self.initial.items() if name in self.release['files']}
        manifest = {'schema': 'n7-runtime-build/v1', 'files': hashes,
                    'release_id': deploy.sha(json.dumps(hashes, sort_keys=True, separators=(',', ':')).encode())}
        self.initial['release-manifest.json'] = json.dumps(manifest).encode()
        for name, data in self.initial.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        self.target = deploy.PleskFiles(self.root)

    def plan(self):
        with patch.object(deploy, 'syntax'):
            return deploy.plan_delta(self.target, self.release, 'a' * 40)

    def contents(self):
        return {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}

    def test_dry_run_only_reads_real_files(self):
        with patch.object(deploy, 'contract', return_value=self.release), \
             patch.object(deploy, 'local_commit', return_value='a' * 40), \
             patch.object(deploy, 'PleskFiles', return_value=self.target), \
             patch.object(deploy, 'connect', side_effect=AssertionError('FTPS must not be used')), \
             patch.object(deploy, 'syntax'), patch.object(deploy, 'verify'):
            deploy.main(('--plesk', '--scope', 'security', '--dry-run'))
        self.assertEqual(self.contents(), self.initial)

    def test_apply_keeps_backups_and_protected_files_and_signals_passenger(self):
        payload, originals, receipt, protected = self.plan()
        deploy.install(self.target, payload, originals, lambda: None, protected)
        for name, data in payload.items():
            self.assertEqual((self.root / name).read_bytes(), data)
        for name in set(self.initial) - set(payload):
            self.assertEqual((self.root / name).read_bytes(), self.initial[name])
        self.assertEqual(json.loads((self.root / 'release-manifest.json').read_text()), receipt)
        self.assertTrue((self.root / 'tmp' / 'restart.txt').is_file())
        self.assertIn(self.initial['skills/mcp-client.js'],
                      [p.read_bytes() for p in self.root.glob('.n7-runtime-backup-*')])
        self.assertFalse((self.root / '.n7-runtime-deploy-lock').exists())
        marker = self.root / 'tmp' / 'restart.txt'
        restarted = marker.stat().st_mtime_ns
        contents = self.contents()
        payload, originals, _, protected = self.plan()
        deploy.install(self.target, payload, originals, lambda: None, protected)
        self.assertEqual(self.contents(), contents)
        self.assertEqual(marker.stat().st_mtime_ns, restarted)

    def test_failed_verification_restores_real_files(self):
        payload, originals, _, protected = self.plan()
        def fail():
            raise RuntimeError('health verification failed')
        with self.assertRaisesRegex(RuntimeError, 'health verification'):
            deploy.install(self.target, payload, originals, fail, protected)
        self.assertEqual({k:v for k,v in self.contents().items() if k != 'tmp/restart.txt'}, self.initial)

    def test_refuses_symlink_and_writes_outside_the_security_scope(self):
        file = self.root / 'skills' / 'mcp-client.js'
        outside = Path(self.tmp.name) / 'outside.js'
        outside.write_bytes(file.read_bytes())
        file.unlink()
        file.symlink_to(outside)
        with self.assertRaisesRegex(RuntimeError, 'N7_PLESK_SYMLINK_REFUSED'):
            self.plan()
        with self.assertRaisesRegex(RuntimeError, 'N7_PLESK_WRITE_SCOPE_INVALID'):
            self.target.delete(deploy.ROOT + '/data/conversations.json')
        self.assertEqual(outside.read_bytes(), self.initial['skills/mcp-client.js'])

    def news_fixture(self):
        for name in ('n7-agents.js', 'news-geopolitics.js'):
            self.initial[name] = ('installed ' + name).encode()
            (self.root / name).write_bytes(self.initial[name])
        hashes = {name: deploy.sha(data) for name, data in self.initial.items() if name in self.release['files']}
        release_id = deploy.sha(json.dumps(hashes, sort_keys=True, separators=(',', ':')).encode())
        manifest = {'schema': 'n7-runtime-build/v1', 'files': hashes, 'release_id': release_id}
        self.initial['release-manifest.json'] = json.dumps(manifest).encode()
        (self.root / 'release-manifest.json').write_bytes(self.initial['release-manifest.json'])
        return release_id

    def test_news_apply_updates_only_the_reviewed_files(self):
        predecessor = self.news_fixture()
        with patch.object(deploy, 'NEWS_PREVIOUS_RELEASE', predecessor), \
             patch.object(deploy, 'PLESK_ROOT', self.root), \
             patch.object(deploy, 'contract', return_value=self.release), \
             patch.object(deploy, 'local_commit', return_value='b' * 40), \
             patch.object(deploy, 'connect', side_effect=AssertionError('FTPS must not be used')), \
             patch.object(deploy, 'syntax'), patch.object(deploy, 'verify') as verify:
            deploy.main(('--plesk', '--scope', 'news', '--apply'))
        self.assertEqual(verify.call_count, 2)
        targets = {'n7-agents.js', 'news-geopolitics.js', 'release-manifest.json'}
        self.assertEqual({name for name, data in self.initial.items()
                          if (self.root / name).read_bytes() != data}, targets)
        self.assertTrue((self.root / 'tmp' / 'restart.txt').is_file())
        self.assertEqual(len(list(self.root.glob('.n7-runtime-backup-*'))), len(targets))
        with self.assertRaisesRegex(RuntimeError, 'N7_PLESK_WRITE_SCOPE_INVALID'):
            deploy.PleskFiles(self.root, 'news').delete(deploy.ROOT + '/skills/mcp-client.js')

    def test_news_preflight_rejects_unreviewed_release_and_changed_target(self):
        predecessor = self.news_fixture()
        target = deploy.PleskFiles(self.root, 'news')
        with self.assertRaisesRegex(RuntimeError, 'N7_NEWS_PREDECESSOR_NOT_REVIEWED'):
            deploy.plan_delta(target, self.release, 'b' * 40, 'news')
        (self.root / 'news-geopolitics.js').write_bytes(b'unreviewed local change')
        with patch.object(deploy, 'NEWS_PREVIOUS_RELEASE', predecessor), patch.object(deploy, 'syntax'):
            with self.assertRaisesRegex(RuntimeError, 'N7_NEWS_TARGET_DRIFT news-geopolitics.js'):
                deploy.plan_delta(target, self.release, 'b' * 40, 'news')

    def agents_fixture(self):
        payload, previous, preserved = deploy.read_agent_bundle()
        for name in deploy.DELTA_FILES['agents']:
            self.initial[name] = ('installed ' + name).encode()
        for name, digest in previous.items():
            if digest is not None:
                self.initial[name] = ('installed ' + name).encode()
                previous[name] = deploy.sha(self.initial[name])
        for name in preserved:
            self.initial[name] = ('retained ' + name).encode()
            preserved[name] = deploy.sha(self.initial[name])
        hashes = {name: deploy.sha(data) for name, data in self.initial.items() if name in self.release['files']}
        release_id = deploy.sha(json.dumps(hashes, sort_keys=True, separators=(',', ':')).encode())
        manifest = {'schema': 'n7-runtime-build/v1', 'files': hashes, 'release_id': release_id}
        self.initial['release-manifest.json'] = json.dumps(manifest).encode()
        for name, data in self.initial.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        return (payload, previous, preserved), release_id

    def agents_apply(self, bundle, predecessor, request, mode='--apply'):
        with patch.object(deploy, 'AGENTS_PREVIOUS_RELEASE', predecessor), \
             patch.object(deploy, 'PLESK_ROOT', self.root), \
             patch.object(deploy, 'contract', return_value=self.release), \
             patch.object(deploy, 'local_commit', return_value='c' * 40), \
             patch.object(deploy, 'read_agent_bundle', return_value=bundle), \
             patch.object(deploy, 'connect', side_effect=AssertionError('FTPS must not be used')), \
             patch.object(deploy, 'request', side_effect=request), patch.object(deploy, 'verify'):
            deploy.main(('--plesk', '--scope', 'agents', mode))

    def public_file(self, route):
        path = urlsplit(route).path
        if path == '/n7-apex/':
            path += 'index.html'
        return io.BytesIO((self.root / ('public' + path)).read_bytes())

    def test_agents_applies_the_release_bundle_and_reuses_the_deployment(self):
        bundle, predecessor = self.agents_fixture()
        payload, previous, preserve = bundle
        self.agents_apply(bundle, predecessor, self.public_file, '--dry-run')
        self.assertEqual(self.contents(), self.initial)
        self.agents_apply(bundle, predecessor, self.public_file)
        for name, data in payload.items():
            self.assertEqual((self.root / name).read_bytes(), data)
        for name in preserve:
            self.assertEqual((self.root / name).read_bytes(), self.initial[name])
        self.assertEqual((self.root / 'data/conversations.json').read_bytes(), b'private data')
        self.assertTrue((self.root / 'tmp/restart.txt').is_file())
        self.assertIn(self.initial[deploy.APEX_ENTRY[1]],
                      [path.read_bytes() for path in self.root.glob('.n7-runtime-backup-*')])
        before = self.contents()
        restart_time = (self.root / 'tmp/restart.txt').stat().st_mtime_ns
        self.agents_apply(bundle, predecessor, self.public_file)
        self.assertEqual(self.contents(), before)
        self.assertEqual((self.root / 'tmp/restart.txt').stat().st_mtime_ns, restart_time)

    def test_agents_rolls_back_both_parts_if_humanoid_public_readback_fails(self):
        bundle, predecessor = self.agents_fixture()
        def stale_html(route):
            if urlsplit(route).path == '/n7-apex/':
                return io.BytesIO(self.initial[deploy.APEX_ENTRY[1]])
            return self.public_file(route)
        with self.assertRaisesRegex(RuntimeError, 'N7_AGENT_APEX_HTTP_HASH_MISMATCH'):
            self.agents_apply(bundle, predecessor, stale_html)
        self.assertEqual({name: data for name, data in self.contents().items()
                          if name != 'tmp/restart.txt'}, self.initial)

    def test_agents_rejects_changed_niki_bytes_before_writing(self):
        bundle, predecessor = self.agents_fixture()
        (self.root / deploy.APEX_NIKI[0]).write_bytes(b'unreviewed voice')
        before = self.contents()
        with self.assertRaisesRegex(RuntimeError, 'N7_AGENT_APEX_PRESERVED_FILE_DRIFT'):
            self.agents_apply(bundle, predecessor, self.public_file)
        self.assertEqual(self.contents(), before)

    def test_browser_scope_adds_the_approved_host_file_and_rolls_back_a_failed_read(self):
        for name in deploy.DELTA_FILES['browser']:
            if name == deploy.BROWSER_CONFIG:
                continue
            self.initial[name] = ('installed ' + name).encode()
            (self.root / name).write_bytes(self.initial[name])
        hashes = {name: deploy.sha(data) for name, data in self.initial.items() if name in self.release['files']}
        predecessor = deploy.sha(json.dumps(hashes, sort_keys=True, separators=(',', ':')).encode())
        manifest = {'schema': 'n7-runtime-build/v1', 'files': hashes, 'release_id': predecessor}
        self.initial['release-manifest.json'] = json.dumps(manifest).encode()
        (self.root / 'release-manifest.json').write_bytes(self.initial['release-manifest.json'])
        with patch.object(deploy, 'BROWSER_PREVIOUS_RELEASE', predecessor), \
             patch.object(deploy, 'PLESK_ROOT', self.root), \
             patch.object(deploy, 'contract', return_value=self.release), \
             patch.object(deploy, 'local_commit', return_value='d' * 40), \
             patch.object(deploy, 'verify') as verify, \
             patch.object(deploy, 'verify_browser', side_effect=RuntimeError('public read failed')) as read:
            deploy.main(('--plesk', '--scope', 'browser', '--dry-run'))
            self.assertEqual(self.contents(), self.initial)
            with self.assertRaisesRegex(RuntimeError, 'public read failed'):
                deploy.main(('--plesk', '--scope', 'browser', '--apply'))
            self.assertTrue(verify.call_args[1]['require_browser'])
            self.assertEqual({name: data for name, data in self.contents().items()
                              if name != 'tmp/restart.txt'}, self.initial)
            read.side_effect = None
            deploy.main(('--plesk', '--scope', 'browser', '--apply'))
        self.assertEqual(deploy.sha((self.root / deploy.BROWSER_CONFIG).read_bytes()),
                         self.release['files'][deploy.BROWSER_CONFIG])
        self.assertEqual((self.root / 'data/conversations.json').read_bytes(), b'private data')


if __name__ == '__main__':
    unittest.main()
