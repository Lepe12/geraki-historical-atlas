"""Content-addressed storage for derived analysis inputs of one research run.

Each semantic reanalysis pass used to commit a full copy of the derived source
texts (``semantic_reanalysis_<id>/derived_sources/``, ~95 MB per pass) although
the bytes rarely change. After a pass finishes, ``compact`` moves every derived
file into ``<run>/sources/by-sha256/<sha256><suffix>`` (written once, verified
when it already exists) and leaves a small manifest beside the pass:

    semantic_reanalysis_<id>/derived_sources.manifest.json

Readers resolve a logical path such as
``semantic_reanalysis_<id>/derived_sources/greek/library_acquisition/a.txt``
with ``resolve``/``read_bytes``: an existing file is used as is (older passes
keep their full copies and remain readable unchanged), otherwise the manifest
entry and its SHA-256 locate the stored bytes, which are re-hashed on every
read. Nothing already published is moved, rewritten or deleted.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile

SCHEMA = 'nabou-derived-source-manifest-v1'
STORE = PurePosixPath('sources/by-sha256')
MANIFEST = 'derived_sources.manifest.json'
DERIVED = 'derived_sources'
PASS = re.compile(r'semantic_reanalysis_[0-9A-Za-z_-]+')
LOGICAL = re.compile(r'^(semantic_reanalysis_[0-9A-Za-z_-]+)/derived_sources/(.+)$')
SUFFIX = re.compile(r'^\.[A-Za-z0-9]{1,8}$')


def sha256_file(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def store_name(sha, name):
    if not re.fullmatch(r'[a-f0-9]{64}', str(sha)):
        raise ValueError('INVALID_SHA256')
    suffix = PurePosixPath(str(name)).suffix.lower()
    return sha + (suffix if SUFFIX.fullmatch(suffix) else '')


def store_path(run_root, sha, name):
    """Run-relative store path; the original suffix is kept for importers."""
    return str(STORE / store_name(sha, name))


def _safe(root, relative):
    root = Path(root).resolve()
    parts = PurePosixPath(str(relative)).parts
    if not parts or PurePosixPath(str(relative)).is_absolute() or '..' in parts:
        raise ValueError('UNSAFE_DERIVED_SOURCE_PATH')
    path = (root / str(relative)).resolve()
    if not path.is_relative_to(root):
        raise ValueError('UNSAFE_DERIVED_SOURCE_PATH')
    return path


def _atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=path.parent, prefix='.tmp-')
    try:
        with os.fdopen(handle, 'wb') as stream:
            stream.write(data)
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def put(run_root, source):
    """Store bytes once. An existing object must already have the same hash."""
    run_root = Path(run_root)
    source = Path(source)
    if source.is_symlink() or not source.is_file():
        raise ValueError('REGULAR_DERIVED_FILES_ONLY')
    data = source.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    relative = store_path(run_root, sha, source.name)
    target = _safe(run_root, relative)
    if target.exists():
        if sha256_file(target) != sha:
            raise ValueError('STORED_OBJECT_CHECKSUM_MISMATCH:' + relative)
        written = False
    else:
        _atomic_write(target, data)
        written = True
    return sha, relative, len(data), written


def compact(run_root, pass_dir):
    """Replace a pass's derived_sources copy by store objects plus a manifest.

    Only the current, unpublished pass is compacted. Every object is verified
    after storing and before its working copy is removed.
    """
    run_root = Path(run_root).resolve()
    pass_dir = Path(pass_dir).resolve()
    if not pass_dir.is_relative_to(run_root) or pass_dir.parent != run_root or not PASS.fullmatch(pass_dir.name):
        raise ValueError('PASS_MUST_BE_A_DIRECT_SEMANTIC_REANALYSIS_CHILD')
    derived = pass_dir / DERIVED
    manifest_path = pass_dir / MANIFEST
    if not derived.is_dir():
        return {'status': 'NOTHING_TO_COMPACT', 'manifest': manifest_path.is_file()}
    if manifest_path.exists():
        raise ValueError('MANIFEST_ALREADY_EXISTS')
    entries = []
    stored = reused = total = new_bytes = 0
    for path in sorted(p for p in derived.rglob('*') if not p.is_dir()):
        if path.is_symlink() or not path.is_file():
            raise ValueError('REGULAR_DERIVED_FILES_ONLY')
        sha, relative, size, written = put(run_root, path)
        stored += written
        reused += not written
        total += size
        new_bytes += size if written else 0
        entries.append({'path': path.relative_to(derived).as_posix(), 'sha256': sha, 'bytes': size, 'object': relative})
    manifest = {'schema': SCHEMA, 'pass': pass_dir.name, 'logical_root': pass_dir.name + '/' + DERIVED,
                'store': str(STORE), 'files': entries,
                'method': 'CONTENT_ADDRESSED_COPY_OF_DERIVED_INPUTS_BYTES_UNCHANGED',
                'original_lane_outputs_modified': False}
    _atomic_write(manifest_path, (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode())
    # Fail closed: every logical path must read back to identical bytes first.
    for entry in entries:
        if hashlib.sha256(read_bytes(run_root, pass_dir.name + '/' + DERIVED + '/' + entry['path'], use_copy=False)).hexdigest() != entry['sha256']:
            raise ValueError('COMPACTION_READBACK_MISMATCH:' + entry['path'])
    shutil.rmtree(derived)
    verify_bundle(run_root, pass_dir)
    return {'status': 'COMPACTED', 'files': len(entries), 'logical_bytes': total,
            'new_objects': stored, 'reused_objects': reused,
            'new_object_bytes': new_bytes, 'manifest': str(manifest_path.relative_to(run_root))}


def load_manifest(run_root, pass_name):
    if not PASS.fullmatch(str(pass_name)):
        raise ValueError('INVALID_PASS_NAME')
    path = _safe(run_root, str(pass_name) + '/' + MANIFEST)
    if not path.is_file():
        return None
    manifest = json.loads(path.read_text(encoding='utf-8'))
    if manifest.get('schema') != SCHEMA or manifest.get('pass') != pass_name:
        raise ValueError('INVALID_DERIVED_SOURCE_MANIFEST')
    return {entry['path']: entry for entry in manifest.get('files', [])}


def resolve(run_root, relative, use_copy=True):
    """Return the real file for a run-relative logical path, or raise."""
    run_root = Path(run_root).resolve()
    direct = _safe(run_root, relative)
    if use_copy and direct.is_file():
        return direct
    match = LOGICAL.match(PurePosixPath(str(relative)).as_posix())
    if not match:
        raise FileNotFoundError(str(relative))
    files = load_manifest(run_root, match.group(1))
    entry = (files or {}).get(match.group(2))
    if not entry:
        raise FileNotFoundError(str(relative))
    target = _safe(run_root, entry['object'])
    if PurePosixPath(entry['object']).parent != STORE or not target.is_file():
        raise FileNotFoundError(str(relative))
    return target


def read_bytes(run_root, relative, use_copy=True):
    """Read a logical path; stored objects are re-hashed against the manifest."""
    path = resolve(run_root, relative, use_copy)
    data = path.read_bytes()
    match = LOGICAL.match(PurePosixPath(str(relative)).as_posix())
    if match and path.parent.name == STORE.name:
        entry = load_manifest(run_root, match.group(1))[match.group(2)]
        if hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError('STORED_OBJECT_CHECKSUM_MISMATCH:' + entry['object'])
    return data


def durable_text_path(relative, sha):
    """Run-relative path of bytes that persist after the pass is compacted."""
    if LOGICAL.match(str(relative or '')) and re.fullmatch(r'[a-f0-9]{64}', str(sha or '')):
        return store_path(None, sha, relative)
    return relative


def verify_bundle(run_root, pass_dir):
    """Every durable text in this pass's evidence bundle must exist by hash."""
    bundle = Path(pass_dir) / 'research_answer/historical_evidence_bundle.json'
    if not bundle.is_file():
        return 0
    checked = 0
    for source in json.loads(bundle.read_text(encoding='utf-8')).get('sources', []):
        path = source.get('text_path')
        if not path or not str(path).startswith(str(STORE) + '/'):
            continue
        if sha256_file(_safe(run_root, path)) != source.get('text_sha256'):
            raise ValueError('BUNDLE_TEXT_NOT_IN_STORE:' + str(path))
        checked += 1
    return checked


def materialize(run_root, pass_name, target):
    """Rebuild a pass's full derived_sources tree (for inspection/replay)."""
    run_root = Path(run_root).resolve()
    target = Path(target)
    old = run_root / pass_name / DERIVED
    if old.is_dir():
        shutil.copytree(old, target)
        return target
    files = load_manifest(run_root, pass_name)
    if files is None:
        raise FileNotFoundError(pass_name + '/' + MANIFEST)
    target.mkdir(parents=True, exist_ok=False)
    for relative in files:
        destination = _safe(target, relative)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(read_bytes(run_root, pass_name + '/' + DERIVED + '/' + relative))
    return target


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['compact', 'materialize'])
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--pass', dest='pass_name', required=True)
    parser.add_argument('--target')
    args = parser.parse_args()
    if not re.fullmatch(r'\d+', args.run_id):
        raise ValueError('NUMERIC_RUN_ID_REQUIRED')
    root = Path('evidence/runs') / args.run_id
    if args.mode == 'compact':
        if not (root / args.pass_name).is_dir():
            print(json.dumps({'status': 'PASS_NOT_PRESENT'}))
            return
        print(json.dumps(compact(root, root / args.pass_name)))
    else:
        if not args.target:
            raise ValueError('TARGET_REQUIRED')
        print(materialize(root, args.pass_name, args.target))


if __name__ == '__main__':
    main()
