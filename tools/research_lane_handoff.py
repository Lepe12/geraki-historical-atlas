"""Checksum-bound transport of this run's lane evidence to one durable publisher.

Artifacts are transport only. The workflow commits recovered files through the
existing output publisher before consumers start; failed lanes remain visible.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile

LANES = frozenset(('greek', 'travellers', 'spanish_simancas', 'venetian', 'french',
                   'british', 'dutch', 'german', 'italian_states', 'ottoman', 'north_african'))
SCHEMA = 'research-lane-handoff-v1'


def identity(run_id, lane):
    if not re.fullmatch(r'[0-9]+', str(run_id)) or lane not in LANES:
        raise ValueError('INVALID_LANE_HANDOFF_IDENTITY')
    return PurePosixPath('evidence/runs') / str(run_id) / lane


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def pack(root, run_id, lane, output):
    root, output = Path(root), Path(output)
    prefix = identity(run_id, lane)
    source = root / prefix
    if source.is_symlink() or not source.is_dir():
        raise ValueError('LANE_EVIDENCE_MISSING')
    files = sorted(source.rglob('*'))
    if any(p.is_symlink() for p in files):
        raise ValueError('LANE_EVIDENCE_SYMLINK')
    files = [p for p in files if p.is_file()]
    if not files:
        raise ValueError('LANE_EVIDENCE_EMPTY')
    output.mkdir(parents=True, exist_ok=True)
    entries = [{'path': p.relative_to(root).as_posix(), 'bytes': p.stat().st_size,
                'sha256': digest(p)} for p in files]
    archive = output / 'evidence.tar.gz'
    with tarfile.open(archive, 'w:gz') as tar:
        for p, entry in zip(files, entries):
            tar.add(p, arcname=entry['path'], recursive=False)
    manifest = {'schema': SCHEMA, 'run_id': str(run_id), 'lane': lane,
                'archive_sha256': digest(archive), 'files': entries}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def validate(bundle, run_id, expected):
    manifest = json.loads((bundle / 'manifest.json').read_text())
    lane = manifest.get('lane')
    prefix = identity(run_id, lane)
    if (manifest.get('schema') != SCHEMA or manifest.get('run_id') != str(run_id)
            or lane not in expected):
        raise ValueError('LANE_HANDOFF_BINDING_MISMATCH')
    archive = bundle / 'evidence.tar.gz'
    if digest(archive) != manifest.get('archive_sha256'):
        raise ValueError('LANE_ARCHIVE_CHECKSUM_MISMATCH')
    entries = manifest.get('files', [])
    if not entries or len({e['path'] for e in entries}) != len(entries):
        raise ValueError('LANE_HANDOFF_DUPLICATE_OR_EMPTY')
    by_path = {e['path']: e for e in entries}
    with tarfile.open(archive, 'r:gz') as tar:
        members = tar.getmembers()
        if len(members) != len(by_path) or {m.name for m in members} != set(by_path):
            raise ValueError('LANE_HANDOFF_FILE_SET_MISMATCH')
        for member in members:
            path = PurePosixPath(member.name)
            if (not member.isfile() or '..' in path.parts or path.is_absolute()
                    or str(path) != member.name or not path.is_relative_to(prefix)):
                raise ValueError('LANE_HANDOFF_UNSAFE_MEMBER')
            entry = by_path[member.name]
            with tar.extractfile(member) as stream:
                actual = hashlib.file_digest(stream, 'sha256').hexdigest()
            if member.size != entry['bytes'] or actual != entry['sha256']:
                raise ValueError('LANE_EVIDENCE_CHECKSUM_MISMATCH')
    return manifest


def merge(root, run_id, expected, incoming):
    root, incoming = Path(root), Path(incoming)
    expected = json.loads(expected) if isinstance(expected, str) else expected
    if not isinstance(expected, list) or not expected or len(set(expected)) != len(expected):
        raise ValueError('INVALID_EXPECTED_LANES')
    for lane in expected:
        identity(run_id, lane)
    manifests = []
    # Validate every archive before writing any recovered evidence.
    bundles = sorted(p for p in incoming.iterdir() if p.is_dir()) if incoming.exists() else []
    for bundle in bundles:
        manifests.append((bundle, validate(bundle, run_id, expected)))
    lanes = [m['lane'] for _, m in manifests]
    if len(set(lanes)) != len(lanes):
        raise ValueError('DUPLICATE_LANE_HANDOFF')
    for bundle, manifest in manifests:
        with tarfile.open(bundle / 'evidence.tar.gz', 'r:gz') as tar:
            for entry in manifest['files']:
                destination = root / entry['path']
                # Refuse symlinked destination parents even for a valid archive.
                if any(p.is_symlink() for p in [destination, *destination.parents]):
                    raise ValueError('LANE_HANDOFF_DESTINATION_SYMLINK')
                destination.parent.mkdir(parents=True, exist_ok=True)
                if destination.exists() and digest(destination) != entry['sha256']:
                    raise ValueError('LANE_HANDOFF_EXISTING_CONFLICT')
                temporary = destination.with_name(destination.name + '.handoff-tmp')
                try:
                    with tar.extractfile(entry['path']) as source, temporary.open('xb') as out:
                        shutil.copyfileobj(source, out)
                    if digest(temporary) != entry['sha256']:
                        raise ValueError('LANE_HANDOFF_READBACK_MISMATCH')
                    os.replace(temporary, destination)
                finally:
                    temporary.unlink(missing_ok=True)
    report = {'schema': SCHEMA, 'run_id': str(run_id), 'expected_lanes': expected,
              'received_lanes': sorted(lanes), 'missing_lanes': sorted(set(expected) - set(lanes)),
              'files': sum(len(m['files']) for _, m in manifests),
              'manifests': [m for _, m in manifests],
              'status': 'READY_FOR_DURABLE_PUBLICATION', 'historical_verified': False}
    target = root / 'evidence/runs' / str(run_id) / 'LANE_HANDOFF.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    p = sub.add_parser('pack')
    p.add_argument('--run-id', required=True)
    p.add_argument('--lane', required=True)
    p.add_argument('--output', required=True)
    p = sub.add_parser('merge')
    p.add_argument('--run-id', required=True)
    p.add_argument('--expected', required=True)
    p.add_argument('--incoming', required=True)
    args = parser.parse_args()
    result = (pack(Path.cwd(), args.run_id, args.lane, args.output) if args.action == 'pack'
              else merge(Path.cwd(), args.run_id, args.expected, args.incoming))
    print(json.dumps({k: v for k, v in result.items() if k not in ('files', 'manifests')}, indent=2))


if __name__ == '__main__':
    main()
