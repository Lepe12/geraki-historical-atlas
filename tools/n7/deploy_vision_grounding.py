#!/usr/bin/env python3
"""N7 vision reliability hotfix. Modify only existing helper and UI, with rollback."""
import ftplib,os,ssl,socket,hashlib,io,secrets,subprocess,tempfile,json,urllib.request,urllib.error
from pathlib import Path
ROOT='/bot.piratecartography.com/n7-app'
PUB=ROOT+'/public'
BASE='https://bot.piratecartography.com'
TLS='linux3087.grserver.gr'
HERE=Path(__file__).resolve().parent
def sha(b):return hashlib.sha256(b).hexdigest()
def read(ftp,folder,name):
 ftp.cwd(folder)
 parts=[];ftp.retrbinary('RETR '+name,parts.append);return b''.join(parts)
def check(data):
 with tempfile.NamedTemporaryFile(suffix='.js') as tmp:
  tmp.write(data);tmp.flush()
  result=subprocess.run(['node','--check',tmp.name],capture_output=True,timeout=20)
  if result.returncode:raise RuntimeError('N7_VISION_INVALID_JS')
def connect():
 host=os.environ['PCT_FTPS_HOST'];port=int(os.getenv('PCT_FTPS_PORT','21'))
 resolve=lambda h:{r[4][0] for r in socket.getaddrinfo(h,port,type=socket.SOCK_STREAM)}
 if not resolve(host).intersection(resolve(TLS)):raise RuntimeError('N7_VISION_UNEXPECTED_HOST')
 f=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
 f.connect(host,port);f.host=TLS
 f.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD']);f.prot_p();return f
def restart(ftp,label):
 ftp.cwd(ROOT+'/tmp')
 ftp.storbinary('STOR restart.txt',io.BytesIO(('n7-vision-'+label+'\n').encode()))
def verify(ui):
 ctx=ssl.create_default_context()
 with urllib.request.urlopen(urllib.request.Request(BASE+'/app.js',headers={'Cache-Control':'no-cache','User-Agent':'N7-vision-test/1'}),timeout=15,context=ctx) as r:
  if sha(r.read(500000))!=sha(ui):raise RuntimeError('N7_VISION_UI_MISMATCH')
 for endpoint in ('/health','/api/status'):
  with urllib.request.urlopen(urllib.request.Request(BASE+endpoint,headers={'Cache-Control':'no-cache'}),timeout=15,context=ctx) as r:
   content=json.loads(r.read(15000))
   if r.status!=200 or content.get('modelConfigured') is not True:raise RuntimeError('N7_VISION_GROQ_UNAVAILABLE')
 req=urllib.request.Request(BASE+'/api/conversations/11111111-1111-4111-8111-111111111111/stream',method='POST')
 try:
  urllib.request.urlopen(req,timeout=12,context=ctx)
  raise RuntimeError('N7_VISION_PRIVATE_STREAM_EXPOSED')
 except urllib.error.HTTPError as e:
  if e.code!=401:raise RuntimeError('N7_VISION_AUTH_FAILED')
 print('N7_VISION_LIVE_VERIFIED=true uiChecksum=true groq=true streamAuth=401')
def main():
 dry=os.getenv('N7_DRY_RUN','1')!='0'
 ftp=connect();token=secrets.token_hex(7);backups=[];stages=[]
 paths=[(ROOT,'n7-stream-attachments.js','stream-attachments.js','N7_STREAM_ATTACHMENTS_V1'),
   (PUB,'app.js','stream-upload-ui.js','N7_GROQ_TRUE_STREAM_AND_UPLOADS_V1')]
 try:
  originals={};updated={}
  for folder,name,source,marker in paths:
   old=read(ftp,folder,name);fresh=(HERE/source).read_bytes()
   if marker.encode() not in old:
    print('N7_VISION_LIVE_MARKERS file='+name+' rich='+str(b'N7_GROQ_TRUE_STREAM_AND_UPLOADS_V1' in old)+' inline='+str(b'N7_CHAT_CORRECTION_CONFIRM_V1' in old)+' picker='+str(b'n7-file-picker' in old)+' stream='+str(b'/stream' in old)+' length='+str(len(old)))
    if name=='app.js':
     import re
     text=old.decode('utf8',errors='replace')
     paths=sorted(set(re.findall(r'/api/[a-zA-Z0-9_/:{}.-]{2,95}',text)))[:35]
     print('N7_VISION_LIVE_API_PATHS='+repr(paths))
     print('N7_VISION_LIVE_CAPABILITIES='+repr({k:(k in text) for k in ('FormData','FileReader','attachments','image_url','/api/conversations','/stream','/api/chat','data:image','base64','fetch(')}))
     for needle in ("el('chat').onsubmit",'chat.onsubmit','/chat',"type='file'",'type="file"','file-input','File', 'base64'):
      ix=text.find(needle)
      if ix>=0:print('N7_VISION_LIVE_CONTEXT_'+str(len(needle))+'_'+str(ix)+'='+repr(text[max(0,ix-160):ix+430])[:650])
    raise RuntimeError('N7_VISION_MARKER_MISSING_'+name)
   if name=='app.js':
    begin=old.find(b'// N7_GROQ_TRUE_STREAM_AND_UPLOADS_V1')
    if begin<0 or old.find(b'// N7_GROQ_TRUE_STREAM_AND_UPLOADS_V1',begin+3)>=0:
     raise RuntimeError('N7_VISION_UI_BOUNDARY_NOT_UNIQUE')
    new=old[:begin]+fresh+b'\n'
   else:
    if old.count(b"N7_STREAM_ATTACHMENTS_V1")!=1:raise RuntimeError('N7_VISION_HELPER_UNEXPECTED')
    new=fresh
   if b'N7_OWNER_MEMORY_UI_V1' in old and b'N7_OWNER_MEMORY_UI_V1' not in new:
    raise RuntimeError('N7_VISION_OWNER_MEMORY_LOSS')
   check(new)
   originals[(folder,name)]=old;updated[(folder,name)]=new
  print('N7_VISION_PREFLIGHT_OK dry_run='+str(dry)+' new_files=0 changes='+str(sum(originals[k]!=updated[k] for k in originals)))
  if dry:return
  for folder,name,_,_ in paths:
   old=originals[(folder,name)];new=updated[(folder,name)]
   if old==new:continue
   if sha(read(ftp,folder,name))!=sha(old):raise RuntimeError('N7_VISION_CONCURRENT_EDIT_'+name)
   stage='.n7-vision-stage-'+token+'-'+name
   backup='.n7-vision-backup-'+token+'-'+name
   ftp.cwd(folder);ftp.storbinary('STOR '+stage,io.BytesIO(new));stages.append((folder,stage))
   ftp.sendcmd('SITE CHMOD 644 '+stage)
   if sha(read(ftp,folder,stage))!=sha(new):raise RuntimeError('N7_VISION_UPLOAD_HASH_FAILED')
   ftp.rename(name,backup)
   try:ftp.rename(stage,name)
   except BaseException:ftp.rename(backup,name);raise
   stages.remove((folder,stage));backups.append((folder,name,backup))
   if sha(read(ftp,folder,name))!=sha(new):raise RuntimeError('N7_VISION_HASH_FAILED')
  restart(ftp,'activate')
  verify(updated[(PUB,'app.js')])
  print('N7_VISION_DEPLOY_SUCCESS=true')
 except BaseException:
  if not dry and backups:
   for folder,name,backup in reversed(backups):
    try:ftp.cwd(folder);ftp.delete(name);ftp.rename(backup,name)
    except ftplib.all_errors:print('N7_VISION_MANUAL_ROLLBACK_NEEDED_'+name)
   try:restart(ftp,'rollback')
   except ftplib.all_errors:pass
   print('N7_VISION_ROLLBACK_ATTEMPTED=true')
  raise
 finally:
  for folder,name in stages:
   try:ftp.cwd(folder);ftp.delete(name)
   except ftplib.all_errors:pass
  try:ftp.quit()
  except ftplib.all_errors:pass
if __name__=='__main__':main()
