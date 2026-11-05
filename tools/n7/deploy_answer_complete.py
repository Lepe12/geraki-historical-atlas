#!/usr/bin/env python3
"""Guarded deployment of an N7 answer() replacement over authenticated FTPS.

Only /bot.piratecartography.com/n7-app/server.js is changed. No secrets, user
history or queued jobs are read, displayed or modified. A backup is kept.
"""
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import tempfile
import urllib.request
import uuid

ROOT = '/bot.piratecartography.com/n7-app'
TLS = 'linux3087.grserver.gr'
PUBLIC = 'https://bot.piratecartography.com'
BEGIN = 'async function answer(messages) {'
END = 'function serve(res,pathname) {'
MARKER = 'N7_COMPLETE_OUTPUT_V1'
SOURCE = Path(__file__).with_name('answer_complete_function.js')

def sha(content):
    return hashlib.sha256(content).hexdigest()

def fetch(ftp, name):
    blocks = []
    ftp.retrbinary('RETR ' + name, blocks.append)
    return b''.join(blocks)

def patch(original):
    text = original.decode('utf-8')
    if MARKER in text:
        return original
    if text.count(BEGIN) != 1 or text.count(END) != 1:
        print('N7_ANSWER_LAYOUT_MARKERS begin='+str(text.count(BEGIN))+' end='+str(text.count(END))+' function_answer='+str(text.count('function answer'))+' function_serve='+str(text.count('function serve')))
        raise RuntimeError('N7_UNEXPECTED_ANSWER_LAYOUT_ABORT')
    start = text.index(BEGIN)
    end = text.index(END, start)
    original_answer = text[start:end]
    for expected in (
        "const resp=await fetch(", "temperature:0.3",
        "const content=result?.choices?.[0]?.message?.content",
    ):
        if expected not in original_answer:
            raise RuntimeError('N7_UNRECOGNIZED_OLD_ANSWER_ABORT')
    for expected in ('N7_FAST_GROQ_BOOTSTRAP_v1','n7-queue-bridge'):
        if expected not in text:
            raise RuntimeError('N7_EXPECTED_PRODUCTION_INTEGRATION_MISSING')
    function = SOURCE.read_text('utf-8')
    if function.count(MARKER) != 1 or function.count(BEGIN) != 1:
        raise RuntimeError('N7_INVALID_REPLACEMENT_SOURCE')
    result = (text[:start] + function + '\n' + text[end:]).encode('utf-8')
    if not result.startswith(original[:original.index(BEGIN.encode('utf-8'))]):
        raise RuntimeError('N7_UNEXPECTED_HEADER_CHANGE')
    return result

def syntax_check(data):
    with tempfile.NamedTemporaryFile(mode='wb',suffix='.js') as fp:
        fp.write(data)
        fp.flush()
        res = subprocess.run(['node','--check',fp.name],capture_output=True,timeout=20)
        if res.returncode != 0:
            raise RuntimeError('N7_PATCHED_SERVER_NODE_SYNTAX_FAILED')

def ftp_connect():
    host = os.environ['PCT_FTPS_HOST']
    port = int(os.environ.get('PCT_FTPS_PORT','21'))
    ips = lambda h:{i[4][0] for i in socket.getaddrinfo(h,port,type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):
        raise RuntimeError('N7_FTPS_SERVER_IDENTITY_MISMATCH')
    ftp = ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
    ftp.connect(host,port)
    ftp.host=TLS
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    return ftp

def restart(ftp, label):
    ftp.cwd(ROOT+'/tmp')
    ftp.storbinary('STOR restart.txt',io.BytesIO(('n7-completion-'+label+'\n').encode()))

def verify(ftp, expected):
    ftp.cwd(ROOT)
    if sha(fetch(ftp,'server.js')) != sha(expected):
        raise RuntimeError('N7_READBACK_HASH_MISMATCH')
    context = ssl.create_default_context()
    for endpoint in ('/health','/api/status','/app.js'):
        with urllib.request.urlopen(urllib.request.Request(PUBLIC+endpoint,
             headers={'Cache-Control':'no-cache','User-Agent':'N7-complete-output-verify/1'}),
             timeout=15,context=context) as response:
            if response.status != 200:
                raise RuntimeError('N7_PUBLIC_ROUTE_FAILED')
            body = response.read(200000)
            if endpoint in ('/health','/api/status'):
                obj = json.loads(body)
                if obj.get('modelConfigured') is not True:
                    raise RuntimeError('N7_DIRECT_MODEL_NOT_CONFIGURED')
    print('N7_REPLY_FIX_LIVE_VERIFIED=true health=true modelConfigured=true publicJS=true')

def main():
    dry = os.environ.get('N7_DRY_RUN','1')!='0'
    ftp = ftp_connect()
    stage = None
    backup = None
    installed = False
    original = None
    try:
        ftp.cwd(ROOT)
        if ftp.pwd().rstrip('/')!=ROOT:
            raise RuntimeError('N7_UNEXPECTED_SERVER_DIRECTORY')
        original = fetch(ftp,'server.js')
        updated = patch(original)
        syntax_check(updated)
        print('N7_REPLY_FIX_PREFLIGHT_OK dry_run='+str(dry)
              +' update_needed='+str(original!=updated)
              +' original_sha256='+sha(original))
        if dry:
            return
        if original == updated:
            verify(ftp,updated)
            print('N7_REPLY_FIX_ALREADY_INSTALLED=true')
            return
        suffix = uuid.uuid4().hex[:12]
        stage = '.n7-reply-fix-stage-'+suffix+'.js'
        backup = '.n7-reply-fix-backup-'+suffix+'.js'
        ftp.storbinary('STOR '+stage,io.BytesIO(updated))
        ftp.sendcmd('SITE CHMOD 644 '+stage)
        if sha(fetch(ftp,stage))!=sha(updated):
            raise RuntimeError('N7_UPLOAD_INTEGRITY_FAILED')
        if sha(fetch(ftp,'server.js'))!=sha(original):
            raise RuntimeError('N7_CONCURRENT_UPDATE_ABORT')
        ftp.rename('server.js',backup)
        try:
            ftp.rename(stage,'server.js')
            stage=None
            installed=True
        except BaseException:
            ftp.rename(backup,'server.js')
            backup=None
            raise
        restart(ftp,'activate')
        verify(ftp,updated)
        print('N7_REPLY_FIX_DEPLOY_SUCCESS=true')
    except BaseException:
        if installed and backup:
            try:
                ftp.cwd(ROOT)
                ftp.delete('server.js')
                ftp.rename(backup,'server.js')
                restart(ftp,'rollback')
                print('N7_REPLY_FIX_ROLLBACK_SUCCESS=true')
            except BaseException:
                print('N7_REPLY_FIX_MANUAL_ROLLBACK_NEEDED=true')
        raise
    finally:
        if stage:
            try:
                ftp.cwd(ROOT)
                ftp.delete(stage)
            except ftplib.all_errors:
                pass
        try:
            ftp.quit()
        except ftplib.all_errors:
            pass

if __name__=='__main__':
    main()
