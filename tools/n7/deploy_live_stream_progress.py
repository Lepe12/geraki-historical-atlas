#!/usr/bin/env python3
"""Restore actual streamed research UI to CURRENT live N7 without replacing its custom UI."""
import ftplib,os,ssl,socket,hashlib,subprocess,tempfile,io,secrets,json,urllib.request,urllib.error
from pathlib import Path
ROOT='/bot.piratecartography.com/n7-app'
PUB=ROOT+'/public'
BASE='https://bot.piratecartography.com'
TLS='linux3087.grserver.gr'
HERE=Path(__file__).resolve().parent
FILES=[(ROOT,'n7-stream-attachments.js','stream-attachments.js'),(ROOT,'n7-public-web-search.js','public-web-search.js'),(PUB,'app.js','stream-upload-ui.js')]
MARKER=b'N7_GROQ_TRUE_STREAM_AND_UPLOADS_V1'
def sha(b):return hashlib.sha256(b).hexdigest()
def read(f,folder,name):
 f.cwd(folder);chunks=[];f.retrbinary('RETR '+name,chunks.append);return b''.join(chunks)
def check(data):
 with tempfile.NamedTemporaryFile(suffix='.js') as t:
  t.write(data);t.flush()
  r=subprocess.run(['node','--check',t.name],capture_output=True,text=True,timeout=20)
  if r.returncode:raise RuntimeError('N7_PROGRESS_JS_SYNTAX_FAILED '+r.stderr[:350])
def connect():
 host=os.environ['PCT_FTPS_HOST'];port=int(os.getenv('PCT_FTPS_PORT','21'))
 ips=lambda h:{x[4][0] for x in socket.getaddrinfo(h,port,type=socket.SOCK_STREAM)}
 if not ips(host).intersection(ips(TLS)):raise RuntimeError('N7_PROGRESS_UNEXPECTED_FTPS_HOST')
 f=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
 f.connect(host,port);f.host=TLS
 f.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD']);f.prot_p()
 return f
def restart(f,label):
 f.cwd(ROOT+'/tmp');f.storbinary('STOR restart.txt',io.BytesIO(('n7-progress-'+label+'\n').encode()))
def verify(expected_ui):
 ctx=ssl.create_default_context()
 for route in ('/health','/api/status'):
  with urllib.request.urlopen(urllib.request.Request(BASE+route,headers={'Cache-Control':'no-cache'}),timeout=18,context=ctx) as r:
   v=json.loads(r.read(18000))
   if r.status!=200 or not v.get('modelConfigured'):raise RuntimeError('N7_PROGRESS_MODEL_UNAVAILABLE')
 import time
 verified=False
 for attempt in range(1,13):
  query='?n7progress='+secrets.token_hex(7)
  req=urllib.request.Request(BASE+'/app.js'+query,headers={'Cache-Control':'no-cache','Pragma':'no-cache'})
  with urllib.request.urlopen(req,timeout=18,context=ctx) as r:
   data=r.read(900000)
  hash_match=sha(data)==sha(expected_ui)
  marker_ok=MARKER in data
  status_ok=b"event.type==='status'" in data
  print('N7_PROGRESS_SERVE_CHECK attempt='+str(attempt)+' hashMatch='+str(hash_match)+
    ' marker='+str(marker_ok)+' status='+str(status_ok)+
    ' length='+str(len(data))+' expected='+str(len(expected_ui)))
  if hash_match and marker_ok and status_ok:
   verified=True;break
  if attempt<12:time.sleep(5)
 if not verified:raise RuntimeError('N7_PROGRESS_UI_NOT_SERVED')
 for route,method in (('/api/n7/approved-lessons','GET'),
  ('/api/conversations/11111111-1111-4111-8111-111111111111/stream','POST')):
  try:
   urllib.request.urlopen(urllib.request.Request(BASE+route,method=method),timeout=13,context=ctx)
   raise RuntimeError('N7_PROGRESS_PRIVATE_ENDPOINT_EXPOSED')
  except urllib.error.HTTPError as e:
   if e.code!=401:raise RuntimeError('N7_PROGRESS_AUTH_FAILED')
 print('N7_PROGRESS_LIVE_VERIFIED=true groq=true uiChecksum=true streamUi=true privateRoutes=true')
def make_ui(old,addon):
 if MARKER in old:
  start=old.index(b'// '+MARKER)
  if old.count(MARKER)!=1:raise RuntimeError('N7_PROGRESS_UI_MULTIPLE_ADDONS')
  # Only replace the exact previous append-only add-on at the tail.
  if not old[start:].rstrip().endswith(b'})();'):
   raise RuntimeError('N7_PROGRESS_UI_END_UNEXPECTED')
  return old[:start]+addon+b'\n'
 if b"el('chat').onsubmit" not in old or b'/api/conversations/' not in old:
  raise RuntimeError('N7_PROGRESS_NEW_UI_UNRECOGNIZED')
 return old+b'\n'+addon+b'\n'
def main():
 dry=os.getenv('N7_DRY_RUN','1')!='0'
 f=connect();token=secrets.token_hex(6);changes=[];stages=[];backups=[]
 try:
  server=read(f,ROOT,'server.js')
  if b'N7_STREAM_ATTACHMENTS_ROUTE_V1' not in server:
   raise RuntimeError('N7_PROGRESS_STREAM_ROUTE_NOT_INSTALLED')
  for folder,name,local in FILES:
   previous=read(f,folder,name)
   data=(HERE/local).read_bytes()
   if name=='app.js':
    data=make_ui(previous,data)
    if len(data)<len(previous)-10000:raise RuntimeError('N7_PROGRESS_LIVE_UI_TRUNCATION')
   elif name=='n7-stream-attachments.js':
    if b'N7_STREAM_ATTACHMENTS_V1' not in previous or b'N7_RESEARCH_PROGRESS_STREAM_V1' not in data:
     raise RuntimeError('N7_PROGRESS_BACKEND_UNEXPECTED')
   elif name=='n7-public-web-search.js':
    if b'N7_HISTORICAL_DEEP_READING_V1' not in previous or b'N7_SOURCE_PRIORITY_CONTEXT_V2' not in data:
     raise RuntimeError('N7_PROGRESS_RESEARCH_HELPER_UNEXPECTED')
   check(data)
   if previous!=data:changes.append((folder,name,previous,data))
  print('N7_PROGRESS_PREFLIGHT_OK dry_run='+str(dry)+' changed='+','.join(v[1] for v in changes))
  # Compare public static /app.js to exact FTPS file before changing anything.
  public_origin=next((x[2] for x in changes if x[1]=='app.js'),read(f,PUB,'app.js'))
  ctx=ssl.create_default_context()
  try:
   req=urllib.request.Request(BASE+'/app.js?audit='+token,headers={'Cache-Control':'no-cache','Pragma':'no-cache'})
   with urllib.request.urlopen(req,timeout=16,context=ctx) as res:public_data=res.read(900000)
   print('N7_PROGRESS_ORIGIN_COMPARE ftpsLen='+str(len(public_origin))+
    ' webLen='+str(len(public_data))+' ftpsSha='+sha(public_origin)[:16]+
    ' webSha='+sha(public_data)[:16]+' same='+str(sha(public_origin)==sha(public_data)))
  except Exception as e:
   print('N7_PROGRESS_ORIGIN_COMPARE_ERROR='+type(e).__name__)

  if dry:return
  for folder,name,previous,data in changes:
   if sha(read(f,folder,name))!=sha(previous):raise RuntimeError('N7_PROGRESS_CONCURRENT_UPDATE')
   stage='.n7-progress-stage-'+token+'-'+name
   backup='.n7-progress-backup-'+token+'-'+name
   f.cwd(folder);f.storbinary('STOR '+stage,io.BytesIO(data));stages.append((folder,stage))
   f.sendcmd('SITE CHMOD 644 '+stage)
   if sha(read(f,folder,stage))!=sha(data):raise RuntimeError('N7_PROGRESS_STAGE_MISMATCH')
   f.cwd(folder);f.rename(name,backup)
   try:f.rename(stage,name)
   except BaseException:f.rename(backup,name);raise
   stages.remove((folder,stage));backups.append((folder,name,backup))
   if sha(read(f,folder,name))!=sha(data):raise RuntimeError('N7_PROGRESS_FINAL_HASH_MISMATCH')
  restart(f,'activate')
  verify(read(f,PUB,'app.js'))
  print('N7_PROGRESS_DEPLOY_SUCCESS=true')
 except BaseException:
  if not dry and backups:
   for folder,name,backup in reversed(backups):
    try:f.cwd(folder);f.delete(name);f.rename(backup,name)
    except ftplib.all_errors:print('N7_PROGRESS_MANUAL_ROLLBACK_NEEDED='+name)
   try:restart(f,'rollback')
   except ftplib.all_errors:pass
   print('N7_PROGRESS_ROLLBACK_ATTEMPTED=true')
  raise
 finally:
  for folder,name in stages:
   try:f.cwd(folder);f.delete(name)
   except ftplib.all_errors:pass
  try:f.quit()
  except ftplib.all_errors:pass
if __name__=='__main__':main()
