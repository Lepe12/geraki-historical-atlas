import ftplib
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy', Path(__file__).with_name('deploy_reconciled_runtime.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class FTP:
    def __init__(self):
        self.files = {deploy.ROOT + '/server.js': b'old server', deploy.ROOT + '/data/conversations.json': b'PRIVATE USER DATA'}
        self.events = []
        self.lock = False
        self.directories = set()
        self.corrupt_stage = False
        self.fail_server_rename = False
        self.corrupt_backup = False

    def retrbinary(self, command, callback):
        name = command.removeprefix('RETR ')
        if name not in self.files:
            raise ftplib.error_perm('550 Not found')
        data = self.files[name]
        if self.corrupt_stage and '.n7-runtime-stage-' in name:
            data += b'corrupt'
        if self.corrupt_backup and name.endswith('server.js') and '.n7-runtime-backup-' in name:
            self.corrupt_backup = False
            data += b'corrupt readback'
        callback(data)

    def storbinary(self, command, source):
        name = command.removeprefix('STOR ')
        self.events.append(('write', name))
        self.files[name] = source.read()

    def rename(self, source, destination):
        self.events.append(('rename', source, destination))
        if self.fail_server_rename and '.n7-runtime-stage-' in source and destination.endswith('/server.js'):
            self.fail_server_rename = False
            raise ftplib.error_temp('450 synthetic rename failure')
        self.files[destination] = self.files.pop(source)

    def delete(self, name):
        self.events.append(('delete', name))
        if name not in self.files:
            raise ftplib.error_perm('550 Not found')
        del self.files[name]

    def mkd(self, name):
        if not name.endswith('/.n7-runtime-deploy-lock'):
            if name in self.directories:
                raise ftplib.error_perm('550 Existing directory')
            self.directories.add(name)
            return
        if self.lock:
            raise ftplib.error_perm('550 Existing lock')
        self.lock = True

    def rmd(self, name):
        if name.endswith('/.n7-runtime-deploy-lock'):
            self.lock = False
        else:
            self.directories.remove(name)

    def sendcmd(self, command):
        self.events.append(('chmod', command))

    def quit(self):
        pass


class GuardedDeployTest(unittest.TestCase):
    def setUp(self):
        self.ftp = FTP()
        self.payload = {'n7-release-info.js': b'new helper', 'release-manifest.json': b'new receipt', 'server.js': b'new server'}
        self.originals = {'n7-release-info.js': None, 'release-manifest.json': None, 'server.js': b'old server'}

    def assert_original(self):
        self.assertEqual(self.ftp.files[deploy.ROOT + '/server.js'], b'old server')
        self.assertEqual(self.ftp.files[deploy.ROOT + '/data/conversations.json'], b'PRIVATE USER DATA')
        self.assertNotIn(deploy.ROOT + '/n7-release-info.js', self.ftp.files)
        self.assertNotIn(deploy.ROOT + '/release-manifest.json', self.ftp.files)

    def test_success_retains_verified_backup_and_never_writes_private_data(self):
        deploy.install(self.ftp, self.payload, self.originals, lambda: None)
        for name, data in self.payload.items():
            self.assertEqual(self.ftp.files[deploy.ROOT + '/' + name], data)
        backups = [v for k, v in self.ftp.files.items() if '/.n7-runtime-backup-' in k]
        self.assertEqual(backups, [b'old server'])
        self.assertFalse(any('/data/' in item for event in self.ftp.events for item in event if isinstance(item, str)))
        self.assertFalse(self.ftp.lock)

    def test_failed_live_verification_restores_all_original_paths(self):
        def fail():
            raise RuntimeError('synthetic live verification failure')
        with self.assertRaisesRegex(RuntimeError, 'verification failure'):
            deploy.install(self.ftp, self.payload, self.originals, fail)
        self.assert_original()
        self.assertFalse(self.ftp.lock)

    def test_identical_release_is_verified_without_rewrites_or_restart(self):
        for name, data in self.payload.items():
            self.ftp.files[deploy.ROOT + '/' + name] = data
        checked = []
        deploy.install(self.ftp, self.payload, dict(self.payload), lambda: checked.append(True))
        self.assertEqual(checked, [True])
        self.assertEqual(self.ftp.events, [])
        self.assertFalse(self.ftp.lock)

    def test_stage_corruption_aborts_before_any_live_rename(self):
        self.ftp.corrupt_stage = True
        with self.assertRaisesRegex(RuntimeError, 'STAGE_HASH'):
            deploy.install(self.ftp, self.payload, self.originals, lambda: None)
        self.assert_original()
        self.assertFalse(any(e[0] == 'rename' for e in self.ftp.events))

    def test_server_swap_failure_rolls_back_dependencies_and_receipt(self):
        self.ftp.fail_server_rename = True
        with self.assertRaises(ftplib.error_temp):
            deploy.install(self.ftp, self.payload, self.originals, lambda: None)
        self.assert_original()

    def test_failed_backup_readback_restores_moved_original(self):
        self.ftp.corrupt_backup = True
        with self.assertRaisesRegex(RuntimeError, 'BACKUP_HASH'):
            deploy.install(self.ftp, self.payload, self.originals, lambda: None)
        self.assert_original()

    def test_unreviewed_concurrent_change_is_preserved_and_private_scope_rejected(self):
        self.ftp.files[deploy.ROOT + '/server.js'] = b'owner concurrent change'
        with self.assertRaisesRegex(RuntimeError, 'CONCURRENT'):
            deploy.install(self.ftp, self.payload, self.originals, lambda: None)
        self.assertEqual(self.ftp.files[deploy.ROOT + '/server.js'], b'owner concurrent change')
        with self.assertRaisesRegex(RuntimeError, 'WRITE_SCOPE'):
            deploy.install(self.ftp, {'data/conversations.json': b'changed'}, {'data/conversations.json': b'old'}, lambda: None)

    def test_new_skill_directories_and_public_bundle_rollback_without_touching_data(self):
        skill = 'skills/book-project-canon/SKILL.md'
        self.payload = {skill: b'reviewed skill', 'public/app.js': b'new app', **self.payload}
        self.originals = {skill: None, 'public/app.js': b'old app', **self.originals}
        self.ftp.files[deploy.ROOT + '/public/app.js'] = b'old app'
        def fail():
            raise RuntimeError('synthetic verification failure')
        with self.assertRaisesRegex(RuntimeError, 'verification failure'):
            deploy.install(self.ftp, self.payload, self.originals, fail)
        self.assertEqual(self.ftp.files[deploy.ROOT + '/public/app.js'], b'old app')
        self.assertNotIn(deploy.ROOT + '/' + skill, self.ftp.files)
        self.assertEqual(self.ftp.directories, set())
        self.assert_original()

    def test_preview_exports_only_hash_verified_public_bytes(self):
        import tempfile
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary)
            release = {'files': {'server.js': deploy.sha(b'private server'),
                                  'public/app.js': deploy.sha(b'approved public app')}}
            deploy.public_preview(self.ftp, release, {'public/app.js': b'approved public app',
                                                     'server.js': b'private server'}, target)
            self.assertEqual((target / 'app.js').read_bytes(), b'approved public app')
            self.assertFalse((target / 'server.js').exists())
            self.assertEqual(self.ftp.events, [])

    def test_preflight_accepts_only_reviewed_previous_public_hash_and_final_requires_target(self):
        import io, json, urllib.error
        old, target = b'installed public app', b'target public app'
        release = {'release_id': 'a'*64, 'files': {'public/app.js': deploy.sha(target)},
                   'previous_files': {'public/app.js': deploy.sha(old)}}
        live = [old]
        def request(path, method='GET'):
            if path.startswith('/health'):
                return io.BytesIO(json.dumps({'status':'ok','modelConfigured':True,
                    'release':{'id':'a'*64,'canonical_commit':'b'*40}}).encode())
            if path == '/api/status':
                return io.BytesIO(json.dumps({'authenticated':False,'modelConfigured':True}).encode())
            if path.startswith('/api/'):
                raise urllib.error.HTTPError(path,401,'protected',None,None)
            return io.BytesIO(live[0])
        with patch.object(deploy,'request',side_effect=request), patch.object(deploy.time,'sleep'), patch.object(deploy.time,'monotonic',side_effect=iter(range(0,100000,100))):
            deploy.verify(release,'b'*40,active=False)
            with self.assertRaisesRegex(RuntimeError,'PUBLIC_RUNTIME_HASH_MISMATCH'):
                deploy.verify(release,'b'*40,active=True)
            live[0] = b'unapproved manual edit'
            with self.assertRaisesRegex(RuntimeError,'PUBLIC_RUNTIME_HASH_MISMATCH'):
                deploy.verify(release,'b'*40,active=False)
            live[0] = target
            deploy.verify(release,'b'*40,active=True)

    def test_html_verification_uses_the_real_application_entry_route(self):
        import io, json, urllib.error
        seen=[]
        def request(path, method='GET'):
            seen.append(path)
            if path.startswith('/health'):
                return io.BytesIO(json.dumps({'status':'ok','modelConfigured':True,
                    'release':{'id':'a'*64,'canonical_commit':'b'*40}}).encode())
            if path == '/api/status':
                return io.BytesIO(b'{"authenticated":false,"modelConfigured":true}')
            if path.startswith('/api/'):
                raise urllib.error.HTTPError(path,401,'protected',None,None)
            if path.startswith('/?n7verify='):
                return io.BytesIO(b'canonical current HTML')
            return io.BytesIO(b'stale static index alias')
        with patch.object(deploy,'request',side_effect=request):
            deploy.verify({'release_id':'a'*64,'files':{'public/index.html':deploy.sha(b'canonical current HTML')}},'b'*40)
        self.assertTrue(any(p.startswith('/?n7verify=') for p in seen))
        self.assertFalse(any(p.startswith('/index.html') for p in seen))

    def test_dry_run_never_acquires_lock_stages_or_installs(self):
        with patch.dict(deploy.os.environ, {'N7_CANONICAL_COMMIT':'a'*40,'N7_DRY_RUN':'1'}), \
             patch.object(deploy,'contract',return_value={'files':{}}), \
             patch.object(deploy,'connect',return_value=self.ftp), \
             patch.object(deploy,'plan',return_value=(self.payload,self.originals)), \
             patch.object(deploy,'verify'),patch.object(deploy,'install') as installation:
            deploy.main()
        installation.assert_not_called()
        self.assertEqual(self.ftp.events, [])
        self.assertFalse(self.ftp.lock)

    def test_only_the_known_public_chat_variant_is_removed_back_to_the_reviewed_server(self):
        reviewed = b"const API_KEY=1,MODEL=2,BASE=3;\nconst server = http.createServer(async (req, res) => {\n  route();\n});\n"
        live = reviewed.replace(b'const server', deploy.APEX_PUBLIC_SHIM.encode() + b'const server', 1)
        live = live.replace(b'(req, res) => {', b'(req, res) => {' + deploy.APEX_PUBLIC_GUARD.encode(), 1)
        self.assertEqual(deploy.remove_apex_public(live), reviewed)
        self.ftp.files[deploy.ROOT + '/server.js'] = live
        server = b'// new server'
        release = {'release_id': 'a'*64, 'previous_server_sha256': deploy.sha(b'other'),
                   'previous_files': {'server.js': deploy.sha(reviewed)}, 'files': {'server.js': deploy.sha(server)}}
        seen = []
        with patch.object(deploy, 'KNOWN_UNREVIEWED_SERVERS', {deploy.sha(live)}), patch.object(deploy, 'syntax'), \
             patch.object(deploy, 'PUBLIC_MODULES', {}):
            payload, originals = deploy.plan(self.ftp, release, 'b'*40, transformer=lambda s: seen.append(s) or server)
            self.assertEqual(seen, [reviewed])
            self.assertEqual(originals['server.js'], live)
            self.assertEqual(payload['server.js'], server)
            self.ftp.files[deploy.ROOT + '/server.js'] = live + b' '
            with self.assertRaisesRegex(RuntimeError, 'UNREVIEWED_LIVE_SERVER'):
                deploy.plan(self.ftp, release, 'b'*40, transformer=lambda s: server)
        self.assertEqual(self.ftp.events, [])

    def test_stage_styles_are_appended_once_and_only_to_the_reviewed_stylesheet(self):
        stage = (deploy.HERE / 'humanoid-stage.css').read_bytes()
        installed = b'body{color:#000}\n\n'
        target = deploy.transform_css(installed)
        self.assertEqual(target, installed + b'\n' + stage)
        self.assertEqual(deploy.transform_css(target), target)
        with self.assertRaisesRegex(RuntimeError, 'CSS_ANCHOR_CHANGED'):
            deploy.transform_css(target + stage)

    def test_upgrade_accepts_only_exact_previous_modules_and_rejects_drift(self):
        modules = {name: (deploy.HERE / source).read_bytes() for name, source in deploy.PUBLIC_MODULES.items()}
        previous = {name: b'// previous approved ' + name.encode() for name in modules if name != 'conversation-store.js'}
        for name, data in previous.items():
            self.ftp.files[deploy.ROOT + '/' + name] = data
        server = b'// new server'
        release = {'release_id': 'a'*64, 'previous_server_sha256': deploy.sha(b'old server'),
                   'previous_files': {name: deploy.sha(data) for name, data in previous.items()},
                   'files': {'server.js': deploy.sha(server), **{name: deploy.sha(data) for name, data in modules.items()}}}
        with patch.object(deploy, 'syntax'):
            payload, originals = deploy.plan(self.ftp, release, 'b'*40, transformer=lambda _: server)
        self.assertEqual(set(payload), deploy.WRITABLE - {'public/app.js', 'public/index.html', 'public/style.css'})
        self.assertIsNone(originals['conversation-store.js'])
        self.assertEqual(list(payload)[0], 'conversation-store.js')
        self.assertEqual(list(payload)[-1], 'server.js')
        self.ftp.files[deploy.ROOT + '/source-library.js'] = b'local unapproved edit'
        with patch.object(deploy, 'syntax'), self.assertRaisesRegex(RuntimeError, 'RUNTIME_DRIFT source-library.js'):
            deploy.plan(self.ftp, release, 'b'*40, transformer=lambda _: server)
        self.assertEqual(self.ftp.events, [])


if __name__ == '__main__':
    unittest.main()
