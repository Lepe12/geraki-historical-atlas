#!/usr/bin/env python3
"""Deploy the explicitly owner-approved N7 editing skill memory to live Top.Host.

Scoped to server.js, public/app.js and one non-secret backend module. Preserves
existing Groq configuration, skill registry, conversations, keys and job queue.
"""
import ftplib, hashlib, io, json, os, re, socket, ssl, subprocess, tempfile, urllib.request, urllib.error, uuid
from pathlib import Path
ROOT='/bot.piratecartography.com/n7-app'
PUBLIC=ROOT+'/public'
TLS='linux3087.grserver.gr'
BASE='https://bot.piratecartography.com'
HERE=Path(__file__).resolve().parent
MARKER='N7_OWNER_CHAT_LEARNING_V1'
HELPER='owner-chat-memory.js'

def sha(b):return hashlib.sha256(b).hexdigest()
def read(ftp,name):
    chunks=[]
    ftp.retrbinary('RETR '+name,chunks.append)
    return b''.join(chunks)
def optional_read(ftp,name):
    try:return read(ftp,name)
    except ftplib.error_perm as e:
        if str(e).startswith('550 '):return None
        raise
def check(b):
    with tempfile.NamedTemporaryFile(suffix='.js',mode='wb') as f:
        f.write(b);f.flush()
        p=subprocess.run(['node','--check',f.name],capture_output=True,timeout=20)
        if p.returncode:raise RuntimeError('N7_INVALID_JS_ABORT')
def server_patch(original):
    src=original.decode('utf8')
    if MARKER in src:return original
    if src.count('async function answer(messages)')!=1 or src.count("const learning=createLearningMemory(")!=1:
        raise RuntimeError('N7_WRONG_LIVE_SERVER_ABORT')
    if "if(!session(req))return json(res,401,{error:'Authentication required'});" not in src:
        raise RuntimeError('N7_MISSING_AUTH_CHECK_ABORT')
    if 'N7_FAST_GROQ_BOOTSTRAP_v1' not in src or 'N7_COMPLETE_OUTPUT_V1' not in src:
        raise RuntimeError('N7_LIVE_GROQ_OR_COMPLETION_GUARD_MISSING')
    line='const learning=createLearningMemory('
    pos=src.index('\n',src.index(line))
    src=src[:pos+1]+(
      "const {createOwnerChatMemory}=require('./owner-chat-memory');\n"
      "const ownerChatMemory=createOwnerChatMemory(DATA_DIR,path.join(__dirname,'skills'));\n"
    )+src[pos+1:]
    anchor='async function answer(messages) {'
    wrapper="""// N7_OWNER_CHAT_LEARNING_V1
const n7OriginalPromptMessages=promptMessages;
promptMessages=function(history){
  const prepared=n7OriginalPromptMessages(history);
  try{
    const guidance=ownerChatMemory.context(history);
    if(guidance && prepared[0] && prepared[0].role==='system')
      prepared[0].content+='\\n\\n'+guidance;
  }catch(_){console.error('N7_OWNER_MEMORY_CONTEXT_UNAVAILABLE');}
  return prepared;
};
"""
    src=src.replace(anchor,wrapper+anchor,1)
    guard="if(!session(req))return json(res,401,{error:'Authentication required'});"
    routes="""
    // Owner-reviewed writing knowledge: authenticated only, never silently derived from chats.
    if(req.method==='GET'&&p==='/api/n7/approved-lessons'){
      try{return json(res,200,{lessons:ownerChatMemory.list()});}
      catch(e){return json(res,500,{error:'Writing memory unavailable'});}
    }
    if(req.method==='POST'&&p==='/api/n7/approved-lessons'){
      try{const b=await body(req);return json(res,201,{lesson:ownerChatMemory.add(b.rule)});}
      catch(e){return json(res,400,{error:String(e.message||'Invalid owner rule')});}
    }
    const forgetMatch=p.match(/^\\/api\\/n7\\/approved-lessons\\/([0-9a-f-]{36})$/);
    if(req.method==='DELETE'&&forgetMatch){
      try{return ownerChatMemory.remove(forgetMatch[1])?json(res,200,{deleted:true}):
        json(res,404,{error:'Rule not found'});}
      catch(e){return json(res,500,{error:'Writing memory unavailable'});}
    }
"""
    src=src.replace(guard,guard+'\n'+routes,1)
    if src.count(MARKER)!=1:raise RuntimeError('N7_MEMORY_PATCH_ASSERTION')
    return src.encode('utf8')
def app_patch(original):
    s=original.decode('utf8')
    if 'N7_OWNER_MEMORY_UI_V1' in s:return original
    if s.count("const el=id=>document.getElementById(id);")!=1 or "el('chat').onsubmit=" not in s:
        raise RuntimeError('N7_UNEXPECTED_FRONTEND_ABORT')
    return (s+'\n'+(HERE/'owner-chat-ui.js').read_text('utf8')+'\n').encode('utf8')
def connect():
    host=os.environ['PCT_FTPS_HOST'];port=int(os.getenv('PCT_FTPS_PORT','21'))
    ips=lambda x:{r[4][0] for r in socket.getaddrinfo(x,port,type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):raise RuntimeError('N7_HOST_TLS_MISMATCH')
    ftp=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
    ftp.connect(host,port);ftp.host=TLS
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p();return ftp
def restart(ftp,tag):
    ftp.cwd(ROOT+'/tmp')
    ftp.storbinary('STOR restart.txt',io.BytesIO(('n7-owner-memory-'+tag+'\n').encode()))
def live_verify():
    sslctx=ssl.create_default_context()
    def fetch(p):
        with urllib.request.urlopen(urllib.request.Request(BASE+p,headers={
          'Cache-Control':'no-cache','User-Agent':'N7-owner-memory-verify/1'
        }),timeout=16,context=sslctx) as r:
            return r.status,r.read(200000)
    for p in ('/health','/api/status'):
        status,blob=fetch(p)
        if status!=200 or json.loads(blob).get('modelConfigured') is not True:
            raise RuntimeError('N7_MODEL_OR_HEALTH_FAILED')
    st,app=fetch('/app.js')
    if st!=200 or b'N7_OWNER_MEMORY_UI_V1' not in app:
        raise RuntimeError('N7_OWNER_MEMORY_UI_NOT_LIVE')
    try:
        fetch('/api/n7/approved-lessons')
        raise RuntimeError('N7_OWNER_MEMORY_UNAUTHENTICATED_ACCESS')
    except urllib.error.HTTPError as e:
        if e.code!=401:raise
    print('N7_OWNER_MEMORY_LIVE_VERIFIED=true Groq=true auth=401 new_ui=true')
def deploy():
    dry=os.getenv('N7_DRY_RUN','1')!='0'
    ftp=connect(); backups=[]; stages=[]; created_helper=False
    token=uuid.uuid4().hex[:12]
    try:
        ftp.cwd(ROOT)
        if ftp.pwd().rstrip('/')!=ROOT:raise RuntimeError('N7_SERVER_ROOT_MISMATCH')
        old_server=read(ftp,'server.js')
        old_helper=optional_read(ftp,HELPER)
        helper=(HERE/HELPER).read_bytes()
        if old_helper is not None and old_helper!=helper:raise RuntimeError('N7_EXISTING_HELPER_DIFFERENT_ABORT')
        ftp.cwd(PUBLIC)
        if ftp.pwd().rstrip('/')!=PUBLIC:raise RuntimeError('N7_PUBLIC_ROOT_MISMATCH')
        old_app=read(ftp,'app.js')
        new_server=server_patch(old_server);new_app=app_patch(old_app)
        for b in (helper,new_server,new_app):check(b)
        print('N7_OWNER_MEMORY_PREFLIGHT_OK dry_run='+str(dry)
              +' new_helper=' + str(old_helper is None)
              +' server_change='+str(new_server!=old_server)
              +' ui_change='+str(new_app!=old_app))
        if dry:return
        # Install helper before server begins requiring it.
        if old_helper is None:
            ftp.cwd(ROOT)
            stage='.n7-learning-helper-'+token+'.js'
            ftp.storbinary('STOR '+stage,io.BytesIO(helper));stages.append((ROOT,stage))
            ftp.sendcmd('SITE CHMOD 644 '+stage)
            if sha(read(ftp,stage))!=sha(helper):raise RuntimeError('N7_HELPER_INTEGRITY_FAILED')
            ftp.rename(stage,HELPER);stages.remove((ROOT,stage))
            created_helper=True
        for directory,name,previous,updated in (
            (ROOT,'server.js',old_server,new_server),
            (PUBLIC,'app.js',old_app,new_app)):
            if previous==updated:continue
            ftp.cwd(directory)
            if sha(read(ftp,name))!=sha(previous):raise RuntimeError('N7_CONCURRENT_UPDATE_'+name)
            stage='.n7-learning-stage-'+token+'-'+name
            backup='.n7-learning-backup-'+token+'-'+name
            ftp.storbinary('STOR '+stage,io.BytesIO(updated));stages.append((directory,stage))
            ftp.sendcmd('SITE CHMOD 644 '+stage)
            if sha(read(ftp,stage))!=sha(updated):raise RuntimeError('N7_STAGE_INTEGRITY_FAILED')
            ftp.rename(name,backup)
            try:ftp.rename(stage,name)
            except BaseException:ftp.rename(backup,name);raise
            stages.remove((directory,stage));backups.append((directory,name,backup))
            if sha(read(ftp,name))!=sha(updated):raise RuntimeError('N7_FINAL_HASH_FAILED')
        restart(ftp,'activate')
        live_verify()
        print('N7_OWNER_MEMORY_DEPLOY_SUCCESS=true')
    except BaseException:
        if not dry and (backups or created_helper):
            for directory,name,backup in reversed(backups):
                try:
                    ftp.cwd(directory);ftp.delete(name);ftp.rename(backup,name)
                except ftplib.all_errors:print('N7_OWNER_MEMORY_MANUAL_ROLLBACK_NEEDED='+name)
            if created_helper:
                try:ftp.cwd(ROOT);ftp.delete(HELPER)
                except ftplib.all_errors:print('N7_OWNER_MEMORY_HELPER_CLEANUP_FAILED')
            try:restart(ftp,'rollback')
            except ftplib.all_errors:pass
            print('N7_OWNER_MEMORY_ROLLBACK_ATTEMPTED=true')
        raise
    finally:
        for directory,name in stages:
            try:ftp.cwd(directory);ftp.delete(name)
            except ftplib.all_errors:pass
        try:ftp.quit()
        except ftplib.all_errors:pass
if __name__=='__main__':deploy()
