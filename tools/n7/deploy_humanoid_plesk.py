#!/usr/bin/env python3
"""Install a SHA-256 locked Humanoid static release from Plesk Scheduled Tasks."""
import argparse
import io
import json
import re
import secrets
import urllib.error
import zipfile

from deploy_reconciled_runtime import (APEX_ENTRY, APEX_NIKI, APEX_ROOT, HERE, LIMIT,
                                       PLESK_ROOT, PleskFiles, install, plan_apex,
                                       request, sha, verify_apex)

BUNDLE_PATH = HERE.parents[1] / 'runtime' / 'humanoid-plesk-release.zip'
EXTRAS = {APEX_ROOT + name for name in (
    'n7-ambient-v1.webp', 'n7-ambient-portrait-v1.webp', 'n7-mira-hud-license.txt')}
STATIC = re.compile(r'public/n7-apex/_next/static/(?:[\w-][\w.-]*/)*[\w-][\w.-]*\.(?:js|css)', re.ASCII)
DIGEST = re.compile(r'[a-f0-9]{64}', re.ASCII)
UPSTREAM = 'a8732fad1078a809cadfa810cb0d89cf4445dbed'


def load_release():
    raw = BUNDLE_PATH.read_bytes()
    lock = json.loads(BUNDLE_PATH.with_suffix('.json').read_text())
    if lock.get('schema') != 'n7-plesk-humanoid-assets-v1' or sha(raw) != lock.get('archive_sha256'):
        raise RuntimeError('N7_HUMANOID_BUNDLE_HASH_MISMATCH')
    hashes, previous, preserve = (lock[key] for key in ('files', 'previous', 'preserve'))
    if (not all(isinstance(table, dict) for table in (hashes, previous, preserve))
            or set(hashes) != set(previous) or not set(APEX_ENTRY) <= set(hashes)
            or not set(APEX_NIKI) <= set(preserve) or set(hashes) & set(preserve)
            or len(hashes) > 80 or len(preserve) > 80):
        raise RuntimeError('N7_HUMANOID_BUNDLE_SCOPE_INVALID')
    for name, digest in hashes.items():
        if name not in APEX_ENTRY and name not in EXTRAS and not STATIC.fullmatch(name):
            raise RuntimeError('N7_HUMANOID_BUNDLE_SCOPE_INVALID')
        old = previous[name]
        if (name in APEX_ENTRY and old is None or name not in APEX_ENTRY and old is not None
                or old is not None and not DIGEST.fullmatch(old) or not DIGEST.fullmatch(digest)):
            raise RuntimeError('N7_HUMANOID_BUNDLE_HASH_INVALID')
    for name, digest in preserve.items():
        if (not name.startswith(APEX_ROOT) or any(part in ('', '.', '..') for part in name.split('/'))
                or not DIGEST.fullmatch(digest)):
            raise RuntimeError('N7_HUMANOID_PRESERVE_SCOPE_INVALID')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if len(archive.namelist()) != len(hashes) or set(archive.namelist()) != set(hashes):
            raise RuntimeError('N7_HUMANOID_BUNDLE_SCOPE_INVALID')
        payload = {}
        for name, digest in hashes.items():
            if archive.getinfo(name).file_size > LIMIT:
                raise RuntimeError('N7_HUMANOID_FILE_TOO_LARGE')
            data = archive.read(name)
            if sha(data) != digest:
                raise RuntimeError('N7_HUMANOID_FILE_HASH_MISMATCH ' + name)
            payload[name] = data
    marker = json.loads(payload[APEX_ENTRY[-1]])
    if marker.get('product') != 'N7-APEX-PREVIEW' or marker.get('upstream') != UPSTREAM:
        raise RuntimeError('N7_HUMANOID_MARKER_INVALID')
    return payload, previous, preserve, marker


def verify_service():
    with request('/health?n7release=' + secrets.token_hex(8)) as response:
        health = json.loads(response.read(20000))
        if health.get('status') != 'ok' or health.get('modelConfigured') is not True:
            raise RuntimeError('N7_HUMANOID_APP_HEALTH_FAILED')
    for route in ('/api/conversations', '/api/tasks'):
        try:
            with request(route):
                pass
        except urllib.error.HTTPError as error:
            if error.code == 401:
                continue
            raise
        raise RuntimeError('N7_HUMANOID_PRIVATE_ROUTE_UNPROTECTED')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--dry-run', action='store_true')
    args = parser.parse_args(argv)
    bundle, previous, preserve, marker = load_release()
    files = PleskFiles(PLESK_ROOT, scope=None, apex_paths=previous)
    payload, originals = plan_apex(files, bundle, previous, preserve)
    # N7_AUTO_INSTALL_V1: Plesk Git runs this after every deployment of main.
    # When the release is already live there is nothing to write.
    if all(originals[name] == payload[name] for name in payload):
        print('N7_HUMANOID_ALREADY_INSTALLED release={}'.format(marker['release']))
        return
    verify_service()
    print('N7_HUMANOID_PREFLIGHT_OK dry_run={} release={} source={}'.format(
        not args.apply, marker['release'], marker['atlas_commit']))
    if not args.apply:
        return

    def verify():
        verify_apex(files, payload, preserve)
        verify_service()

    install(files, payload, originals, verify, preserve, restart_app=False)
    print('N7_HUMANOID_INSTALL_SUCCESS release={}'.format(marker['release']))


if __name__ == '__main__':
    main()
