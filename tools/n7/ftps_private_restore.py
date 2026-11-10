#!/usr/bin/env python3
"""Verify a real N7 backup off the live data path; no contents in logs/artifacts."""
import ftplib
import hashlib
import io
import json
import os
import re
from pathlib import Path, PurePosixPath
import secrets
import shutil
import stat
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import zipfile

import private_backup
from deploy_reconciled_runtime import BASE, ROOT, connect

DATA = ROOT + '/data'
BACKUPS = ROOT + '/.n7-private-backups'
EXCLUDE = {'.sessions', '.n7-conversations-write.lock', '.n7-conversations-write.lock.recovery', '.write-lock'}


def valid_name(name):
    return bool(name) and name not in ('.', '..') and not any(c in name for c in '/\\\r\n\x00')


def inventory(ftp):
    result = {}
    def walk(rel=''):
        for name, facts in ftp.mlsd(DATA + ('/' + rel if rel else '')):
            kind = facts.get('type', '')
            if kind in ('cdir', 'pdir'):
                continue
            if not valid_name(name):
                raise ValueError('unsafe_source_name')
            if name in EXCLUDE or name.endswith('.tmp'):
                continue
            child = rel + '/' + name if rel else name
            if kind == 'dir':
                walk(child)
            elif kind == 'file':
                result[child] = int(facts['size'])
            else:
                raise ValueError('non_regular_source')
    walk()
    if 'conversations.json' not in result:
        raise ValueError('conversation_store_not_found')
    return result


def retrieve(ftp, remote, local):
    local.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with local.open('xb') as out:
        os.chmod(local, 0o600)
        ftp.retrbinary('RETR ' + remote, out.write)


def remote_digest(ftp, remote):
    h = hashlib.sha256()
    ftp.retrbinary('RETR ' + remote, h.update)
    return h.hexdigest()


def capture_stable(ftp, target, attempts=3):
    for attempt in range(attempts):
        before = inventory(ftp)
        if shutil.disk_usage(target.parent).free < sum(before.values()) * 4 + 512 * 1024 * 1024:
            raise ValueError('insufficient_isolated_disk')
        if target.exists():
            shutil.rmtree(target)  # This function owns only its new isolated local directory.
        target.mkdir(mode=0o700)
        for name in before:
            retrieve(ftp, DATA + '/' + name, target / name)
        after = inventory(ftp)
        stable = before == after
        if stable:
            for name in before:
                if private_backup.digest(target / name) != remote_digest(ftp, DATA + '/' + name):
                    stable = False
                    break
        if stable and inventory(ftp) == before:
            return before
        time.sleep(2)
    raise ValueError('live_source_changed_retry_later')


def make_archive(snapshot, archive):
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for name, p in private_backup.files(snapshot).items():
            z.write(p, name)
    archive.chmod(0o600)


def unpack(archive, target, maximum):
    target.mkdir(mode=0o700)
    with zipfile.ZipFile(archive) as z:
        names = set()
        total = 0
        for item in z.infolist():
            p = PurePosixPath(item.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in item.filename or item.filename in names or stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError('unsafe_backup_archive')
            names.add(item.filename)
            if item.is_dir():
                continue
            total += item.file_size
            if total > maximum:
                raise ValueError('backup_archive_capacity')
            destination = target.joinpath(*p.parts)
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with z.open(item) as source, destination.open('xb') as out:
                os.chmod(destination, 0o600)
                shutil.copyfileobj(source, out, 1024 * 1024)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def public_status(relative):
    request = urllib.request.Request(BASE + relative, headers={'User-Agent': 'N7-private-backup-privacy-check/1', 'Cache-Control': 'no-cache'})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
            return response.status
    except urllib.error.HTTPError as e:
        return e.code


def private_destination(ftp, audit_id):
    entries = {name: facts for name, facts in ftp.mlsd(ROOT)}
    entry = entries.get('.n7-private-backups')
    if entry and entry.get('type') != 'dir':
        raise ValueError('unsafe_private_backup_directory')
    if not entry:
        ftp.mkd(BACKUPS)
    ftp.sendcmd('SITE CHMOD 700 ' + BACKUPS)
    probe = BACKUPS + '/' + audit_id + '.probe.zip'
    # Verify the same file extension before uploading any private content.
    sample = io.BytesIO()
    with zipfile.ZipFile(sample, 'w') as z:
        z.writestr('probe.txt', 'N7 non-private access probe')
    sample.seek(0)
    ftp.storbinary('STOR ' + probe, sample)
    ftp.sendcmd('SITE CHMOD 600 ' + probe)
    try:
        paths = ['/.n7-private-backups/', '/n7-app/.n7-private-backups/']
        if any(public_status(prefix + audit_id + '.probe.zip') not in (401, 403, 404) for prefix in paths):
            raise ValueError('private_backup_public_access_guard')
    finally:
        ftp.delete(probe)  # Only this newly created non-private probe, never any existing backup.


def inspect_local(data):
    reader = Path(__file__).with_name('private_restore_reader.cjs')
    env = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT')}
    result = subprocess.run(['node', str(reader), str(data)], capture_output=True, env=env, timeout=120)
    try:
        report = json.loads(result.stdout)
    except Exception:
        raise ValueError('private_reader_unavailable') from None
    if result.returncode or report.get('ok') is not True:
        raise ValueError('private_reader_failed')
    return report['summary']


def execute(ftp, dry=True):
    source = inventory(ftp)
    if dry:
        return {'result': 'READ_ONLY_PREFLIGHT', 'files': len(source), 'sourceBytes': sum(source.values()), 'productionDataWrites': 0}
    audit_id = 'n7-restore-' + secrets.token_hex(12)
    private_destination(ftp, audit_id)
    with tempfile.TemporaryDirectory(prefix='n7-private-restore-') as temporary:
        root = Path(temporary)
        captured = root / 'captured'
        source = capture_stable(ftp, captured)
        baseline = inspect_local(captured)
        snapshot = root / 'snapshot'
        # The captured private directory has no writers; production is never declared offline.
        manifest = private_backup.create(captured, snapshot, offline=True)
        archive = root / 'snapshot.zip'
        make_archive(snapshot, archive)
        stage = BACKUPS + '/.' + audit_id + '.upload.zip'
        final = BACKUPS + '/' + audit_id + '.zip'
        with archive.open('rb') as f:
            ftp.storbinary('STOR ' + stage, f)
        ftp.sendcmd('SITE CHMOD 600 ' + stage)
        if remote_digest(ftp, stage) != private_backup.digest(archive):
            raise ValueError('private_backup_upload_mismatch')
        ftp.rename(stage, final)
        downloaded = root / 'readback.zip'
        retrieve(ftp, final, downloaded)
        if private_backup.digest(downloaded) != private_backup.digest(archive):
            raise ValueError('private_backup_readback_mismatch')
        readback = root / 'readback'
        unpack(downloaded, readback, sum(p.stat().st_size for p in private_backup.files(snapshot).values()))
        private_backup.verify(readback)
        restored = root / 'restored'
        private_backup.restore(readback, restored, offline=True)
        recovered = inspect_local(restored)
        if recovered != baseline:
            raise ValueError('restored_records_differ')
        return {'result': 'REAL_PRIVATE_RESTORE_VERIFIED', 'auditId': audit_id, 'files': len(manifest['files']), 'sourceBytes': sum(source.values()), 'records': recovered, 'backupSha256': private_backup.digest(archive), 'stableSourceDoubleRead': True, 'restoredAllBytes': True, 'productionDataWrites': 0, 'backupRetainedPrivately': True, 'publicBackupHttpBlocked': True, 'credentialsOrContentLogged': False, 'githubArtifactsUsed': False}


def main():
    os.umask(0o077)
    ftp = None
    try:
        ftp = connect()
        report = execute(ftp, dry=os.getenv('N7_RESTORE_DRY_RUN', '1') != '0')
        print('N7_PRIVATE_RESTORE_RESULT ' + json.dumps(report, sort_keys=True))
    except Exception as e:
        # Never emit private paths, filenames, content or untrusted server error messages.
        reason = str(e) if type(e) is ValueError and re.fullmatch(r'[a-z_]{4,80}', str(e)) else type(e).__name__
        print('N7_PRIVATE_RESTORE_FAILED reason=' + reason)
        raise SystemExit(1) from None
    finally:
        if ftp:
            try:
                ftp.quit()
            except ftplib.all_errors:
                ftp.close()


if __name__ == '__main__':
    main()
