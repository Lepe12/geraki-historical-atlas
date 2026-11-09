#!/usr/bin/env python3
"""Install inline correction approval safely into N7 public/app.js only.

No model, backend, keys, databases, existing memory or queue files are modified.
A prior known-good app.js is backed up before the atomic FTPS replacement.
"""
import ftplib
import hashlib
import io
import os
from pathlib import Path
import secrets
import socket
import ssl
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT='/bot.piratecartography.com/n7-app'
PUBLIC=ROOT+'/public'
PUBLIC_URL='https://bot.piratecartography.com'
HOST_TLS='linux3087.grserver.gr'
MARK='N7_CHAT_CORRECTION_CONFIRM_V1'
HERE=Path(__file__).resolve().parent

def digest(data):
    return hashlib.sha256(data).hexdigest()
def read(ftp,name):
    chunks=[]
    ftp.retrbinary('RETR '+name,chunks.append)
    return b''.join(chunks)
def check_js(content):
    with tempfile.NamedTemporaryFile(suffix='.js',mode='wb') as temp:
        temp.write(content)
        temp.flush()
        result=subprocess.run(['node','--check',temp.name],capture_output=True,timeout=20)
        if result.returncode:
            raise RuntimeError('N7_CHAT_CORRECTION_JS_SYNTAX_FAILED')
def patched(before):
    text=before.decode('utf8')
    if MARK in text:return before
    required=('N7_OWNER_MEMORY_UI_V1','n7-owner-memory-dialog',"el('chat').onsubmit=",
              'N7_NONBLOCKING_QUEUE_WATCH_v1')
    absent=[needle for needle in required if needle not in text]
    if absent:raise RuntimeError('N7_UNEXPECTED_PRODUCTION_FRONTEND_ABORT_'+str(len(absent)))
    addon=(HERE/'chat-correction-confirm.js').read_text('utf8')
    if addon.count(MARK)!=1:raise RuntimeError('N7_INVALID_ADDON_MARKER')
    return (text+'\n'+addon+'\n').encode('utf8')
def connect():
    host=os.environ['PCT_FTPS_HOST']
    port=int(os.environ.get('PCT_FTPS_PORT','21'))
    ips=lambda h:{x[4][0] for x in socket.getaddrinfo(h,port,type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(HOST_TLS)):
        raise RuntimeError('N7_UNRECOGNIZED_FTPS_HOST')
    ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
    ftp.connect(host,port);ftp.host=HOST_TLS
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    return ftp
def public_verify(expected):
    # A proxy may retain the previous asset briefly after the atomic FTPS rename.
    # Require an exact hash; a fresh URL and bounded retries do not weaken the gate.
    for attempt in range(3):
        request=urllib.request.Request(PUBLIC_URL+'/app.js?n7_verify='+secrets.token_hex(12),headers={
            'Cache-Control':'no-cache, no-store','Pragma':'no-cache',
            'User-Agent':'N7-inline-correction-verify/1'})
        with urllib.request.urlopen(request,timeout=15,context=ssl.create_default_context()) as response:
            live=response.read(len(expected)+1)
            matched=response.status==200 and digest(live)==digest(expected)
        if matched:
            if MARK.encode() not in live or b'N7_NONBLOCKING_QUEUE_WATCH_v1' not in live:
                raise RuntimeError('N7_PREVIOUS_UI_INTEGRATION_MISSING')
            break
        if attempt==2:
            raise RuntimeError('N7_PUBLIC_JS_MISMATCH')
        time.sleep(2)
    for endpoint in ('/api/status','/health'):
        req=urllib.request.Request(PUBLIC_URL+endpoint,headers={'Cache-Control':'no-cache'})
        with urllib.request.urlopen(req,timeout=12,context=ssl.create_default_context()) as response:
            import json
            status=json.loads(response.read(20000))
            if response.status!=200 or status.get('modelConfigured') is not True:
                raise RuntimeError('N7_GROQ_CONFIGURATION_NOT_READY')
    try:
        urllib.request.urlopen(PUBLIC_URL+'/api/n7/approved-lessons',timeout=10,
          context=ssl.create_default_context())
        raise RuntimeError('N7_PRIVATE_MEMORY_ROUTE_EXPOSED')
    except urllib.error.HTTPError as e:
        if e.code!=401:raise
    print('N7_INLINE_CORRECTION_LIVE_VERIFIED=true Groq=true ownerAuth=401')
def main():
    dry=os.environ.get('N7_DRY_RUN','1')!='0'
    ftp=connect()
    stage=None;backup=None;installed=False
    try:
        ftp.cwd(PUBLIC)
        if ftp.pwd().rstrip('/')!=PUBLIC:raise RuntimeError('N7_WRONG_PUBLIC_DIR')
        original=read(ftp,'app.js')
        updated=patched(original)
        check_js(updated)
        print('N7_INLINE_CORRECTION_PREFLIGHT_OK dry_run='+str(dry)
              +' patch_needed='+str(updated!=original)
              +' original_sha256='+digest(original))
        if dry:return
        if updated==original:
            public_verify(updated)
            print('N7_INLINE_CORRECTION_ALREADY_INSTALLED=true')
            return
        token=secrets.token_hex(7)
        stage='.n7-inline-correction-stage-'+token+'.js'
        backup='.n7-inline-correction-backup-'+token+'.js'
        ftp.storbinary('STOR '+stage,io.BytesIO(updated))
        ftp.sendcmd('SITE CHMOD 644 '+stage)
        if digest(read(ftp,stage))!=digest(updated):
            raise RuntimeError('N7_STAGE_SHA256_MISMATCH')
        if digest(read(ftp,'app.js'))!=digest(original):
            raise RuntimeError('N7_CONCURRENT_UI_CHANGE_ABORT')
        ftp.rename('app.js',backup)
        try:ftp.rename(stage,'app.js')
        except BaseException:
            ftp.rename(backup,'app.js')
            raise
        stage=None;installed=True
        if digest(read(ftp,'app.js'))!=digest(updated):
            raise RuntimeError('N7_FINAL_SHA256_MISMATCH')
        public_verify(updated)
        print('N7_INLINE_CORRECTION_DEPLOY_SUCCESS=true')
    except BaseException:
        if installed and backup:
            try:
                ftp.cwd(PUBLIC)
                ftp.delete('app.js')
                ftp.rename(backup,'app.js')
                print('N7_INLINE_CORRECTION_ROLLBACK_SUCCESS=true')
            except ftplib.all_errors:
                print('N7_INLINE_CORRECTION_ROLLBACK_MANUAL_REQUIRED=true')
        raise
    finally:
        if stage:
            try:ftp.cwd(PUBLIC);ftp.delete(stage)
            except ftplib.all_errors:pass
        try:ftp.quit()
        except ftplib.all_errors:pass

if __name__=='__main__':main()
