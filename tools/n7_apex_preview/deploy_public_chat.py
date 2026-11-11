#!/usr/bin/env python3
"""Install only stateless public figure chat; preserve all owner auth and data."""
import hashlib,io,json,os,pathlib,re,secrets,ssl,subprocess,tempfile,time,urllib.request,urllib.error
from deploy_apex_preview import connect
ROOT='/bot.piratecartography.com/n7-app'
BASE='https://bot.piratecartography.com'
MARKER='N7_APEX_PASSWORDLESS_CHAT_V1'
def read(ftp,name):
    parts=[];ftp.retrbinary('RETR '+name,parts.append);return b''.join(parts)
def sha(b):return hashlib.sha256(b).hexdigest()
def patch(data):
    src=data.decode()
    if MARKER in src:return data
    for symbol in ['API_KEY','MODEL','BASE']:
        if not re.search(r'\bconst\s+'+symbol+r'\s*=',src):raise RuntimeError('MISSING_PROVIDER_BINDING_'+symbol)
    pattern=r'(const\s+server\s*=\s*http\.createServer\(async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{)'
    if len(re.findall(pattern,src))!=1:raise RuntimeError('UNRECOGNIZED_HTTP_SERVER')
    shim="// "+MARKER+"\nconst n7ApexPublic=require('./n7-apex-public-chat.cjs').createApexPublicChat({apiKey:API_KEY,model:MODEL,base:BASE});\n"
    guard="\n  try { if(await n7ApexPublic.handle(req,res)) return; } catch { res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Η συνομιλία δεν ολοκληρώθηκε.'}));return; }\n"
    return re.sub(pattern,lambda m:shim+m.group(1)+guard,src,count=1).encode()
def syntax(data):
    with tempfile.NamedTemporaryFile(suffix='.cjs') as f:
        f.write(data);f.flush();p=subprocess.run(['node','--check',f.name],capture_output=True,timeout=20)
        if p.returncode:raise RuntimeError('INVALID_NODE_SYNTAX')
def verify(real_model=True):
    for attempt in range(12):
        try:
            with urllib.request.urlopen(BASE+'/api/n7-apex/status',timeout=12) as r:s=json.load(r)
            if s.get('passwordRequired') is False and s.get('available') is True:break
        except (OSError,ValueError):pass
        time.sleep(2)
    else:raise RuntimeError('PUBLIC_CHAT_NOT_READY')
    if real_model:
        smoke=urllib.request.Request(BASE+'/api/n7-apex/chat',data=json.dumps({'messages':[{'role':'user','content':'Απάντησε μόνο με τη λέξη ΕΤΟΙΜΟ.'}]}).encode(),headers={'Content-Type':'application/json','Origin':BASE})
        with urllib.request.urlopen(smoke,timeout=55) as r:answer=json.load(r)
        if not isinstance(answer.get('reply'),str) or not answer['reply'].strip():raise RuntimeError('PUBLIC_MODEL_NO_REPLY')
        print('APEX_PUBLIC_REAL_MODEL_REPLY_VERIFIED=true')
    for path in ['/api/conversations','/api/tasks']:
        try:
            urllib.request.urlopen(BASE+path,timeout=12)
        except urllib.error.HTTPError as e:
            if e.code==401:continue
            raise
        raise RuntimeError('OWNER_AUTH_CHANGED')
def install(ftp,name,data,done,expected=None):
    original=None
    try:original=read(ftp,name)
    except Exception as e:
        if not str(e).startswith('550'):raise
    if expected is not None and original!=expected:raise RuntimeError("CONCURRENT_WRITE")
    if original==data:return
    tag=secrets.token_hex(6);stage='.n7-apex-public-stage-'+tag;backup='.n7-apex-public-backup-'+tag+'-'+name
    ftp.storbinary('STOR '+stage,io.BytesIO(data));ftp.sendcmd('SITE CHMOD 600 '+stage)
    if read(ftp,stage)!=data:raise RuntimeError('STAGE_MISMATCH')
    if original is not None:
        if read(ftp,name)!=original:raise RuntimeError('CONCURRENT_WRITE')
        ftp.rename(name,backup)
    done.append((name,backup if original is not None else None))
    ftp.rename(stage,name)
    if read(ftp,name)!=data:raise RuntimeError('FINAL_MISMATCH')
def main():
    dry=os.getenv('N7_DRY_RUN','1')!='0';module=pathlib.Path(__file__).with_name('n7-apex-public-chat.cjs').read_bytes();syntax(module)
    ftp=connect();done=[]
    try:
        ftp.cwd(ROOT);old=read(ftp,'server.js');server=patch(old);syntax(server)
        print('APEX_PUBLIC_CHAT_PREFLIGHT '+json.dumps({'dry_run':dry,'server_changed':server!=old,'private_data_read':False,'owner_auth_unchanged':True}))
        if dry:return
        try:installed_module=read(ftp,'n7-apex-public-chat.cjs')
        except Exception as e:
            if not str(e).startswith('550'):raise
            installed_module=None
        if server==old and installed_module==module:
            verify(real_model=False)
            print('APEX_PUBLIC_CHAT_ALREADY_INSTALLED no_writes=true no_restart=true')
            return
        if read(ftp,'server.js')!=old:raise RuntimeError('CONCURRENT_SERVER_WRITE')
        install(ftp,'n7-apex-public-chat.cjs',module,done)
        install(ftp,'server.js',server,done,expected=old)
        ftp.storbinary('STOR tmp/restart.txt',io.BytesIO(b'n7-apex-passwordless-chat\n'))
        verify()
        print('APEX_PUBLIC_CHAT_DEPLOYED '+json.dumps({'passwordRequired':False,'owner_auth_unchanged':True,'backups':done,'module_sha256':sha(module),'installed_server_sha256':sha(server),'previous_server_sha256':sha(old)}))
    except BaseException:
        if not dry and done:
            for name,backup in reversed(done):
                try:
                    try:ftp.delete(name)
                    except Exception:pass
                    if backup:ftp.rename(backup,name)
                except Exception:print('APEX_PUBLIC_CHAT_ROLLBACK_REQUIRES_CHECK')
            ftp.storbinary('STOR tmp/restart.txt',io.BytesIO(b'n7-apex-public-rollback\n'))
        raise
    finally:
        try:ftp.quit()
        except Exception:ftp.close()
if __name__=='__main__':main()
