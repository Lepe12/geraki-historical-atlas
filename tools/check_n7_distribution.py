#!/usr/bin/env python3
"""Offline integrity check for the generated N7 distribution (not its origin)."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess


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
    for name, expected in files.items():
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or not name.startswith(('tools/n7/', 'tools/library/')):
            raise ValueError('Unsafe N7 distribution path')
        local = root / name
        if local.is_symlink() or hashlib.sha256(local.read_bytes()).hexdigest() != expected:
            raise ValueError('Edit N7 in independent-ai-bot, then regenerate: ' + name)
    return manifest['commit'], len(files)


if __name__ == '__main__':
    commit, count = check(Path(__file__).resolve().parents[1])
    print(f'N7_DISTRIBUTION_INTEGRITY_PASS commit={commit} files={count}')
