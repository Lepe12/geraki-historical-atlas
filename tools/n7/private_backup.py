#!/usr/bin/env python3
"""Offline, private local snapshots of the N7 data directory. Never uploads to GitHub."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tempfile


def files(root):
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Backup root must be a real directory')
    out = {}
    for folder, dirs, names in os.walk(root, followlinks=False):
        for name in dirs + names:
            p = Path(folder) / name
            if p.is_symlink():
                raise ValueError('Symlinks are not allowed in private backups')
        for name in names:
            p = Path(folder) / name
            if not p.is_file():
                raise ValueError('Non-regular backup file')
            out[p.relative_to(root).as_posix()] = p
    return out


def digest(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def verify(snapshot):
    if snapshot.is_symlink() or not snapshot.is_dir():
        raise ValueError('Unsafe backup directory')
    manifest_path = snapshot / 'manifest.json'
    if manifest_path.is_symlink():
        raise ValueError('Unsafe backup manifest')
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('schema') != 'n7-private-backup/v1':
        raise ValueError('Invalid backup schema')
    payload = snapshot / 'data'
    actual = files(payload)
    if set(actual) != set(manifest['files']):
        raise ValueError('Backup file inventory mismatch')
    for name, entry in manifest['files'].items():
        rel = PurePosixPath(name)
        if rel.is_absolute() or '..' in rel.parts or name != rel.as_posix():
            raise ValueError('Unsafe backup path')
        if actual[name].stat().st_size != entry['size'] or digest(actual[name]) != entry['sha256']:
            raise ValueError('Backup digest mismatch')
    return manifest


def copy_private(source, target):
    target.mkdir(mode=0o700)
    for name, original in files(source).items():
        destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with original.open('rb') as src, destination.open('xb') as dst:
            os.chmod(destination, 0o600)
            shutil.copyfileobj(src, dst, 1024 * 1024)
            dst.flush()
            os.fsync(dst.fileno())


def create(source, destination, offline=False):
    if not offline:
        raise ValueError('Stop all data writers and explicitly pass --offline')
    source = Path(source)
    destination = Path(destination)
    if destination.exists() or destination.is_symlink():
        raise ValueError('Backup destination must not exist')
    if source.resolve() == destination.resolve() or source.resolve() in destination.resolve().parents:
        raise ValueError('Backup must be outside the source data directory')
    if (source / '.n7-conversations-write.lock').exists() or (source / '.n7-conversations-write.lock.recovery').exists():
        raise ValueError('Data writer lock present; verify writers are stopped')
    before = {n: {'size': p.stat().st_size, 'sha256': digest(p)} for n, p in files(source).items()}
    staging = Path(tempfile.mkdtemp(prefix='.n7-private-backup-', dir=destination.parent))
    try:
        copy_private(source, staging / 'data')
        manifest = {'schema': 'n7-private-backup/v1', 'files': before}
        file = staging / 'manifest.json'
        file.write_text(json.dumps(manifest, indent=2) + '\n')
        file.chmod(0o600)
        verify(staging)
        after = {n: {'size': p.stat().st_size, 'sha256': digest(p)} for n, p in files(source).items()}
        if after != before:
            raise ValueError('Source changed during backup')
        os.rename(staging, destination)
        return manifest
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def restore(snapshot, destination, offline=False):
    if not offline:
        raise ValueError('Restore requires an offline service and --offline')
    snapshot, destination = Path(snapshot), Path(destination)
    if destination.exists() or destination.is_symlink():
        raise ValueError('Restore only to a new directory; never overwrite existing user data')
    manifest = verify(snapshot)
    staging = Path(tempfile.mkdtemp(prefix='.n7-private-restore-', dir=destination.parent))
    try:
        copy_private(snapshot / 'data', staging / 'data')
        if set(files(staging / 'data')) != set(manifest['files']):
            raise ValueError('Restored inventory mismatch')
        for name, entry in manifest['files'].items():
            if digest(staging / 'data' / name) != entry['sha256']:
                raise ValueError('Restored file digest mismatch')
        os.rename(staging / 'data', destination)
        return manifest
    finally:
        shutil.rmtree(staging)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['create', 'verify', 'restore'])
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', nargs='?', type=Path)
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    if args.operation == 'verify':
        result = verify(args.source)
    else:
        if args.destination is None:
            parser.error('destination is required')
        result = (create if args.operation == 'create' else restore)(args.source, args.destination, args.offline)
    print('N7_PRIVATE_BACKUP_VERIFIED files=' + str(len(result['files'])))
