#!/usr/bin/env python3
"""One-shot, fail-closed N7 owner-approved conversation-memory deployment.

Only owner-chat-memory.js and release-manifest.json are replaced. No data,
history, environment secrets, front-end assets or other runtime files are written.
"""
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import socket
import ssl
import time
import urllib.error
import urllib.request

ROOT = '/bot.piratecartography.com/n7-app'
TLS = 'linux3087.grserver.gr'
BASE = 'https://bot.piratecartography.com'
OLD_HELPER = '3f726de2fd52d33ac43c6e93ef9b329c1bfef6dc49db05ca8ca5d77dc6b75d38'
OLD_RELEASE = '0ef699c6e54f39439b1dd185b353da81cd6c012b698d795912b890d91667850f'
OLD_COMMIT = 'd41cac919395a3ef340cd963b8ad545099dde3d2'
NEW_COMMIT = '8ca4bf381af3690b85b0aec11f0ab514b12796be'
HELPER = 'owner-chat-memory.js'
MANIFEST = 'release-manifest.json'
MAX_FILE = 8 * 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(ftp, name):
    chunks = []
    size = 0
    def append(chunk):
        nonlocal size
        size += len(chunk)
        if size > MAX_FILE:
            raise RuntimeError('N7_RUNTIME_FILE_TOO_LARGE')
        chunks.append(chunk)
    ftp.retrbinary('RETR ' + ROOT + '/' + name, append)
    return b''.join(chunks)


def connect():
    host = os.environ['PCT_FTPS_HOST']
    port = int(os.getenv('PCT_FTPS_PORT', '21'))
    ips = lambda name: {x[4][0] for x in socket.getaddrinfo(name, port, type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):
        raise RuntimeError('N7_FTPS_IDENTITY_MISMATCH')
    ftp = ftplib.FTP_TLS(timeout=40, context=ssl.create_default_context())
    ftp.connect(host, port)
    ftp.host = TLS
    ftp.login(os.environ['PCT_FTPS_USER'], os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    ftp.cwd(ROOT)
    if ftp.pwd().rstrip('/') != ROOT:
        raise RuntimeError('N7_UNEXPECTED_REMOTE_ROOT')
    return ftp


def contract():
    data = json.loads(Path('.github/n7-personality-v2-contract.json').read_text('utf-8'))
    if data.get('schema') != 'n7-reconciled-deploy/v1' or data.get('target') != ROOT:
        raise RuntimeError('N7_UNEXPECTED_RELEASE_CONTRACT')
    digest = sha(json.dumps(data['files'], sort_keys=True, separators=(',', ':')).encode())
    if digest != data['release_id'] or len(data['files']) != 69:
        raise RuntimeError('N7_INVALID_RELEASE_HASH')
    helper = Path('tools/n7/owner-chat-memory.js').read_bytes()
    if sha(helper) != data['files'][HELPER]:
        raise RuntimeError('N7_PERSONA_SOURCE_NOT_CANONICAL')
    if b'DISTINCT VOICE & JUDGEMENT V2' not in helper:
        raise RuntimeError('N7_PERSONA_MARKER_MISSING')
    return data, helper


def preflight(ftp, release):
    current = {}
    for name, expected in release['files'].items():
        current[name] = sha(read(ftp, name))
        if current[name] != expected and not (name == HELPER and current[name] == OLD_HELPER):
            raise RuntimeError('N7_LIVE_RELEASE_DRIFT ' + name)
    receipt_raw = read(ftp, MANIFEST)
    receipt = json.loads(receipt_raw)
    if receipt.get('schema') != 'n7-runtime-build/v1':
        raise RuntimeError('N7_INVALID_EXISTING_RECEIPT')
    already = current[HELPER] == release['files'][HELPER]
    previous = dict(release['files'], **{HELPER: OLD_HELPER})
    if already:
        if receipt.get('release_id') != release['release_id'] or receipt.get('canonical_commit') != NEW_COMMIT:
            raise RuntimeError('N7_MODULE_UPDATED_BUT_RECEIPT_MISMATCH')
        if receipt.get('files') != release['files']:
            raise RuntimeError('N7_RECEIPT_HASHES_MISMATCH')
    else:
        if receipt.get('release_id') != OLD_RELEASE or receipt.get('canonical_commit') != OLD_COMMIT:
            raise RuntimeError('N7_PREVIOUS_RELEASE_ID_MISMATCH')
        if receipt.get('files') != previous:
            raise RuntimeError('N7_PREVIOUS_RECEIPT_FILES_MISMATCH')
    print('N7_PERSONA_PREFLIGHT_OK unchanged_files=68 old_helper=' + str(not already).lower())
    return receipt_raw, receipt, already


def validate_postdeploy(release):
    deadline = time.monotonic() + 115
    while True:
        try:
            url = BASE + '/health?n7persona=' + secrets.token_hex(7)
            req = urllib.request.Request(url, headers={'Cache-Control':'no-store',
                'Pragma':'no-cache','User-Agent':'N7-PR84-guarded-live-verify/1'})
            with urllib.request.urlopen(req, timeout=15, context=ssl.create_default_context()) as response:
                health = json.loads(response.read(20000))
            expected = {'id':release['release_id'],'canonical_commit':NEW_COMMIT}
            if (health.get('status') == 'ok' and health.get('modelConfigured') is True
                    and health.get('release') == expected):
                break
        except (OSError, ValueError):
            pass
        if time.monotonic() > deadline:
            raise RuntimeError('N7_PERSONA_ACTIVE_RELEASE_NOT_VERIFIED')
        time.sleep(3)
    try:
        with urllib.request.urlopen(BASE + '/api/conversations', timeout=15,
                                    context=ssl.create_default_context()) as response:
            response.read()
        raise RuntimeError('N7_PRIVATE_CONVERSATIONS_PUBLICLY_ACCESSIBLE')
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise
    print('N7_PERSONA_LIVE_HTTP_VERIFIED=true health=true model=true auth=401')


def restart(ftp, suffix):
    ftp.storbinary('STOR ' + ROOT + '/tmp/restart.txt',
                   io.BytesIO(('n7-owner-persona-' + suffix + '\n').encode()))


def activate(ftp, release, helper, old_receipt_raw, old_receipt):
    new_receipt = dict(old_receipt)
    new_receipt.update(release_id=release['release_id'], canonical_commit=NEW_COMMIT,
                       files=release['files'], source_lock_verified=True,
                       deployment='verified-owner-approved-persona-only')
    new_receipt_raw = (json.dumps(new_receipt, indent=2) + '\n').encode()
    changes = {HELPER:helper, MANIFEST:new_receipt_raw}
    originals = {HELPER:read(ftp, HELPER), MANIFEST:old_receipt_raw}
    lock = ROOT + '/.n7-persona-activation-lock'
    ftp.mkd(lock)
    tag = secrets.token_hex(10)
    staged = {}
    backups = {}
    installed = []
    try:
        for name, data in changes.items():
            stage = '.n7-persona-stage-' + tag + '-' + name
            staged[name] = stage
            ftp.storbinary('STOR ' + ROOT + '/' + stage, io.BytesIO(data))
            if read(ftp, stage) != data:
                raise RuntimeError('N7_PERSONA_STAGE_MISMATCH ' + name)
        for name in release['files']:
            actual = sha(read(ftp, name))
            expected = OLD_HELPER if name == HELPER else release['files'][name]
            if actual != expected:
                raise RuntimeError('N7_PERSONA_CONCURRENT_CHANGE ' + name)
        if read(ftp, MANIFEST) != originals[MANIFEST]:
            raise RuntimeError('N7_PERSONA_MANIFEST_CONCURRENT_CHANGE')
        for name, data in changes.items():
            backup = '.n7-persona-backup-' + tag + '-' + name
            ftp.rename(ROOT + '/' + name, ROOT + '/' + backup)
            backups[name] = backup
            if read(ftp, backup) != originals[name]:
                raise RuntimeError('N7_PERSONA_BACKUP_MISMATCH ' + name)
            ftp.rename(ROOT + '/' + staged.pop(name), ROOT + '/' + name)
            installed.append(name)
            if read(ftp, name) != data:
                raise RuntimeError('N7_PERSONA_ACTIVE_HASH_MISMATCH ' + name)
        restart(ftp, tag)
        validate_postdeploy(release)
        if sha(read(ftp, HELPER)) != release['files'][HELPER]:
            raise RuntimeError('N7_PERSONA_FINAL_HASH_MISMATCH')
        if read(ftp, MANIFEST) != new_receipt_raw:
            raise RuntimeError('N7_PERSONA_FINAL_RECEIPT_MISMATCH')
    except BaseException:
        errors = []
        for name in reversed(list(backups)):
            try:
                active = read(ftp, name) if name in installed else None
                if name in installed:
                    if active != changes[name]:
                        raise RuntimeError('N7_PERSONA_CONCURRENT_ACTIVE_CHANGE')
                    ftp.delete(ROOT + '/' + name)
                ftp.rename(ROOT + '/' + backups[name], ROOT + '/' + name)
                if read(ftp, name) != originals[name]:
                    raise RuntimeError('N7_PERSONA_ROLLBACK_HASH_MISMATCH')
            except Exception:
                errors.append(name)
        if installed:
            try:restart(ftp, 'rollback-' + tag)
            except Exception:errors.append('restart')
        print('N7_PERSONA_ROLLBACK_VERIFIED=' + str(not errors).lower())
        if errors:
            print('N7_PERSONA_MANUAL_RECOVERY_REQUIRED=' + ','.join(errors))
        raise
    finally:
        for name, stage in staged.items():
            try:ftp.delete(ROOT + '/' + stage)
            except ftplib.all_errors:pass
        try:ftp.rmd(lock)
        except ftplib.all_errors:pass
    print('N7_PERSONA_LIVE_DEPLOYED=true files_changed=2 data_paths_written=0 backups_retained=true')


def main():
    release, helper = contract()
    ftp = connect()
    try:
        old_receipt_raw, old_receipt, already = preflight(ftp, release)
        if already:
            validate_postdeploy(release)
            print('N7_PERSONA_ALREADY_INSTALLED=true')
            return
        if os.getenv('N7_DRY_RUN','1') != '0':
            print('N7_PERSONA_DRY_RUN_VERIFIED=true no_writes=true')
            return
        activate(ftp, release, helper, old_receipt_raw, old_receipt)
    finally:
        try:ftp.quit()
        except ftplib.all_errors:ftp.close()


if __name__ == '__main__':
    main()
