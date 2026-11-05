#!/usr/bin/env python3
"""Safely patch only live N7 public/app.js to allow new chat during legacy queue polling."""
import ftplib
import hashlib
import io
import json
import os
import socket
import ssl
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid

ROOT = '/bot.piratecartography.com/n7-app'
PUBLIC = ROOT + '/public'
TLS = 'linux3087.grserver.gr'
URL = 'https://bot.piratecartography.com'
MARK = 'N7_NONBLOCKING_QUEUE_WATCH_v1'
ANCHOR = "el('chat').onsubmit=async e=>"
OLD_START = "if(reply.pending&&reply.job_id){"
OLD_END = "}else{\nrender(reply.conversation.messages);"
NEW_HELPER = """// N7_NONBLOCKING_QUEUE_WATCH_v1: old queued answers never lock new chat submissions.
function watchQueuedAnswer(jobId, conversationId) {
  void (async()=>{
    let finished=false;
    try {
      for(let attempt=0;attempt<180;attempt++){
        await new Promise(resolve=>setTimeout(resolve,10000));
        const progress=await api('/api/n7/job/'+encodeURIComponent(jobId));
        if(progress.status==='done'){
          if(active===conversationId){
            const updated=await api('/api/conversations/'+conversationId);
            render(updated.conversation.messages);
            el('currenttitle').textContent=updated.conversation.title;
            el('notice').textContent='Η απάντηση της προηγούμενης εργασίας παραδόθηκε.';
          }
          finished=true;break;
        }
        if(progress.status==='failed'){
          if(active===conversationId)el('notice').textContent='Η προηγούμενη εργασία απέτυχε, αλλά μπορείς να συνεχίσεις.';
          finished=true;break;
        }
      }
      if(!finished && active===conversationId)
        el('notice').textContent='Η παλιά εργασία παραμένει σε αναμονή. Μπορείς να συνεχίσεις τη συνομιλία.';
    } catch(err) {
      if(active===conversationId) el('notice').textContent='Έλεγχος παλιάς εργασίας: '+err.message;
    }
  })();
}
"""

def digest(b):
    return hashlib.sha256(b).hexdigest()

def patch(original):
    s=original.decode('utf-8')
    if MARK in s:
        return original
    if s.count(ANCHOR)!=1 or s.count(OLD_START)!=1 or s.count(OLD_END)!=1:
        print('N7_UI_MARKER_COUNTS anchor='+str(s.count(ANCHOR))+' start='+str(s.count(OLD_START))+' end='+str(s.count(OLD_END))+' newline_crlf='+str(s.count('\\r\\n')))
        raise RuntimeError('N7_UNEXPECTED_FRONTEND_STRUCTURE_ABORT')
    start=s.index(OLD_START)
    end=s.index(OLD_END,start)
    original_block=s[start:end]
    # preserve existing user-facing enqueue notice exactly
    notice_lines=[line for line in original_block.splitlines() if "el('notice').textContent=reply.dispatch" in line]
    if len(notice_lines)!=1 or "for(let attempt=0;attempt<180;attempt++)" not in original_block:
        raise RuntimeError('N7_UNEXPECTED_QUEUE_POLL_ABORT')
    new_block=(OLD_START+"\n"+notice_lines[0]+"\n"
               "watchQueuedAnswer(reply.job_id,active);\n")
    s=s[:start]+new_block+s[end:]
    s=s.replace(ANCHOR,NEW_HELPER+"\n"+ANCHOR)
    if s.count(MARK)!=1 or s.count("watchQueuedAnswer(reply.job_id,active)")!=1:
        raise RuntimeError('N7_PATCH_VALIDATION_FAILED')
    return s.encode('utf-8')

def node_check(b):
    with tempfile.NamedTemporaryFile(suffix='.js',mode='wb') as f:
        f.write(b);f.flush()
        r=subprocess.run(['node','--check',f.name],capture_output=True,timeout=20)
        if r.returncode:
            raise RuntimeError('N7_FRONTEND_JS_SYNTAX_FAIL')

def read(ftp,filename):
    chunks=[]
    ftp.retrbinary('RETR '+filename,chunks.append)
    return b''.join(chunks)

def verify_public():
    ctx=ssl.create_default_context()
    with urllib.request.urlopen(URL+'/app.js', timeout=20, context=ctx) as r:
        live=r.read(200000)
        if MARK.encode() not in live:
            raise RuntimeError('N7_LIVE_FRONTEND_NOT_UPDATED')
    with urllib.request.urlopen(URL+'/api/status', timeout=20, context=ctx) as r:
        status=json.loads(r.read(10000))
        if status.get('modelConfigured') is not True:
            raise RuntimeError('N7_DIRECT_MODEL_NOT_READY')
    with urllib.request.urlopen(URL+'/health', timeout=20, context=ctx) as r:
        if json.loads(r.read(10000)).get('status')!='ok':
            raise RuntimeError('N7_HEALTH_FAILED')
    print('N7_QUEUE_WATCH_LIVE_VERIFIED=true modelConfigured=true')

def deploy():
    dry=os.getenv('N7_DRY_RUN','1')!='0'
    host=os.environ['PCT_FTPS_HOST']
    port=int(os.getenv('PCT_FTPS_PORT','21'))
    ips=lambda domain: {x[4][0] for x in socket.getaddrinfo(domain,port,type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):
        raise RuntimeError('N7_FTPS_TLS_HOST_MISMATCH')
    ftp=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
    ftp.connect(host,port);ftp.host=TLS
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    backup=None
    staged=None
    installed=False
    try:
        ftp.cwd(PUBLIC)
        if ftp.pwd().rstrip('/')!=PUBLIC:
            raise RuntimeError('N7_WRONG_FRONTEND_ROOT')
        original=read(ftp,'app.js')
        modified=patch(original)
        node_check(modified)
        print('N7_UI_NONBLOCKING_PREFLIGHT_OK dry_run='+str(dry)
              +' patch_required='+str(original!=modified)
              +' original_sha256='+digest(original))
        if dry:
            return
        if original==modified:
            verify_public()
            return
        suffix=uuid.uuid4().hex[:12]
        staged='.n7-unblock-stage-'+suffix+'.js'
        backup='.n7-unblock-backup-'+suffix+'.js'
        ftp.storbinary('STOR '+staged,io.BytesIO(modified))
        if digest(read(ftp,staged))!=digest(modified):
            raise RuntimeError('N7_UPLOAD_HASH_FAILED')
        ftp.sendcmd('SITE CHMOD 644 '+staged)
        if digest(read(ftp,'app.js'))!=digest(original):
            raise RuntimeError('N7_CONCURRENT_UPDATE_ABORT')
        ftp.rename('app.js',backup)
        try:
            ftp.rename(staged,'app.js')
        except BaseException:
            ftp.rename(backup,'app.js')
            raise
        staged=None
        installed=True
        if digest(read(ftp,'app.js'))!=digest(modified):
            raise RuntimeError('N7_LIVE_HASH_MISMATCH')
        verify_public()
        print('N7_UI_NONBLOCKING_DEPLOY_SUCCESS=true')
    except BaseException:
        if installed and backup:
            try:
                ftp.cwd(PUBLIC)
                ftp.delete('app.js')
                ftp.rename(backup,'app.js')
                print('N7_UI_NONBLOCKING_ROLLBACK_SUCCESS=true')
            except BaseException:
                print('N7_UI_NONBLOCKING_MANUAL_ROLLBACK_REQUIRED=true')
        raise
    finally:
        if staged:
            try: ftp.cwd(PUBLIC);ftp.delete(staged)
            except ftplib.all_errors: pass
        try:ftp.quit()
        except ftplib.all_errors:pass

if __name__=='__main__':
    deploy()
