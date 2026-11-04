#!/usr/bin/env python3
"""Deploy only approved N7 avatar behavior into existing Plesk N7 frontend via FTPS.
Never touches NABOU, Plesk credentials, backend, authentication or model.
"""
import ftplib, ssl, socket, io, os, hashlib, uuid, subprocess, tempfile, urllib.request, time
from pathlib import Path

ROOT='/bot.piratecartography.com/n7-app/public'
TLS='linux3087.grserver.gr'
SOURCE=Path(__file__).with_name('n7-approved-character.js')
MARKER=b'N7_APPROVED_CHARACTER_V1'
def sha(x):return hashlib.sha256(x).hexdigest()
def read(ftp,name):
    data=[]
    ftp.retrbinary('RETR '+name,data.append)
    return b''.join(data)
def syntax(content):
    with tempfile.NamedTemporaryFile(suffix='.js',mode='wb') as f:
        f.write(content);f.flush()
        p=subprocess.run(['node','--check',f.name],capture_output=True,timeout=20)
        if p.returncode:raise RuntimeError('N7_UI_JS_SYNTAX_FAILED')
def connect():
    host=os.environ['PCT_FTPS_HOST']
    port=int(os.environ.get('PCT_FTPS_PORT','21'))
    a={x[4][0] for x in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    b={x[4][0] for x in socket.getaddrinfo(TLS,port,type=socket.SOCK_STREAM)}
    if not a.intersection(b):raise RuntimeError('N7_TLS_IDENTITY_MISMATCH')
    ftp=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
    ftp.connect(host,port);ftp.host=TLS
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p();ftp.cwd(ROOT)
    if ftp.pwd().rstrip('/')!=ROOT:raise RuntimeError('WRONG_FTPS_DIRECTORY')
    return ftp
def main():
    patch=SOURCE.read_bytes()
    if MARKER not in patch:raise RuntimeError('CHARACTER_SOURCE_MISSING')
    syntax(patch)
    ftp=connect()
    stage=None;backup=None;switched=False
    try:
        existing=read(ftp,'app.js')
        if len(existing)>300_000 or len(existing)<1_000 or b'/api/conversations/' not in existing or b'/api/tasks' not in existing:
            raise RuntimeError('UNRECOGNIZED_N7_FRONTEND_ABORT')
        if MARKER in existing:
            start=existing.rfind(b'/* N7_APPROVED_CHARACTER_V1:')
            if start<0:raise RuntimeError('UNKNOWN_EXISTING_N7_CHARACTER_LAYOUT')
            # Keep the entire original private app and replace only the
            # previously appended N7 character payload.
            original=existing[:start].rstrip()
        else:
            original=existing.rstrip()
        combined=original+b'\n\n'+patch+b'\n'
        if combined==existing:
            print('N7_CHARACTER_ALREADY_DEPLOYED '+sha(existing));return
        syntax(combined)
        token=uuid.uuid4().hex[:12]
        stage='.n7-avatar-stage-'+token+'.js'
        backup='.n7-avatar-backup-'+token+'.js'
        ftp.storbinary('STOR '+stage,io.BytesIO(combined))
        if sha(read(ftp,stage))!=sha(combined):raise RuntimeError('STAGE_HASH_MISMATCH')
        if sha(read(ftp,'app.js'))!=sha(existing):raise RuntimeError('CONCURRENT_MODIFICATION_ABORT')
        ftp.rename('app.js',backup)
        try:
            ftp.rename(stage,'app.js');switched=True
        except BaseException:
            ftp.rename(backup,'app.js');backup=None;raise
        ftp.sendcmd('SITE CHMOD 644 app.js')
        if sha(read(ftp,'app.js'))!=sha(combined):raise RuntimeError('FINAL_HASH_MISMATCH')
        verified=False
        for attempt in range(5):
            try:
                with urllib.request.urlopen(urllib.request.Request(
                    'https://bot.piratecartography.com/app.js',
                    headers={'Cache-Control':'no-cache','User-Agent':'N7-character-live-verify'}
                ),timeout=12,context=ssl.create_default_context()) as res:
                    body=res.read(450000)
                    if res.status==200 and MARKER in body:verified=True;break
            except Exception:pass
            time.sleep(2)
        if not verified:raise RuntimeError('LIVE_AVATAR_JS_NOT_VISIBLE')
        print('N7_AVATAR_DEPLOYED_VERIFIED '+sha(combined))
        print('N7_ONLY_FRONTEND_CHANGED=TRUE')
        print('N7_BACKUP_PRESERVED=TRUE')
    except BaseException:
        if switched and backup:
            try:
                ftp.delete('app.js')
                ftp.rename(backup,'app.js')
                print('N7_CHARACTER_ROLLBACK_DONE')
            except ftplib.all_errors:
                print('N7_CHARACTER_ROLLBACK_MANUAL_CHECK_REQUIRED')
        raise
    finally:
        if stage:
            try:ftp.delete(stage)
            except ftplib.all_errors:pass
        ftp.quit()
if __name__=='__main__':main()
