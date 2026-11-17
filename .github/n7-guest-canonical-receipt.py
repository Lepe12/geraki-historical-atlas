#!/usr/bin/env python3
"""One-shot, no-code-write reconciliation of N7's already-live APEX guest chat.

All 70 live runtime files MUST exactly match the new private canonical build
before replacing only release-manifest.json. No owner data, code, model settings,
frontend, avatar, or plugin files are uploaded. Abort on any mismatch.
"""
import ftplib
import hashlib
import io
import json
import os
import re
import secrets
import socket
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path, PurePosixPath

ROOT = '/bot.piratecartography.com/n7-app'
BASE = 'https://bot.piratecartography.com'
TLS = 'linux3087.grserver.gr'
NEW_COMMIT = 'd0aec81bb6dcf7b78764677072fbdee519dd980b'
OLD_COMMIT = '8ca4bf381af3690b85b0aec11f0ab514b12796be'
OLD_RELEASE = '7e7b5ef7eb337935c2cf55754bd17a36561b0aeeaa85eba5a46b2471bb5de4d1'
KNOWN_LIVE_PATCH = '0348eba93a0c35338f86d19d50bf25ec3435672ad5fb3a7b7d32c16287d60a6e'
KNOWN_GUEST_MODULE = 'e01f9b6f3834b3a0602db1fcfd7df5c71645594ce019a61a86fa973ac799a3b1'
MANIFEST = 'release-manifest.json'
LIMIT = 8 * 1024 * 1024


def sha(value):
    return hashlib.sha256(value).hexdigest()


def release_id(files):
    return sha(json.dumps(files, sort_keys=True, separators=(',', ':')).encode())


def contract():
    data = json.loads(Path('.github/n7-guest-canonical-70-contract.json').read_text('utf-8'))
    if (data.get('schema') != 'n7-reconciled-deploy/v1'
            or data.get('target') != ROOT
            or len(data.get('files', {})) != 70
            or len(data.get('previous_files', {})) != 69
            or data['files'].get('server.js') != KNOWN_LIVE_PATCH
            or data['files'].get('n7-apex-public-chat.cjs') != KNOWN_GUEST_MODULE
            or data['release_id'] != release_id(data['files'])
            or release_id(data['previous_files']) != OLD_RELEASE):
        raise RuntimeError('N7_CANONICAL_RELEASE_CONTRACT_INVALID')
    for key, value in data['files'].items():
        p = PurePosixPath(key)
        if (p.is_absolute() or any(x in ('.', '..') or x.startswith('.') for x in p.parts)
                or p.parts[0] in ('data', 'tmp', 'node_modules')
                or not re.fullmatch(r'[a-f0-9]{64}', value)):
            raise RuntimeError('N7_CANONICAL_FILE_PATH_OR_HASH_INVALID')
    if {k for k, expected in data['files'].items()
        if data['previous_files'].get(k) != expected} != {'server.js', 'n7-apex-public-chat.cjs'}:
        raise RuntimeError('N7_UNREVIEWED_RELEASE_SCOPE')
    return data


def read(ftp, name):
    blocks = []
    size = 0

    def add(chunk):
        nonlocal size
        size += len(chunk)
        if size > LIMIT:
            raise RuntimeError('N7_RUNTIME_FILE_OVER_LIMIT')
        blocks.append(chunk)
    ftp.retrbinary('RETR ' + ROOT + '/' + name, add)
    return b''.join(blocks)


def connect():
    host, port = os.environ['PCT_FTPS_HOST'], int(os.getenv('PCT_FTPS_PORT', '21'))
    ips = lambda name: {record[4][0] for record in socket.getaddrinfo(name, port, type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):
        raise RuntimeError('N7_FTPS_HOST_IDENTITY_MISMATCH')
    ftp = ftplib.FTP_TLS(timeout=40, context=ssl.create_default_context())
    ftp.connect(host, port)
    ftp.host = TLS
    ftp.login(os.environ['PCT_FTPS_USER'], os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    ftp.cwd(ROOT)
    if ftp.pwd().rstrip('/') != ROOT:
        raise RuntimeError('N7_FTPS_ROOT_MISMATCH')
    return ftp


def check_files(ftp, data):
    for name, expected in data['files'].items():
        if sha(read(ftp, name)) != expected:
            raise RuntimeError('N7_CANONICAL_LIVE_FILE_DRIFT ' + name)
    print('N7_GUEST_CANONICAL_FILES_MATCH_LIVE=true files=70', flush=True)


def next_receipt(previous, data):
    next_version = dict(previous)
    next_version.update(release_id=data['release_id'], canonical_commit=NEW_COMMIT,
                        files=data['files'], source_lock_verified=True,
                        deployment='verified-canonical-apex-guest-70-files')
    return (json.dumps(next_version, indent=2) + '\n').encode()


def check_receipt(raw, data):
    previous = json.loads(raw)
    if (previous.get('schema') != 'n7-runtime-build/v1'
            or previous.get('release_id') != OLD_RELEASE
            or previous.get('canonical_commit') != OLD_COMMIT
            or previous.get('files') != data['previous_files']):
        raise RuntimeError('N7_PREVIOUS_LIVE_RECEIPT_DRIFT')
    return previous


def request(path):
    headers = {'Cache-Control': 'no-store', 'Pragma': 'no-cache',
               'User-Agent': 'N7-canonical-guest-receipt-verify/1'}
    return urllib.request.urlopen(urllib.request.Request(BASE + path, headers=headers),
                                  context=ssl.create_default_context(), timeout=17)


def health(release, commit, timeout=105):
    end = time.monotonic() + timeout
    while True:
        try:
            with request('/health?n7guestcanon=' + secrets.token_hex(7)) as response:
                status = json.load(response)
            if (status.get('status') == 'ok'
                    and status.get('modelConfigured') is True
                    and status.get('release') == {'id': release, 'canonical_commit': commit}):
                return
        except (OSError, ValueError):
            pass
        if time.monotonic() >= end:
            raise RuntimeError('N7_ACTIVE_RELEASE_NOT_VERIFIED')
        time.sleep(2)


def public_and_private_routes():
    with request('/api/n7-apex/status') as response:
        guest = json.load(response)
    if guest != {'passwordRequired': False, 'available': True, 'privateHistory': False}:
        raise RuntimeError('N7_APEX_GUEST_CHAT_UNAVAILABLE_OR_UNSAFE')
    for route in ('/api/conversations', '/api/tasks'):
        try:
            with request(route) as response:
                response.read(256)
        except urllib.error.HTTPError as err:
            if err.code == 401:
                continue
            raise
        raise RuntimeError('N7_PRIVATE_ENDPOINT_EXPOSED ' + route)


def restart(ftp):
    ftp.storbinary('STOR ' + ROOT + '/tmp/restart.txt', io.BytesIO(b'n7-canonical-guest-70-file-receipt\n'))


def install(ftp, data, before):
    payload = next_receipt(check_receipt(before, data), data)
    lock = ROOT + '/.n7-guest-canonical-receipt-lock'
    ftp.mkd(lock)
    token = secrets.token_hex(10)
    staged = ROOT + '/.n7-guest-canonical-receipt-stage-' + token
    backup = ROOT + '/.n7-guest-canonical-receipt-backup-' + token
    backed_up = False
    active = False
    try:
        ftp.storbinary('STOR ' + staged, io.BytesIO(payload))
        if read(ftp, staged[len(ROOT)+1:]) != payload:
            raise RuntimeError('N7_RECEIPT_STAGE_MISMATCH')
        check_files(ftp, data)
        if read(ftp, MANIFEST) != before:
            raise RuntimeError('N7_CONCURRENT_RECEIPT_CHANGE')
        ftp.rename(ROOT + '/' + MANIFEST, backup)
        backed_up = True
        if read(ftp, backup[len(ROOT)+1:]) != before:
            raise RuntimeError('N7_RECEIPT_BACKUP_MISMATCH')
        ftp.rename(staged, ROOT + '/' + MANIFEST)
        active = True
        if read(ftp, MANIFEST) != payload:
            raise RuntimeError('N7_RECEIPT_READBACK_MISMATCH')
        restart(ftp)
        health(data['release_id'], NEW_COMMIT)
        public_and_private_routes()
        check_files(ftp, data)
        if read(ftp, MANIFEST) != payload:
            raise RuntimeError('N7_RECEIPT_FINAL_READBACK_MISMATCH')
    except BaseException:
        failures = []
        if backed_up:
            try:
                if active:
                    if read(ftp, MANIFEST) != payload:
                        raise RuntimeError('N7_RECEIPT_CONCURRENT_MUTATION')
                    ftp.delete(ROOT + '/' + MANIFEST)
                ftp.rename(backup, ROOT + '/' + MANIFEST)
                if read(ftp, MANIFEST) != before:
                    raise RuntimeError('N7_RECEIPT_ROLLBACK_READBACK_MISMATCH')
                restart(ftp)
            except Exception:
                failures.append(MANIFEST)
        print('N7_GUEST_CANONICAL_ROLLBACK_VERIFIED=' + str(not failures).lower(), flush=True)
        if failures:
            print('N7_MANUAL_RECOVERY_REQUIRED=' + ','.join(failures), flush=True)
        raise
    finally:
        try:
            ftp.delete(staged)
        except ftplib.all_errors:
            pass
        try:
            ftp.rmd(lock)
        except ftplib.all_errors:
            pass
    print('N7_GUEST_CANONICAL_RELEASE_LIVE_VERIFIED=true manifest_only=true '
          'files=70 backend_code_unchanged=true data_paths_written=0 backup_retained=true', flush=True)


def main():
    data = contract()
    ftp = connect()
    try:
        check_files(ftp, data)
        before = read(ftp, MANIFEST)
        manifest = json.loads(before)
        if manifest.get('release_id') == data['release_id'] and manifest.get('canonical_commit') == NEW_COMMIT:
            if manifest.get('files') != data['files']:
                raise RuntimeError('N7_NEW_RECEIPT_FILES_DRIFT')
            health(data['release_id'], NEW_COMMIT, timeout=30)
            public_and_private_routes()
            print('N7_GUEST_CANONICAL_ALREADY_ALIGNED=true no_writes=true')
            return
        check_receipt(before, data)
        health(OLD_RELEASE, OLD_COMMIT, timeout=30)
        public_and_private_routes()
        print('N7_GUEST_CANONICAL_READONLY_PREFLIGHT_OK files=70 old_receipt=69', flush=True)
        if os.environ.get('N7_DRY_RUN', '1') != '0':
            print('N7_GUEST_CANONICAL_DRY_RUN_PASS=true no_writes=true', flush=True)
            return
        install(ftp, data, before)
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            ftp.close()


if __name__ == '__main__':
    main()
