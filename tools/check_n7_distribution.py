#!/usr/bin/env python3
"""Verify distributed bytes against a pinned Git commit using its object proof."""
import base64
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess


def git_hash(kind, data):
    return hashlib.sha1(kind.encode() + b' ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def verify_proof(manifest, payload):
    proof = manifest['git_proof']
    commit = base64.b64decode(proof['commit'], validate=True)
    if git_hash('commit', commit) != manifest['commit']:
        raise ValueError('N7 Git commit proof mismatch')
    header = commit.split(b'\n', 1)[0]
    if not re.fullmatch(rb'tree [0-9a-f]{40}', header):
        raise ValueError('Invalid Git commit tree')
    trees = {}
    for sha, encoded in proof['trees'].items():
        data = base64.b64decode(encoded, validate=True)
        if git_hash('tree', data) != sha:
            raise ValueError('N7 Git tree proof mismatch')
        entries = {}
        cursor = 0
        while cursor < len(data):
            end = data.index(b'\0', cursor)
            mode, name = data[cursor:end].split(b' ', 1)
            cursor = end + 1
            digest = data[cursor:cursor + 20]
            if len(digest) != 20:
                raise ValueError('Truncated Git tree')
            entries[name.decode()] = (mode.decode(), digest.hex())
            cursor += 20
        trees[sha] = entries
    root = header[5:].decode()
    for name, data in payload.items():
        tree = root
        parts = PurePosixPath(name).parts
        for index, part in enumerate(parts):
            mode, sha = trees[tree][part]
            if index < len(parts) - 1:
                if mode != '40000':
                    raise ValueError('Non-directory in N7 Git path')
                tree = sha
            elif mode not in ('100644', '100755') or git_hash('blob', data) != sha:
                raise ValueError('N7 file differs from pinned Git commit: ' + name)


def check(root):
    manifest = json.loads((root / 'n7-distribution.json').read_text())
    if manifest.get('schema') != 'n7-distribution/v1' or manifest.get('repository') != 'Lepe12/independent-ai-bot':
        raise ValueError('Unexpected N7 source repository/schema')
    if not re.fullmatch(r'[0-9a-f]{40}', manifest.get('commit', '')):
        raise ValueError('N7 source must be pinned to a full immutable commit')
    files = manifest['files']
    tracked = set(subprocess.check_output(['git', '-C', str(root), 'ls-files', 'tools/n7', 'tools/library'], text=True).splitlines())
    if not files or set(files) != tracked:
        raise ValueError('N7 generated source inventory differs from tracked files')
    payload = {}
    for name, expected in files.items():
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or not name.startswith(('tools/n7/', 'tools/library/')):
            raise ValueError('Unsafe N7 distribution path')
        local = root / name
        if local.is_symlink() or hashlib.sha256(local.read_bytes()).hexdigest() != expected:
            raise ValueError('Edit N7 in independent-ai-bot, then regenerate: ' + name)
        payload[name] = local.read_bytes()
    verify_proof(manifest, payload)
    return manifest['commit'], len(files)


if __name__ == '__main__':
    commit, count = check(Path(__file__).resolve().parents[1])
    print(f'N7_DISTRIBUTION_INTEGRITY_PASS commit={commit} files={count}')
