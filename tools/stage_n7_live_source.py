#!/usr/bin/env python3
"""Stage authenticated ciphertext in a Git branch; never publish plaintext code."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
import zipfile


def source_payload(directory):
    manifest = json.loads((directory / 'capture-manifest.json').read_text())
    if manifest.get('schema') != 'n7-live-source/v1' or manifest.get('read_only') is not True:
        raise ValueError('Unrecognized read-only source capture')
    payload = {}
    excluded = []
    for name, expected in manifest['files'].items():
        path = PurePosixPath(name)
        if path.is_absolute() or any(part in ('.', '..') or part.startswith('.') for part in path.parts):
            raise ValueError('Unsafe capture path')
        allowed = ((len(path.parts) == 1 and (path.suffix in ('.js', '.cjs', '.mjs', '.py') or name == 'package.json'))
                   or (path.parts[0] == 'public' and path.suffix in ('.js', '.css', '.html'))
                   or (path.parts[0] == 'skills' and path.suffix in ('.js', '.md')))
        if not allowed or name.startswith('public/n7-pdf/'):
            excluded.append(name)
            continue
        local = directory / name
        if local.is_symlink() or any(p.is_symlink() for p in local.parents):
            raise ValueError('Symlink in source capture')
        data = local.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError('Captured source hash mismatch')
        payload[name] = data
    if 'server.js' not in payload or b'independent-ai-bot' not in payload.get('package.json', b''):
        raise ValueError('Unexpected application snapshot')
    receipt = dict(manifest, files={n: hashlib.sha256(v).hexdigest() for n, v in payload.items()},
                   distribution_excluded=excluded)
    payload['capture-manifest.json'] = (json.dumps(receipt, indent=2) + '\n').encode()
    return payload


def encrypted_payload(directory, recipient):
    payload = source_payload(directory)
    with tempfile.TemporaryDirectory() as temp:
        archive = Path(temp) / 'source.zip'
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
            for name, data in payload.items():
                bundle.writestr(zipfile.ZipInfo(name), data, compress_type=zipfile.ZIP_DEFLATED)
        sealed = subprocess.check_output(['openssl', 'cms', '-encrypt', '-binary', '-aes-256-gcm',
                                          '-outform', 'DER', '-in', str(archive), '-recip', str(recipient),
                                          '-keyopt', 'rsa_padding_mode:oaep', '-keyopt', 'rsa_oaep_md:sha256',
                                          '-keyopt', 'rsa_mgf1_md:sha256'])
    receipt = {'schema': 'n7-encrypted-source/v1', 'encryption': 'CMS AES-256-GCM RSA-OAEP-SHA256',
               'ciphertext_sha256': hashlib.sha256(sealed).hexdigest(),
               'recipient_certificate_sha256': hashlib.sha256(recipient.read_bytes()).hexdigest()}
    return {'capture.cms.b64': base64.b64encode(sealed) + b'\n',
            'sealed-manifest.json': (json.dumps(receipt, indent=2) + '\n').encode()}


def stage(repository, directory, branch, recipient):
    if not re.fullmatch(r'capture/n7-live-[0-9]+-[0-9]+', branch):
        raise ValueError('Unexpected capture branch')
    payload = encrypted_payload(directory, recipient)
    env = dict(os.environ, GIT_AUTHOR_NAME='N7 source capture', GIT_COMMITTER_NAME='N7 source capture',
               GIT_AUTHOR_EMAIL='n7-source-capture@users.noreply.github.com',
               GIT_COMMITTER_EMAIL='n7-source-capture@users.noreply.github.com')
    with tempfile.TemporaryDirectory() as temp:
        env['GIT_INDEX_FILE'] = str(Path(temp) / 'index')
        def git(*args, data=None):
            return subprocess.check_output(['git', '-C', str(repository), *args], input=data, env=env).decode().strip()
        git('read-tree', '--empty')
        for name, data in payload.items():
            sha = git('hash-object', '-w', '--stdin', data=data)
            git('update-index', '--add', '--cacheinfo', '100644', sha, name)
        tree = git('write-tree')
        commit = git('commit-tree', tree, '-m', 'Private read-only N7 source capture')
        git('update-ref', 'refs/heads/' + branch, commit, '0' * 40)
    return commit, len(payload)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', type=Path, required=True)
    parser.add_argument('--recipient', type=Path, required=True)
    args = parser.parse_args()
    branch = 'capture/n7-live-' + os.environ['GITHUB_RUN_ID'] + '-' + os.environ['GITHUB_RUN_ATTEMPT']
    commit, count = stage(Path.cwd(), args.capture, branch, args.recipient)
    subprocess.run(['git', 'push', 'origin', commit + ':refs/heads/' + branch], check=True)
    print(f'N7_ENCRYPTED_SOURCE_STAGED branch={branch} commit={commit} files={count} production_writes=false')
