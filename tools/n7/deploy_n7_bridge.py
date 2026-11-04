#!/usr/bin/env python3
"""Guarded N7 FTPS patch. Private server.js/app.js are read from hosting,
patched only in ephemeral CI memory, never committed to this public repository.
"""
import ftplib,ssl,socket,io,os,re,uuid,hashlib,subprocess,tempfile,json
from pathlib import Path
TLS='linux3087.grserver.gr'
ROOT='/bot.piratecartography.com/n7-app'
PUBLIC=ROOT+'/public'
BASE=Path(__file__).resolve().parents[2]
def digest(b):return hashlib.sha256(b).hexdigest()
def read(ftp,src):
    parts=[];ftp.retrbinary('RETR '+src,parts.append);return b''.join(parts)
def check_js(data,label):
    with tempfile.NamedTemporaryFile('wb',suffix='.js') as t:
        t.write(data);t.flush()
        p=subprocess.run(['node','--check',t.name],capture_output=True,text=True,timeout=20)
        if p.returncode:raise RuntimeError(label+'_SYNTAX_INVALID')
def patch_server(data):
    src=data.decode('utf8')
    if 'n7-queue-bridge' in src and 'n7Relay.handle' in src:return data
    s,n=re.subn(r"(?m)^(const\s*\{\s*createLearningMemory\s*\}\s*=\s*require\(['\"]\./skills/learning['\"]\);)\s*$",
                r"\1\nconst {createN7Relay}=require('./n7-queue-bridge');",src,count=1)
    if n!=1:raise RuntimeError('UNRECOGNIZED_N7_SERVER_IMPORT')
    marker=re.compile(r'(?m)^(\s*const\s+server\s*=\s*http\.createServer\(async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{)')
    if len(marker.findall(s))!=1:raise RuntimeError('UNRECOGNIZED_N7_SERVER_HANDLER')
    shim="""
const n7Relay=createN7Relay({
  dataDir:DATA_DIR,
  authenticated:req=>Boolean(session(req)),
  originOK,
  readBody:body,
  loadConversations:load,
  saveConversations:save,
  modelConfigured:()=>Boolean(API_KEY&&MODEL)
});
"""
    s=marker.sub(lambda m:shim+m.group(1),s,count=1)
    start=s.index('const server')
    m=re.search(r'\btry\s*\{',s[start:start+220])
    if m is None:raise RuntimeError('UNRECOGNIZED_N7_SERVER_TRY')
    at=start+m.end()
    s=s[:at]+"\n    if(await n7Relay.handle(req,res)) return;"+s[at:]
    if s.count('n7Relay.handle(req,res)')!=1:raise RuntimeError('N7_SHIM_INJECTION_COUNT')
    return s.encode('utf8')
def patch_frontend(data):
    src=data.decode('utf8')
    if 'N7_QWEN_ASYNC_POLL' in src:return data
    before="s.modelConfigured?'● Μοντέλο συνδεδεμένο':'○ Χωρίς συνδεδεμένο μοντέλο'"
    after="s.modelConfigured?'● Μοντέλο συνδεδεμένο':s.queueModelAvailable?'◉ Qwen 3B (ιδιωτικό GitHub, αναμονή λίγων λεπτών)':'○ Χωρίς συνδεδεμένο μοντέλο'"
    if src.count(before)!=1:raise RuntimeError('UNRECOGNIZED_N7_MODEL_STATUS')
    src=src.replace(before,after)
    anchor="const reply=await api('/api/conversations/'+active+'/chat',{method:'POST',body:JSON.stringify({message})});render(reply.conversation.messages);el('currenttitle').textContent=reply.conversation.title;await list()"
    if src.count(anchor)!=1:raise RuntimeError('UNRECOGNIZED_N7_CHAT_SUBMIT')
    replacement="""const reply=await api('/api/conversations/'+active+'/chat',{method:'POST',body:JSON.stringify({message})});
// N7_QWEN_ASYNC_POLL: private worker checks a signed queued task.
if(reply.pending&&reply.job_id){
  el('notice').textContent='Η εντολή μπήκε στην ιδιωτική ουρά Qwen. Ο worker εκκινεί ανά 5 λεπτά· η απάντηση μπορεί να καθυστερήσει.';
  let finished=false;
  for(let attempt=0;attempt<180;attempt++){
    await new Promise(resolve=>setTimeout(resolve,10000));
    const progress=await api('/api/n7/job/'+encodeURIComponent(reply.job_id));
    if(progress.status==='done'){
      const updated=await api('/api/conversations/'+active);
      render(updated.conversation.messages);
      el('currenttitle').textContent=updated.conversation.title;
      el('notice').textContent='Η απάντηση του ιδιωτικού Qwen παραδόθηκε.';
      finished=true;break;
    }
    if(progress.status==='failed')throw Error(progress.error||'Ο ιδιωτικός Qwen απέτυχε.');
  }
  if(!finished)el('notice').textContent='Η εργασία παραμένει σε αναμονή. Μπορείς να επιστρέψεις αργότερα στη συνομιλία.';
}else{
  render(reply.conversation.messages);
  el('currenttitle').textContent=reply.conversation.title;
}
await list()"""
    return src.replace(anchor,replacement).encode('utf8')
def stage(ftp,name,data,permissions):
    token=uuid.uuid4().hex[:10]
    staged='.n7stage-'+token+'-'+name
    ftp.storbinary('STOR '+staged,io.BytesIO(data))
    if digest(read(ftp,staged))!=digest(data):
        ftp.delete(staged);raise RuntimeError('FTPS_STAGE_HASH_MISMATCH_'+name)
    backup='.n7before-'+token+'-'+name
    ftp.rename(name,backup)
    try:
        ftp.rename(staged,name)
        if digest(read(ftp,name))!=digest(data):raise RuntimeError('FTPS_FINAL_HASH_MISMATCH_'+name)
        ftp.sendcmd('SITE CHMOD '+permissions+' '+name)
        return backup
    except BaseException:
        try:ftp.delete(name)
        except ftplib.all_errors:pass
        ftp.rename(backup,name)
        raise
def main():
    HOST=os.environ['PCT_FTPS_HOST']
    PORT=int(os.environ.get('PCT_FTPS_PORT','21'))
    BRIDGE=(BASE/'tools/n7/n7-queue-bridge.js').read_bytes()
    DRY=os.environ.get('N7_DRY_RUN')=='1'
    src={a[4][0] for a in socket.getaddrinfo(HOST,PORT,type=socket.SOCK_STREAM)}
    dst={a[4][0] for a in socket.getaddrinfo(TLS,PORT,type=socket.SOCK_STREAM)}
    if not(src & dst):raise SystemExit('FTPS_HOST_TLS_IDENTITY_MISMATCH')
    ftp=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
    ftp.connect(HOST,PORT);ftp.host=TLS
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD']);ftp.prot_p()
    done=[]
    try:
        ftp.cwd(ROOT)
        if ftp.pwd().rstrip('/')!=ROOT:raise RuntimeError('ROOT_PATH_DRIFT')
        old_server=read(ftp,'server.js')
        ftp.cwd(PUBLIC)
        if ftp.pwd().rstrip('/')!=PUBLIC:raise RuntimeError('PUBLIC_PATH_DRIFT')
        old_frontend=read(ftp,'app.js')
        server=patch_server(old_server)
        frontend=patch_frontend(old_frontend)
        for name,data in [('n7_queue_module',BRIDGE),('server.js',server),('public/app.js',frontend)]:check_js(data,name)
        print('N7_PATCH_VALIDATION '+json.dumps({'dry_run':DRY,'server_changed':server!=old_server,
            'frontend_changed':frontend!=old_frontend,'module_sha256':digest(BRIDGE),
            'source_files_read_from_private_host':True,'source_files_committed_to_public_repo':False}))
        if DRY:return
        if digest(read(ftp,'app.js'))!=digest(old_frontend):raise RuntimeError('FRONTEND_CHANGED_CONCURRENTLY')
        ftp.cwd(ROOT)
        if digest(read(ftp,'server.js'))!=digest(old_server):raise RuntimeError('SERVER_CHANGED_CONCURRENTLY')
        names={n.rsplit('/',1)[-1] for n in ftp.nlst()}
        if 'n7-queue-bridge.js' in names:raise RuntimeError('QUEUE_MODULE_ALREADY_EXISTS_ABORT')
        ftp.storbinary('STOR n7-queue-bridge.js',io.BytesIO(BRIDGE))
        if digest(read(ftp,'n7-queue-bridge.js'))!=digest(BRIDGE):raise RuntimeError('N7_MODULE_SHA_MISMATCH')
        ftp.sendcmd('SITE CHMOD 600 n7-queue-bridge.js')
        done.append(('NEW_MODULE','n7-queue-bridge.js',None,ROOT))
        ftp.cwd(PUBLIC)
        b=stage(ftp,'app.js',frontend,'644');done.append(('BACKUP','app.js',b,PUBLIC))
        ftp.cwd(ROOT)
        b=stage(ftp,'server.js',server,'600');done.append(('BACKUP','server.js',b,ROOT))
        ftp.cwd(ROOT+'/tmp')
        ftp.storbinary('STOR restart.txt',io.BytesIO(b'n7-qwen-queue-update\n'))
        print('N7_FTPS_BRIDGE_INSTALLED '+json.dumps({'server_updated':True,'frontend_updated':True,
          'backups_kept':True,'passenger_restart_requested':True,'other_domains_untouched':True}))
    except BaseException:
        if not DRY:
            for typ,name,backup,dir in reversed(done):
                try:
                    ftp.cwd(dir)
                    if typ=='NEW_MODULE':ftp.delete(name)
                    else:
                        ftp.delete(name);ftp.rename(backup,name)
                except ftplib.all_errors:print('N7_ROLLBACK_MANUAL_INSPECTION_NEEDED '+name)
        raise
    finally:ftp.quit()
if __name__=='__main__':main()
