#!/usr/bin/env python3
"""Guarded FTPS activation of Groq direct chat for the existing N7 Plesk app.

Never prints, embeds in Git, or exposes API credentials to HTTP. The secret is
transported from an existing protected GitHub Environment via FTPS to the
existing non-public Node app data folder, with 0600 permissions.
"""
import ftplib
import hashlib
import io
import json
import os
import pathlib
import secrets
import socket
import ssl
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = '/bot.piratecartography.com/n7-app'
PRIVATE_DIR = ROOT + '/data'
PUBLIC_URL = 'https://bot.piratecartography.com'
TLS_SERVER = 'linux3087.grserver.gr'
PRIVATE_FILENAME = '.n7-groq-provider.json'
MODEL = 'qwen/qwen3.8-27b'
BASE_URL = 'https://api.groq.com/openai/v1'
ANCHOR = "const MODEL = process.env.LLM_MODEL || '';"
VERSION = 'N7_FAST_GROQ_BOOTSTRAP_v1'
PATCH = """
// N7_FAST_GROQ_BOOTSTRAP_v1: private, least-privilege direct model routing.
(function bootstrapN7Groq() {
  if (process.env.LLM_API_KEY && process.env.LLM_MODEL) return;
  const providerFile = path.join(__dirname, 'data', '.n7-groq-provider.json');
  try {
    const stat = fs.statSync(providerFile);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('unsafe_provider_permissions');
    const c = JSON.parse(fs.readFileSync(providerFile, 'utf8'));
    if (c.schema !== 'n7-groq-v1' || c.baseUrl !== 'https://api.groq.com/openai/v1' ||
        c.model !== 'qwen/qwen3.8-27b' || typeof c.apiKey !== 'string' || c.apiKey.length < 20)
      throw new Error('invalid_provider_settings');
    process.env.LLM_API_KEY = c.apiKey;
    process.env.LLM_BASE_URL = c.baseUrl;
    process.env.LLM_MODEL = c.model;
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('N7_FAST_PROVIDER_UNAVAILABLE: ' + String(e.code || e.message).slice(0,40));
  }
})();
""".lstrip()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def read(ftp, name):
    chunks = []
    ftp.retrbinary('RETR ' + name, chunks.append)
    return b''.join(chunks)

def try_read(ftp, name):
    try:
        return read(ftp, name)
    except ftplib.error_perm as error:
        if str(error).startswith('550 '):
            return None
        raise

def chmod(ftp, mode, name):
    ftp.sendcmd('SITE CHMOD ' + mode + ' ' + name)

def patch_server(old):
    source = old.decode('utf-8')
    if VERSION in source:
        return old
    required = ('const fs = require(', 'const path = require(', ANCHOR,
                'process.env.LLM_API_KEY', 'process.env.LLM_BASE_URL', 'n7-queue-bridge')
    absent = [x for x in required if x not in source]
    if absent or source.count(ANCHOR) != 1:
        raise RuntimeError('N7_UNRECOGNIZED_LIVE_SERVER_ABORT')
    return source.replace(ANCHOR, PATCH + ANCHOR).encode('utf-8')

def node_syntax(code):
    with tempfile.NamedTemporaryFile(suffix='.js', mode='wb') as temp:
        temp.write(code)
        temp.flush()
        result = subprocess.run(['node', '--check', temp.name], capture_output=True,
                                text=True, timeout=20)
        if result.returncode:
            raise RuntimeError('N7_PATCHED_SERVER_SYNTAX_INVALID')

def token_from_env():
    key = (os.environ.get('N7_GROQ_API_KEY') or '').strip()
    if not key or len(key) < 20:
        raise RuntimeError('N7_GROQ_KEY_MISSING_IN_GITHUB_ENVIRONMENT')
    return key

def verify_groq(key):
    payload = json.dumps({'model': MODEL, 'messages': [
      {'role':'user','content':'Απάντησε στα ελληνικά μόνο με τη λέξη: Ναι'}
    ], 'temperature': 0.3, 'max_completion_tokens': 80}).encode('utf-8')
    req = urllib.request.Request(BASE_URL + '/chat/completions', data=payload, method='POST',
       headers={'Authorization':'Bearer ' + key, 'Content-Type':'application/json',
                'User-Agent':'N7-private-activation-smoke/1'})
    begin = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=25, context=ssl.create_default_context()) as r:
            response = json.loads(r.read(100000))
            if r.status != 200 or not str(response.get('choices', [{}])[0].get('message', {}).get('content', '')).strip():
                raise RuntimeError('N7_GROQ_MODEL_EMPTY_RESPONSE')
    except urllib.error.HTTPError as e:
        raise RuntimeError('N7_GROQ_MODEL_HTTP_' + str(e.code)) from None
    print('N7_GROQ_COMPLETION_OK elapsed_ms=' + str(round((time.monotonic()-begin)*1000)))

def get_url(path):
    return urllib.request.Request(PUBLIC_URL + path, headers={
      'User-Agent':'N7-groq-safe-probe/1','Cache-Control':'no-cache'})

def public_content_exposed(name, canary):
    context = ssl.create_default_context()
    for urlpath in ('/data/' + name, '/n7-app/data/' + name,
                    '/' + name, '/n7-app/' + name):
        try:
            with urllib.request.urlopen(get_url(urlpath), timeout=12, context=context) as response:
                body = response.read(100000)
        except urllib.error.HTTPError as error:
            body = error.read(100000)
        if canary in body:
            return True
    return False

def verify_live():
    context = ssl.create_default_context()
    for attempt in range(18):
        try:
            with urllib.request.urlopen(get_url('/api/status'), timeout=10, context=context) as r:
                status = json.loads(r.read(10000))
            with urllib.request.urlopen(get_url('/health'), timeout=10, context=context) as r:
                health = json.loads(r.read(10000))
            if status.get('modelConfigured') is True and health.get('modelConfigured') is True:
                for path in ('/', '/app.js'):
                    with urllib.request.urlopen(get_url(path), timeout=10, context=context) as r:
                        if r.status != 200:
                            raise RuntimeError('N7_STATIC_ROUTE_FAILED')
                request = urllib.request.Request(PUBLIC_URL + '/api/n7/worker/claim',
                   method='POST', data=b'{}',
                   headers={'Content-Type':'application/json','User-Agent':'N7-groq-safe-probe/1'})
                try:
                    urllib.request.urlopen(request, timeout=10, context=context)
                    raise RuntimeError('N7_UNAUTHENTICATED_WORKER_BROKEN')
                except urllib.error.HTTPError as e:
                    if e.code != 401:
                        raise
                print('N7_LIVE_GROQ_CONFIGURED=true; static_routes_ok=true; worker_unauthorized=401')
                return
        except (TimeoutError, ValueError, urllib.error.URLError):
            pass
        time.sleep(2)
    raise RuntimeError('N7_LIVE_PROVIDER_NOT_READY_ROLLBACK')

def connect():
    host = os.environ['PCT_FTPS_HOST']
    port = int(os.environ.get('PCT_FTPS_PORT','21'))
    ips = lambda h: {i[4][0] for i in socket.getaddrinfo(h, port, type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS_SERVER)):
        raise RuntimeError('N7_FTPS_HOST_IDENTITY_MISMATCH')
    ftp = ftplib.FTP_TLS(timeout=35, context=ssl.create_default_context())
    ftp.connect(host, port)
    ftp.host = TLS_SERVER
    ftp.login(os.environ['PCT_FTPS_USER'], os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    return ftp

def restart(ftp, action):
    ftp.cwd(ROOT + '/tmp')
    ftp.storbinary('STOR restart.txt', io.BytesIO(('n7-groq-' + action + '\n').encode()))

def deploy():
    dry = os.environ.get('N7_DRY_RUN','1') != '0'
    key = token_from_env()
    verify_groq(key)
    ftp = connect()
    created_stages=[]
    backups=[]
    new_secret_installed=False
    new_server_installed=False
    old_secret=None
    server_backup=None
    token=secrets.token_hex(7)
    try:
        ftp.cwd(ROOT)
        if ftp.pwd().rstrip('/') != ROOT:
            raise RuntimeError('N7_UNEXPECTED_FTPS_ROOT')
        old_server=read(ftp,'server.js')
        patched_server=patch_server(old_server)
        node_syntax(patched_server)
        ftp.cwd(PRIVATE_DIR)
        if ftp.pwd().rstrip('/') != PRIVATE_DIR:
            raise RuntimeError('N7_PRIVATE_DATA_DIR_MISSING')
        old_secret=try_read(ftp,PRIVATE_FILENAME)
        print('N7_GROQ_PREFLIGHT_OK dry_run=' + str(dry) +
              ' server_patch_needed=' + str(patched_server!=old_server) +
              ' private_dir_accessible=true' +
              ' existing_provider_file=' + str(old_secret is not None))
        if dry:
            return
        if patched_server == old_server and old_secret is not None:
            raise RuntimeError('N7_ALREADY_PATCHED_ABORT_FOR_REVIEW')
        if old_secret is not None:
            raise RuntimeError('N7_EXISTING_PRIVATE_PROVIDER_ABORT_FOR_REVIEW')

        # First write only an innocuous canary and prove that the private data
        # folder is not directly web-served. Never write an API key until passed.
        marker='.n7-provider-access-probe-' + token + '.txt'
        canary=('n7-private-' + secrets.token_hex(24)).encode('ascii')
        ftp.cwd(PRIVATE_DIR)
        ftp.storbinary('STOR '+marker, io.BytesIO(canary))
        created_stages.append((PRIVATE_DIR,marker))
        chmod(ftp,'600',marker)
        if read(ftp,marker) != canary:
            raise RuntimeError('N7_CANARY_UPLOAD_FAILED')
        if public_content_exposed(marker,canary):
            raise RuntimeError('N7_PRIVATE_FOLDER_PUBLIC_ABORT')
        ftp.delete(marker)
        created_stages.remove((PRIVATE_DIR,marker))
        print('N7_PRIVATE_CANARY_NOT_PUBLIC=true')

        payload=json.dumps({'schema':'n7-groq-v1','model':MODEL,'baseUrl':BASE_URL,
                            'apiKey':key},separators=(',',':')).encode('utf8')
        key_stage='.n7-groq-key-stage-' + token
        ftp.storbinary('STOR '+key_stage,io.BytesIO(payload))
        created_stages.append((PRIVATE_DIR,key_stage))
        chmod(ftp,'600',key_stage)
        if digest(read(ftp,key_stage)) != digest(payload):
            raise RuntimeError('N7_PROVIDER_UPLOAD_HASH_FAILED')
        # No pre-existing provider file is replaced.
        ftp.rename(key_stage,PRIVATE_FILENAME)
        created_stages.remove((PRIVATE_DIR,key_stage))
        new_secret_installed=True

        if patched_server != old_server:
            ftp.cwd(ROOT)
            new_name='.n7-groq-server-stage-' + token + '.js'
            ftp.storbinary('STOR '+new_name,io.BytesIO(patched_server))
            created_stages.append((ROOT,new_name))
            chmod(ftp,'644',new_name)
            if digest(read(ftp,new_name)) != digest(patched_server):
                raise RuntimeError('N7_SERVER_STAGE_HASH_FAILED')
            if digest(read(ftp,'server.js')) != digest(old_server):
                raise RuntimeError('N7_CONCURRENT_SERVER_CHANGE_ABORT')
            server_backup='.n7-groq-server-backup-'+token+'.js'
            ftp.rename('server.js',server_backup)
            backups.append((ROOT,server_backup))
            try:
                ftp.rename(new_name,'server.js')
            except BaseException:
                ftp.rename(server_backup,'server.js')
                backups.pop()
                raise
            created_stages.remove((ROOT,new_name))
            new_server_installed=True
            if digest(read(ftp,'server.js')) != digest(patched_server):
                raise RuntimeError('N7_SERVER_FINAL_HASH_FAILED')

        restart(ftp,'activate')
        verify_live()
        print('N7_GROQ_DIRECT_CHAT_ACTIVATED=true')
    except BaseException:
        if not dry and (new_secret_installed or new_server_installed):
            try:
                ftp.cwd(ROOT)
                if new_server_installed and server_backup:
                    ftp.delete('server.js')
                    ftp.rename(server_backup,'server.js')
                    backups.clear()
                ftp.cwd(PRIVATE_DIR)
                if new_secret_installed:
                    ftp.delete(PRIVATE_FILENAME)
                restart(ftp,'rollback')
                print('N7_GROQ_ROLLBACK_SUCCESS=true')
            except BaseException:
                print('N7_GROQ_ROLLBACK_MANUAL_INTERVENTION_REQUIRED=true')
        raise
    finally:
        for folder,name in created_stages:
            try:
                ftp.cwd(folder)
                ftp.delete(name)
            except ftplib.all_errors:
                pass
        try:
            ftp.quit()
        except ftplib.all_errors:
            pass

if __name__ == '__main__':
    deploy()
