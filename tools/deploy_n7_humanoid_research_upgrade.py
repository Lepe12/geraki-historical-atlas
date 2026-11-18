#!/usr/bin/env python3
"""Guarded, reversible, one-module upgrade for N7's already-installed Humanoid public research."""
import ftplib
import hashlib
import io
import json
import os
import secrets
import socket
import ssl
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = '/bot.piratecartography.com/n7-app'
TLS_HOST = 'linux3087.grserver.gr'
HELPER = 'n7-apex-public-chat.cjs'
HERE = Path(__file__).resolve().parents[1]
REQUEST = HERE / 'ops_ftps_requests/n7-humanoid-research-upgrade.json'
MANIFEST = HERE / 'n7-distribution.json'
SOURCE = HERE / 'tools/n7/apex-public-chat.cjs'
PUBLIC = 'https://bot.piratecartography.com'
EXPECTED_CONFIRMATION = 'N7-OWNER-GUARDED-HUMANOID-RESEARCH-UPGRADE'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def fetch(ftp, name):
    parts = []
    ftp.retrbinary('RETR ' + name, parts.append)
    return b''.join(parts)

def connect():
    host = os.environ['PCT_FTPS_HOST']
    port = int(os.getenv('PCT_FTPS_PORT', '21'))
    addresses = lambda hostname: {x[4][0] for x in socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)}
    if not addresses(host).intersection(addresses(TLS_HOST)):
        raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_HOST_MISMATCH')
    ftp = ftplib.FTP_TLS(timeout=35, context=ssl.create_default_context())
    ftp.connect(host, port)
    ftp.host = TLS_HOST
    ftp.login(os.environ['PCT_FTPS_USER'], os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    ftp.cwd(ROOT)
    if ftp.pwd().rstrip('/') != ROOT:
        raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_BAD_ROOT')
    return ftp

def nodecheck(data):
    with tempfile.NamedTemporaryFile(suffix='.js', mode='wb') as handle:
        handle.write(data)
        handle.flush()
        subprocess.run(['node', '--check', handle.name], check=True, timeout=20,
                       capture_output=True)

def restart(ftp, label):
    ftp.cwd(ROOT + '/tmp')
    ftp.storbinary('STOR restart.txt', io.BytesIO(('n7-humanoid-research-' + label + '\n').encode()))
    ftp.cwd(ROOT)

def verify_health():
    context = ssl.create_default_context()
    for path in ('/health', '/api/status'):
        request = urllib.request.Request(PUBLIC + path,
                                         headers={'Cache-Control': 'no-cache', 'User-Agent': 'N7-verified-web-upgrade'})
        with urllib.request.urlopen(request, timeout=14, context=context) as response:
            data = json.loads(response.read(16000))
            if response.status != 200 or data.get('modelConfigured') is not True:
                raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_HEALTH_FAILED')
    try:
        urllib.request.urlopen(PUBLIC + '/api/n7/approved-lessons', timeout=12, context=context)
        raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_MEMORY_PRIVACY_FAILED')
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise
    with urllib.request.urlopen(urllib.request.Request(PUBLIC + '/api/n7-apex/status',headers={'Cache-Control':'no-cache'}),timeout=14,context=context) as response:
        apex=json.loads(response.read(15000))
        if response.status != 200 or apex.get('available') is not True or apex.get('passwordRequired') is not False:
            raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_APEX_STATUS_FAILED')
    print('N7_HUMANOID_RESEARCH_UPGRADE_HEALTH_OK=true memory_private=true apex_available=true')

def main():
    dry = os.getenv('N7_DRY_RUN', '1') != '0'
    manifest = json.loads(MANIFEST.read_text())
    new = SOURCE.read_bytes()
    expected_new = manifest['files']['tools/n7/apex-public-chat.cjs']
    if digest(new) != expected_new:
        raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_CANONICAL_HASH_MISMATCH')
    nodecheck(new)
    request = json.loads(REQUEST.read_text())
    expected = {
        'confirmation': EXPECTED_CONFIRMATION,
        'canonical_commit': manifest['commit'],
        'target': ROOT + '/' + HELPER,
        'new_sha256': expected_new,
        'old_sha256': request.get('old_sha256'),
        'backup_and_rollback': True,
        'preserve_chat_memory_and_other_files': True
    }
    if request != expected:
        raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_AUTHORIZATION_MISMATCH')
    ftp = connect()
    stage = backup = None
    replaced = False
    try:
        current_server = fetch(ftp, 'server.js')
        if b'N7_APEX_PASSWORDLESS_CHAT_V1' not in current_server or b"require('./n7-apex-public-chat.cjs')" not in current_server:
            raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_SERVER_NOT_WIRED')
        old = fetch(ftp, HELPER)
        nodecheck(old)
        old_hash = digest(old)
        print('N7_HUMANOID_RESEARCH_UPGRADE_PREFLIGHT remote_sha256=' + old_hash +
              ' new_sha256=' + expected_new + ' dry_run=' + str(dry))
        if old_hash == expected_new:
            print('N7_HUMANOID_RESEARCH_UPGRADE_ALREADY_CURRENT=true')
            return
        if dry:
            return
        if old_hash != request['old_sha256'] or not isinstance(request['old_sha256'], str) or len(request['old_sha256']) != 64:
            raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_UNEXPECTED_OLD_HASH')
        stage = '.n7-web-upgrade-stage-' + secrets.token_hex(8) + '.js'
        backup = '.n7-web-upgrade-backup-' + secrets.token_hex(8) + '.js'
        ftp.storbinary('STOR ' + stage, io.BytesIO(new))
        ftp.sendcmd('SITE CHMOD 644 ' + stage)
        if digest(fetch(ftp, stage)) != expected_new:
            raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_STAGE_HASH_MISMATCH')
        if digest(fetch(ftp, HELPER)) != old_hash:
            raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_CONCURRENT_CHANGE')
        ftp.rename(HELPER, backup)
        try:
            ftp.rename(stage, HELPER)
            stage = None
        except BaseException:
            ftp.rename(backup, HELPER)
            backup = None
            raise
        replaced = True
        if digest(fetch(ftp, HELPER)) != expected_new:
            raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_READBACK_MISMATCH')
        restart(ftp, 'activate')
        # Passenger can briefly return HTTP 500 while recycling Node workers.
        # Never accept a failed final state: bounded retries, then verified rollback.
        last_health_error = None
        for attempt in range(8):
            try:
                verify_health()
                last_health_error = None
                break
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ConnectionError) as error:
                last_health_error = error
                print('N7_HUMANOID_HEALTH_RETRY attempt=' + str(attempt + 1) + ' error=' + type(error).__name__)
                if attempt < 7:
                    time.sleep(2)
        if last_health_error is not None:
            raise RuntimeError('N7_HUMANOID_HEALTH_NOT_RESTORED') from last_health_error
        ftp.cwd(ROOT)
        if digest(fetch(ftp, HELPER)) != expected_new:
            raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_POST_RESTART_HASH_MISMATCH')
        print('N7_HUMANOID_RESEARCH_UPGRADE_SUCCESS=true backup_retained=true current_sha256=' + expected_new)
    except BaseException:
        if replaced and backup:
            try:
                ftp.cwd(ROOT)
                ftp.rename(HELPER, '.n7-web-upgrade-rollback-' + secrets.token_hex(6) + '.js')
                ftp.rename(backup, HELPER)
                if digest(fetch(ftp, HELPER)) != old_hash:
                    raise RuntimeError('N7_HUMANOID_RESEARCH_UPGRADE_ROLLBACK_HASH_MISMATCH')
                restart(ftp, 'rollback')
                print('N7_HUMANOID_RESEARCH_UPGRADE_ROLLBACK_VERIFIED=true')
            except Exception:
                print('N7_HUMANOID_RESEARCH_UPGRADE_MANUAL_ROLLBACK_REQUIRED=true')
        raise
    finally:
        if stage:
            try:
                ftp.cwd(ROOT)
                ftp.delete(stage)
            except Exception:
                pass
        try:
            ftp.quit()
        except Exception:
            pass

if __name__ == '__main__':
    main()
