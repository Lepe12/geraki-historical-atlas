import base64
import io
import zipfile
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
        self.key = self.root / 'key.pem'
        self.cert = self.root / 'cert.pem'
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(self.key),'-out',str(self.cert),'-sha256','-days','1','-subj','/CN=Test'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
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

    def test_only_ciphertext_is_staged_and_owner_can_decrypt_exact_source(self):
        commit, count = stage.stage(self.repo, self.capture, 'capture/n7-live-123-1', self.cert)
        self.assertEqual(count, 2)
        names = subprocess.check_output(['git', '-C', str(self.repo), 'ls-tree', '-r', '--name-only', commit], text=True).splitlines()
        self.assertEqual(set(names), {'capture.cms.b64', 'sealed-manifest.json'})
        encoded = subprocess.check_output(['git','-C',str(self.repo),'show',commit+':capture.cms.b64'])
        cipher = base64.b64decode(encoded)
        plain = subprocess.check_output(['openssl','cms','-decrypt','-binary','-inform','DER','-recip',str(self.cert),'-inkey',str(self.key)],input=cipher)
        with zipfile.ZipFile(io.BytesIO(plain)) as archive:
            self.assertEqual(archive.read('server.js'), self.files['server.js'])
            self.assertEqual(set(archive.namelist()), {'server.js','package.json','public/app.js','capture-manifest.json'})
        self.assertNotIn(self.files['server.js'], cipher)
        self.assertNotEqual(subprocess.run(['git', '-C', str(self.repo), 'show-ref', '--verify', '--quiet', 'refs/heads/main']).returncode, 0)

    def test_unexpected_branch_is_refused_and_tampered_cipher_fails_decryption(self):
        with self.assertRaisesRegex(ValueError, 'branch'):
            stage.stage(self.repo, self.capture, 'main', self.cert)
        payload = stage.encrypted_payload(self.capture, self.cert)
        cipher = bytearray(base64.b64decode(payload['capture.cms.b64']))
        cipher[-5] ^= 1
        result = subprocess.run(['openssl','cms','-decrypt','-binary','-inform','DER','-recip',str(self.cert),'-inkey',str(self.key)],input=cipher,capture_output=True)
        self.assertNotEqual(result.returncode, 0)

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
