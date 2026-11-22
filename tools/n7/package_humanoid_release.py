#!/usr/bin/env python3
"""Package a built Humanoid static export as the SHA-256 locked Plesk release.

Writes runtime/humanoid-plesk-release.zip and .json in the format that
tools/n7/deploy_humanoid_plesk.py installs. The entry documents record the
digests of the release currently installed (taken from the existing lock), so
the installer refuses to run if the server has drifted. Versioned _next files
are always new names; the live Niki worker, voice state and images are kept
as preserved files and never shipped.
"""
import argparse
import hashlib
import io
import json
import pathlib
import secrets
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
LOCK = ROOT / 'runtime' / 'humanoid-plesk-release.json'
BUNDLE = LOCK.with_suffix('.zip')
APEX = 'public/n7-apex/'
ENTRY = (APEX + 'index.txt', APEX + 'index.html', APEX + '.n7-apex-release.json')
UPSTREAM = 'a8732fad1078a809cadfa810cb0d89cf4445dbed'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out-dir', required=True, help='the Next static export (out/)')
    parser.add_argument('--source-commit', required=True)
    args = parser.parse_args(argv)
    out = pathlib.Path(args.out_dir).resolve()
    old = json.loads(LOCK.read_text())
    files = {}
    for path in sorted((out / '_next' / 'static').rglob('*')):
        if path.is_file() and path.suffix in ('.js', '.css'):
            files[APEX + path.relative_to(out).as_posix()] = path.read_bytes()
    for name in ('index.html', 'index.txt'):
        files[APEX + name] = (out / name).read_bytes()
    marker = {'atlas_commit': args.source_commit, 'deployment': 'guarded-humanoid-plesk',
              'product': 'N7-APEX-PREVIEW', 'release': secrets.token_hex(8), 'upstream': UPSTREAM}
    files[APEX + '.n7-apex-release.json'] = json.dumps(marker, sort_keys=True).encode()
    # What is installed now is the previous release's files.
    previous = {name: (old['files'][name] if name in ENTRY else None) for name in files}
    preserve = {name: digest for name, digest in old['preserve'].items() if name not in files}
    if len(files) > 80 or len(preserve) > 80:
        raise SystemExit('release too large for the installer')
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(files):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, files[name])
    raw = buffer.getvalue()
    BUNDLE.write_bytes(raw)
    lock = {'archive_sha256': sha(raw), 'files': {n: sha(d) for n, d in sorted(files.items())},
            'preserve': dict(sorted(preserve.items())), 'previous': dict(sorted(previous.items())),
            'schema': 'n7-plesk-humanoid-assets-v1'}
    LOCK.write_text(json.dumps(lock, indent=2, sort_keys=True) + '\n')
    print('N7_HUMANOID_RELEASE_PACKAGED release={} files={} preserve={}'.format(
        marker['release'], len(files), len(preserve)))


if __name__ == '__main__':
    main()
