#!/usr/bin/env python3
"""Scope-limited production deployment of N7's per-chat real Athens clock.

Only the existing Node server.js and the NEW nonsecret helper n7-live-clock-guard.js
are modified. Original server is backed up and rolled back on health failure.
No changes to Groq provider, owner memory, conversations, jobs, 3D atlas, UI.
"""
import ftplib,hashlib,io,json,os,secrets,socket,ssl,subprocess,tempfile,urllib.request,urllib.error
from pathlib import Path
ROOT='/bot.piratecartography.com/n7-app'
PUBLIC='https://bot.piratecartography.com'
TLS='linux3087.grserver.gr'
HELPER='n7-live-clock-guard.js'
MARKER='N7_REALTIME_CLOCK_INJECTION_V1'
ANCHOR='async function answer(messages) {'
HERE=Path(__file__).resolve().parent

def digest(data):return hashlib.sha256(data).hexdigest()
def read(ftp,name):
    chunks=[]
    ftp.retrbinary('RETR '+name,chunks.append)
    return b''.join(chunks)
def optional_read(ftp,name):
    try:return read(ftp,name)
    except ftplib.error_perm as error:
        if str(error).startswith('550 '):return None
        raise
def syntax(js):
    with tempfile.NamedTemporaryFile(mode='wb',suffix='.js') as f:
        f.write(js);f.flush()
        result=subprocess.run(['node','--check',f.name],capture_output=True,timeout=20)
        if result.returncode:raise RuntimeError('N7_CLOCK_PATCH_SYNTAX_ERROR')
def patch(source):
    text=source.decode('utf8')
    if MARKER in text:return source
    if text.count(ANCHOR)!=1 or 'N7_OWNER_CHAT_LEARNING_V1' not in text:
        raise RuntimeError('N7_UNEXPECTED_LIVE_PROMPT_LAYOUT_ABORT')
    if 'N7_COMPLETE_OUTPUT_V1' not in text or 'N7_FAST_GROQ_BOOTSTRAP_v1' not in text:
        raise RuntimeError('N7_GROQ_OR_CONTINUATION_GUARD_MISSING')
    snippet=(
      '// N7_REALTIME_CLOCK_INJECTION_V1: applied after reviewed owner Skills/memory.\n'
      "const {installClockGuard}=require('./n7-live-clock-guard');\n"
      'promptMessages=installClockGuard(promptMessages);\n'
    )
    return text.replace(ANCHOR,snippet+ANCHOR,1).encode('utf8')
def connect():
    host=os.environ['PCT_FTPS_HOST']
    port=int(os.getenv('PCT_FTPS_PORT','21'))
    addresses=lambda x:{v[4][0] for v in socket.getaddrinfo(x,port,type=socket.SOCK_STREAM)}
    if not addresses(host).intersection(addresses(TLS)):
        raise RuntimeError('N7_FTPS_HOST_MISMATCH')
    ftp=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
    ftp.connect(host,port);ftp.host=TLS
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    return ftp
def restart(ftp,tag):
    ftp.cwd(ROOT+'/tmp')
    ftp.storbinary('STOR restart.txt',io.BytesIO(('n7-clock-'+tag+'\n').encode()))
def probe():
    context=ssl.create_default_context()
    for path in ('/health','/api/status'):
        with urllib.request.urlopen(urllib.request.Request(PUBLIC+path,headers={
          'Cache-Control':'no-cache','User-Agent':'N7-clock-probe/1'
        }),timeout=15,context=context) as response:
            data=json.loads(response.read(15000))
            if response.status!=200 or data.get('modelConfigured') is not True:
                raise RuntimeError('N7_LIVE_MODEL_NOT_READY')
    request=urllib.request.Request(PUBLIC+'/api/n7/approved-lessons',headers={
        'Cache-Control':'no-cache','User-Agent':'N7-clock-probe/1'})
    try:
        urllib.request.urlopen(request,timeout=12,context=context)
        raise RuntimeError('N7_OWNER_LESSONS_UNAUTHENTICATED')
    except urllib.error.HTTPError as e:
        if e.code!=401:raise
    print('N7_CLOCK_LIVE_HEALTH_VERIFIED=true; groq_configured=true; owner_memory_auth=401')

def main():
    dry=os.environ.get('N7_DRY_RUN','1')!='0'
    ftp=connect()
    helper_created=False
    stage=None;backup=None;server_installed=False
    try:
        ftp.cwd(ROOT)
        if ftp.pwd().rstrip('/')!=ROOT:raise RuntimeError('N7_WRONG_FTPS_DIRECTORY')
        original=read(ftp,'server.js')
        updated=patch(original)
        helper=(HERE/'live-clock-guard.js').read_bytes()
        existing_helper=optional_read(ftp,HELPER)
        if existing_helper is not None and existing_helper!=helper:
            raise RuntimeError('N7_CLOCK_HELPER_CONFLICT')
        syntax(helper);syntax(updated)
        print('N7_CLOCK_PREFLIGHT_OK dry_run='+str(dry)
              +' update_required='+str(updated!=original)
              +' new_helper='+str(existing_helper is None)
              +' original_sha256='+digest(original))
        if dry:return
        if existing_helper is None:
            stage='.n7-clock-helper-stage-'+secrets.token_hex(6)+'.js'
            ftp.storbinary('STOR '+stage,io.BytesIO(helper))
            ftp.sendcmd('SITE CHMOD 644 '+stage)
            if digest(read(ftp,stage))!=digest(helper):
                raise RuntimeError('N7_CLOCK_HELPER_HASH_MISMATCH')
            ftp.rename(stage,HELPER);stage=None;helper_created=True
        if updated!=original:
            stage='.n7-clock-server-stage-'+secrets.token_hex(6)+'.js'
            backup='.n7-clock-server-backup-'+secrets.token_hex(6)+'.js'
            ftp.cwd(ROOT)
            ftp.storbinary('STOR '+stage,io.BytesIO(updated))
            ftp.sendcmd('SITE CHMOD 644 '+stage)
            if digest(read(ftp,stage))!=digest(updated):
                raise RuntimeError('N7_CLOCK_STAGE_HASH_MISMATCH')
            if digest(read(ftp,'server.js'))!=digest(original):
                raise RuntimeError('N7_CLOCK_CONCURRENT_CHANGE')
            ftp.rename('server.js',backup)
            try:ftp.rename(stage,'server.js')
            except BaseException:ftp.rename(backup,'server.js');backup=None;raise
            stage=None;server_installed=True
            if digest(read(ftp,'server.js'))!=digest(updated):
                raise RuntimeError('N7_CLOCK_READBACK_HASH_MISMATCH')
        restart(ftp,'activate')
        probe()
        print('N7_CLOCK_DEPLOY_SUCCESS=true')
    except BaseException:
        if not dry and (server_installed or helper_created):
            if server_installed and backup:
                try:
                    ftp.cwd(ROOT);ftp.delete('server.js');ftp.rename(backup,'server.js')
                    print('N7_CLOCK_SERVER_ROLLBACK=true')
                except ftplib.all_errors:print('N7_CLOCK_SERVER_ROLLBACK_MANUAL_REQUIRED=true')
            if helper_created:
                try:ftp.cwd(ROOT);ftp.delete(HELPER)
                except ftplib.all_errors:print('N7_CLOCK_HELPER_CLEANUP_MANUAL_REQUIRED=true')
            try:restart(ftp,'rollback')
            except ftplib.all_errors:pass
        raise
    finally:
        if stage:
            try:ftp.cwd(ROOT);ftp.delete(stage)
            except ftplib.all_errors:pass
        try:ftp.quit()
        except ftplib.all_errors:pass
if __name__=='__main__':main()
