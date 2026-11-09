#!/usr/bin/env python3
"""Stage credential-screened code in a private Git branch; never deploy it."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile


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


def stage(repository, directory, branch, private):
    if not private:
        raise ValueError('Live code staging requires a private repository')
    if not re.fullmatch(r'capture/n7-live-[0-9]+-[0-9]+', branch):
        raise ValueError('Unexpected capture branch')
    payload = source_payload(directory)
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
    return commit, len(payload) - 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', type=Path, required=True)
    args = parser.parse_args()
    branch = 'capture/n7-live-' + os.environ['GITHUB_RUN_ID'] + '-' + os.environ['GITHUB_RUN_ATTEMPT']
    commit, count = stage(Path.cwd(), args.capture, branch, os.environ.get('N7_REPOSITORY_PRIVATE') == 'true')
    subprocess.run(['git', 'push', 'origin', commit + ':refs/heads/' + branch], check=True)
    print(f'N7_PRIVATE_SOURCE_STAGED branch={branch} commit={commit} files={count} production_writes=false')
