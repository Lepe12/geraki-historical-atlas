#!/usr/bin/env python3
"""Publish data only, with a fixed path policy and an ephemeral job token.

The token's native permission is repository-wide. This policy is a code guard,
not a GitHub folder ACL. Never execute downloaded research output.
"""
import argparse
import base64
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

REPOSITORY = 'Lepe12/geraki-historical-atlas'
ORIGIN = 'https://github.com/' + REPOSITORY


def allowed(path, run_id, control=False):
    if not re.fullmatch(r'[1-9][0-9]*', run_id):
        return False
    parts = path.split('/')
    if any(p in ('', '.', '..', '.git', '.github') for p in parts):
        return False
    if any(ord(c) < 32 for c in path) or '\\' in path:
        return False
    if control:
        return path == f'evidence/library_agent_controls/{run_id}/write_test.json'
    prefix = f'evidence/runs/{run_id}/'
    return (path == prefix + 'MARIADB_STORAGE_INTENT.json' or
            path.startswith(prefix + 'travellers/') and len(parts) > 4)


def git(*args, env=None):
    result = subprocess.run(['git', *args], env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, check=False)
    if result.returncode:
        raise RuntimeError('GIT_OPERATION_FAILED: ' + args[0])
    return result.stdout


def validate_paths(data, run_id, control):
    paths = [p.decode('utf-8') for p in data.split(b'\0') if p]
    if not paths or not all(allowed(p, run_id, control) for p in paths):
        raise ValueError('WRITE_PATH_OUTSIDE_ALLOWLIST')
    return paths


def copy_bundle(bundle, run_id):
    files = []
    if bundle.is_symlink() or not bundle.is_dir():
        raise ValueError('INVALID_BUNDLE')
    for source in bundle.rglob('*'):
        if source.is_symlink():
            raise ValueError('BUNDLE_SYMLINK')
        if source.is_file():
            name = source.relative_to(bundle).as_posix()
            if not allowed(name, run_id):
                raise ValueError('WRITE_PATH_OUTSIDE_ALLOWLIST')
            files.append((source, name))
    if not files:
        raise ValueError('EMPTY_BUNDLE')
    # Validate all paths before making any writes; reject destination symlinks.
    for _, name in files:
        destination = Path(name)
        if any(p.is_symlink() for p in (destination, *destination.parents)):
            raise ValueError('DESTINATION_SYMLINK')
        if destination.exists():
            raise ValueError('RESULT_ALREADY_EXISTS')
    for source, name in files:
        destination = Path(name)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        destination.chmod(0o644)
    return [name for _, name in files]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', type=Path)
    parser.add_argument('--control', action='store_true')
    args = parser.parse_args()
    run_id = os.environ.get('GITHUB_RUN_ID', '')
    if os.environ.get('GITHUB_REPOSITORY') != REPOSITORY or not re.fullmatch(r'[1-9][0-9]*', run_id):
        raise ValueError('WRONG_REPOSITORY_OR_RUN')
    if args.control == bool(args.bundle):
        raise ValueError('SELECT_ONE_PUBLISH_MODE')
    origin = git('remote', 'get-url', 'origin').decode().strip().removesuffix('.git')
    if origin != ORIGIN or git('status', '--porcelain', '--untracked-files=all'):
        raise ValueError('UNTRUSTED_ORIGIN_OR_DIRTY_CHECKOUT')
    git('config', 'user.name', 'pct-library-results[bot]')
    git('config', 'user.email', 'pct-library-results@users.noreply.github.com')
    if args.control:
        name = f'evidence/library_agent_controls/{run_id}/write_test.json'
        destination = Path(name)
        if destination.exists() or any(p.is_symlink() for p in (destination, *destination.parents)):
            raise ValueError('CONTROL_ALREADY_EXISTS_OR_SYMLINK')
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps({
            'schema': 'pct-library-write-control-v1', 'repository': REPOSITORY,
            'run_id': run_id, 'is_control': True, 'research_executed': False,
            'verified': False, 'created_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'note': 'Credential write control; excluded from evidence/runs and MariaDB research import.'
        }, indent=2) + '\n', encoding='utf-8')
        paths = [name]
    else:
        paths = copy_bundle(args.bundle, run_id)
    for path in paths:
        git('add', '--', path)
    validate_paths(git('diff', '--cached', '--name-only', '-z', '--no-renames'), run_id, args.control)
    git('commit', '-m', f'Preserve library {"write control" if args.control else "results"} {run_id}')
    token = os.environ.get('GH_TOKEN', '')
    if not token:
        raise ValueError('JOB_TOKEN_MISSING')
    push_env = os.environ.copy()
    push_env.pop('GH_TOKEN', None)
    push_env['GIT_CONFIG_COUNT'] = '1'
    push_env['GIT_CONFIG_KEY_0'] = 'http.https://github.com/.extraheader'
    push_env['GIT_CONFIG_VALUE_0'] = 'AUTHORIZATION: basic ' + base64.b64encode(('x-access-token:' + token).encode()).decode()
    for attempt in range(3):
        git('fetch', 'origin', 'main')
        git('rebase', 'origin/main')
        validate_paths(git('diff', '--name-only', '-z', '--no-renames', 'origin/main..HEAD'), run_id, args.control)
        try:
            git('push', 'origin', 'HEAD:main', env=push_env)
            print('LIBRARY_WRITE_PASS', run_id, len(paths), git('rev-parse', 'HEAD').decode().strip())
            return
        except RuntimeError:
            if attempt == 2:
                raise


if __name__ == '__main__':
    main()
