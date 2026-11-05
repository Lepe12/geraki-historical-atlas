#!/usr/bin/env python3
"""Guarded FTPS deployment of N7 public RSS + Wikimedia research.

Adds fixed-endpoint, bounded read-only retrieval to live Groq chat. Retains
original chat, memory, clock, continuation and all other files. No secrets.
"""
import ftplib,hashlib,io,json,os,secrets,socket,ssl,subprocess,tempfile,urllib.request,urllib.error
from pathlib import Path
ROOT='/bot.piratecartography.com/n7-app'
PUBLIC='https://bot.piratecartography.com'
TLS='linux3087.grserver.gr'
HELPER='n7-public-web-search.js'
MARKER='N7_PUBLIC_WEB_GROUNDING_V1'
HERE=Path(__file__).resolve().parent
def sha(data):return hashlib.sha256(data).hexdigest()
def read(ftp,name):
    parts=[];ftp.retrbinary('RETR '+name,parts.append)
    return b''.join(parts)
def try_read(ftp,name):
    try:return read(ftp,name)
    except ftplib.error_perm as e:
        if str(e).startswith('550 '):return None
        raise
def nodecheck(data):
    with tempfile.NamedTemporaryFile(suffix='.js',mode='wb') as f:
        f.write(data);f.flush()
        r=subprocess.run(['node','--check',f.name],capture_output=True,text=True,timeout=20)
        if r.returncode:raise RuntimeError('N7_WEB_JS_SYNTAX_FAIL')
def patch(old):
    source=old.decode('utf8')
    if MARKER in source:return old
    anchor='async function answer(messages) {'
    msg='  const initialMessages = promptMessages(messages);'
    ret="    if (choice.finish_reason !== 'length') return complete;"
    if source.count(anchor)!=1 or source.count(msg)!=1 or source.count(ret)!=1:
        raise RuntimeError('N7_WEB_UNEXPECTED_LIVE_ANSWER_ABORT')
    for must in ('N7_REALTIME_CLOCK_INJECTION_V1','N7_OWNER_CHAT_LEARNING_V1',
                 'N7_COMPLETE_OUTPUT_V1','N7_FAST_GROQ_BOOTSTRAP_v1'):
        if must not in source:raise RuntimeError('N7_WEB_PRIOR_FIX_MISSING')
    init="""// N7_PUBLIC_WEB_GROUNDING_V1: independent bounded public search, no third-party API key.
const n7PublicSearch = require('./n7-public-web-search');
"""
    source=source.replace(anchor,init+anchor,1)
    request="""  let n7WebEvidence = null;
  try {
    n7WebEvidence = await n7PublicSearch.researchMessages(messages);
    if(n7WebEvidence.searched)
      console.log('N7_WEB_RESEARCH searched=true sources='+n7WebEvidence.items.length+
        ' providers='+n7WebEvidence.availableProviders);
  } catch(_error) {
    console.warn('N7_WEB_RESEARCH_UNAVAILABLE');
    n7WebEvidence = {searched:true,items:[],reason:'search_failed'};
  }
  const n7SourceContext = n7PublicSearch.contextForResearch(n7WebEvidence);
  if(n7SourceContext && initialMessages[0]?.role==='system')
    initialMessages[0].content += '\\n\\n' + n7SourceContext;
"""
    source=source.replace(msg,msg+'\n'+request,1)
    source=source.replace(ret,
        "    if (choice.finish_reason !== 'length') return complete + n7PublicSearch.sourceFooter(n7WebEvidence);",1)
    if source.count(MARKER)!=1:raise RuntimeError('N7_WEB_PATCH_MARKER_WRONG')
    return source.encode('utf8')
def connect():
    host=os.environ['PCT_FTPS_HOST'];port=int(os.getenv('PCT_FTPS_PORT','21'))
    ips=lambda h:{r[4][0] for r in socket.getaddrinfo(h,port,type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):raise RuntimeError('N7_WEB_FTPS_HOST_MISMATCH')
    ftp=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
    ftp.connect(host,port);ftp.host=TLS
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    return ftp
def restart(ftp,kind):
    ftp.cwd(ROOT+'/tmp')
    ftp.storbinary('STOR restart.txt',io.BytesIO(('n7-web-'+kind+'\n').encode()))
def verify():
    ctx=ssl.create_default_context()
    for path in ('/health','/api/status'):
        with urllib.request.urlopen(urllib.request.Request(PUBLIC+path,headers={
            'Cache-Control':'no-cache','User-Agent':'N7-web-safe-verify/1'
        }),timeout=14,context=ctx) as r:
            status=json.loads(r.read(15000))
            if r.status!=200 or status.get('modelConfigured') is not True:
                raise RuntimeError('N7_WEB_PROVIDER_HEALTH_FAIL')
    try:
        urllib.request.urlopen(urllib.request.Request(PUBLIC+'/api/n7/approved-lessons',
            headers={'User-Agent':'N7-web-safe-verify/1'}),timeout=12,context=ctx)
        raise RuntimeError('N7_WEB_OWNER_MEMORY_AUTH_BROKEN')
    except urllib.error.HTTPError as e:
        if e.code!=401:raise
    with urllib.request.urlopen(urllib.request.Request(PUBLIC+'/app.js',
        headers={'Cache-Control':'no-cache'}),timeout=12,context=ctx) as r:
        js=r.read(250000)
        if r.status!=200 or b'N7_CHAT_CORRECTION_CONFIRM_V1' not in js:
            raise RuntimeError('N7_WEB_EXISTING_FRONTEND_NOT_AVAILABLE')
    print('N7_WEB_LIVE_HEALTH_OK=true; groqConfigured=true; memoryPrivate=true; inlineLearning=true')
def main():
    dry=os.getenv('N7_DRY_RUN','1')!='0'
    ftp=connect();stage=None;backup=None;helper_installed=False;installed=False
    try:
        ftp.cwd(ROOT)
        if ftp.pwd().rstrip('/')!=ROOT:raise RuntimeError('N7_WEB_BAD_ROOT')
        old=read(ftp,'server.js')
        new=patch(old)
        helper=(HERE/'public-web-search.js').read_bytes()
        previous_helper=try_read(ftp,HELPER)
        if previous_helper is not None and previous_helper!=helper:
            raise RuntimeError('N7_WEB_HELPER_CONFLICT')
        nodecheck(helper);nodecheck(new)
        print('N7_WEB_PREFLIGHT_OK dry_run='+str(dry)
              +' new_helper='+str(previous_helper is None)
              +' server_change='+str(new!=old)
              +' original_sha256='+sha(old))
        if dry:return
        if previous_helper is None:
            stage='.n7-web-helper-stage-'+secrets.token_hex(7)+'.js'
            ftp.storbinary('STOR '+stage,io.BytesIO(helper))
            ftp.sendcmd('SITE CHMOD 644 '+stage)
            if sha(read(ftp,stage))!=sha(helper):raise RuntimeError('N7_WEB_HELPER_HASH_FAIL')
            ftp.rename(stage,HELPER);stage=None;helper_installed=True
        if new!=old:
            stage='.n7-web-server-stage-'+secrets.token_hex(7)+'.js'
            backup='.n7-web-server-backup-'+secrets.token_hex(7)+'.js'
            ftp.cwd(ROOT)
            ftp.storbinary('STOR '+stage,io.BytesIO(new))
            ftp.sendcmd('SITE CHMOD 644 '+stage)
            if sha(read(ftp,stage))!=sha(new):raise RuntimeError('N7_WEB_STAGE_HASH_FAIL')
            if sha(read(ftp,'server.js'))!=sha(old):raise RuntimeError('N7_WEB_CONCURRENT_CHANGE')
            ftp.rename('server.js',backup)
            try:ftp.rename(stage,'server.js')
            except BaseException:ftp.rename(backup,'server.js');backup=None;raise
            stage=None;installed=True
            if sha(read(ftp,'server.js'))!=sha(new):raise RuntimeError('N7_WEB_READBACK_HASH_FAIL')
        restart(ftp,'activate')
        verify()
        print('N7_WEB_DEPLOY_SUCCESS=true')
    except BaseException:
        if not dry and (installed or helper_installed):
            if installed and backup:
                try:
                    ftp.cwd(ROOT);ftp.delete('server.js');ftp.rename(backup,'server.js')
                    print('N7_WEB_SERVER_ROLLBACK_OK=true')
                except ftplib.all_errors:print('N7_WEB_SERVER_MANUAL_ROLLBACK=true')
            if helper_installed:
                try:ftp.cwd(ROOT);ftp.delete(HELPER)
                except ftplib.all_errors:print('N7_WEB_HELPER_MANUAL_CLEANUP=true')
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
