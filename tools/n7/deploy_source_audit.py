#!/usr/bin/env python3
"""N7 historical full-text + bibliography fix. Only two Node helper files.

Preflight on actual live FTPS, syntax, guarded atomic replacements, HTTPS health,
private route protection, rollback. Does NOT change model, UI, user data, or keys.
"""
import ftplib,os,socket,ssl,hashlib,subprocess,tempfile,io,secrets,json,urllib.request,urllib.error
from pathlib import Path
ROOT='/bot.piratecartography.com/n7-app'
BASE='https://bot.piratecartography.com'
TLS='linux3087.grserver.gr'
HERE=Path(__file__).resolve().parent
RESEARCH='n7-public-web-search.js'
AUDIT='n7-historical-source-audit.js'
def sha(b):return hashlib.sha256(b).hexdigest()
def read(f,name):
 chunks=[];f.retrbinary('RETR '+name,chunks.append)
 return b''.join(chunks)
def optional(f,name):
 try:return read(f,name)
 except ftplib.error_perm as e:
  if str(e).startswith('550 '):return None
  raise
def nodecheck(b):
 with tempfile.NamedTemporaryFile(suffix='.js') as t:
  t.write(b);t.flush()
  result=subprocess.run(['node','--check',t.name],capture_output=True,timeout=20)
  if result.returncode:raise RuntimeError('N7_SOURCE_AUDIT_INVALID_JS')
def connect():
 host=os.environ['PCT_FTPS_HOST'];port=int(os.getenv('PCT_FTPS_PORT','21'))
 ips=lambda h:{v[4][0] for v in socket.getaddrinfo(h,port,type=socket.SOCK_STREAM)}
 if not ips(host).intersection(ips(TLS)):raise RuntimeError('N7_UNEXPECTED_FTPS_HOST')
 f=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
 f.connect(host,port);f.host=TLS
 f.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
 f.prot_p();f.cwd(ROOT)
 return f
def restart(f,why):
 f.cwd(ROOT+'/tmp')
 f.storbinary('STOR restart.txt',io.BytesIO(('n7-source-audit-'+why+'\n').encode()))
 f.cwd(ROOT)
def verify():
 ctx=ssl.create_default_context()
 for route in ('/health','/api/status'):
  with urllib.request.urlopen(urllib.request.Request(BASE+route,headers={'Cache-Control':'no-cache'}),timeout=16,context=ctx) as res:
   data=json.loads(res.read(18000))
   if res.status!=200 or data.get('modelConfigured') is not True:
    raise RuntimeError('N7_SOURCE_AUDIT_HEALTH_CHECK_FAILED')
 for route,method in (('/api/n7/approved-lessons','GET'),
     ('/api/conversations/11111111-1111-4111-8111-111111111111/stream','POST')):
  try:
   urllib.request.urlopen(urllib.request.Request(BASE+route,method=method),timeout=14,context=ctx)
   raise RuntimeError('N7_SOURCE_AUDIT_UNAUTHENTICATED_ACCESS')
  except urllib.error.HTTPError as err:
   if err.code!=401:raise
 print('N7_SOURCE_AUDIT_LIVE_VERIFIED=true groqConfigured=true ownerMemoryProtected=true streamingProtected=true')
def main():
 dry=os.getenv('N7_DRY_RUN','1')!='0'
 ftp=connect()
 changes=[];backups=[];stages=[];created=[]
 token=secrets.token_hex(7)
 try:
  live_server=read(ftp,'server.js')
  live_search=read(ftp,RESEARCH)
  live_audit=optional(ftp,AUDIT)
  for marker in (b'N7_PUBLIC_WEB_GROUNDING_V1',b'N7_HISTORICAL_TOPIC_WIRING_V1'):
   if marker not in live_server:raise RuntimeError('N7_SOURCE_AUDIT_SERVER_INTEGRATION_MISSING')
  if b'enrichPublisherArticles' not in live_server or b'N7_HISTORICAL_TOPIC_ISOLATION_V1' not in live_search:
   raise RuntimeError('N7_SOURCE_AUDIT_PRIOR_HELPERS_NOT_LIVE')
  new_search=(HERE/'public-web-search.js').read_bytes()
  new_audit=(HERE/'historical-source-audit.js').read_bytes()
  if b'N7_HISTORICAL_DEEP_READING_V1' not in new_search or b'N7_HISTORICAL_SOURCE_AUDIT_V1' not in new_audit:
   raise RuntimeError('N7_SOURCE_AUDIT_PATCH_MARKER_MISSING')
  if live_audit is not None and live_audit!=new_audit:
   raise RuntimeError('N7_SOURCE_AUDIT_HELPER_ALREADY_EXISTS_DIFFERENT')
  nodecheck(new_search);nodecheck(new_audit)
  for name,previous,fresh in ((AUDIT,live_audit,new_audit),(RESEARCH,live_search,new_search)):
   if previous!=fresh:changes.append((name,previous,fresh))
  print('N7_SOURCE_AUDIT_PREFLIGHT_OK dry_run='+str(dry)+
    ' files='+','.join(x[0] for x in changes))
  if dry:return
  for name,previous,fresh in changes:
   if optional(ftp,name)!=previous:raise RuntimeError('N7_SOURCE_AUDIT_CONCURRENT_CHANGE_'+name)
   stage='.n7-source-stage-'+token+'-'+name
   ftp.storbinary('STOR '+stage,io.BytesIO(fresh));stages.append(stage)
   ftp.sendcmd('SITE CHMOD 644 '+stage)
   if sha(read(ftp,stage))!=sha(fresh):raise RuntimeError('N7_SOURCE_AUDIT_STAGE_MISMATCH_'+name)
   if previous is None:
    ftp.rename(stage,name);created.append(name)
   else:
    backup='.n7-source-backup-'+token+'-'+name
    ftp.rename(name,backup)
    try:ftp.rename(stage,name)
    except BaseException:ftp.rename(backup,name);raise
    backups.append((name,backup))
   stages.remove(stage)
   if sha(read(ftp,name))!=sha(fresh):raise RuntimeError('N7_SOURCE_AUDIT_READBACK_MISMATCH_'+name)
  restart(ftp,'activate')
  verify()
  print('N7_SOURCE_AUDIT_DEPLOY_SUCCESS=true')
 except BaseException:
  if not dry and (backups or created):
   ftp.cwd(ROOT)
   for name,backup in reversed(backups):
    try:ftp.delete(name);ftp.rename(backup,name)
    except ftplib.all_errors:print('N7_SOURCE_AUDIT_MANUAL_ROLLBACK_NEEDED_'+name)
   for name in reversed(created):
    try:ftp.delete(name)
    except ftplib.all_errors:print('N7_SOURCE_AUDIT_MANUAL_CLEANUP_NEEDED_'+name)
   try:restart(ftp,'rollback')
   except ftplib.all_errors:pass
   print('N7_SOURCE_AUDIT_ROLLBACK_ATTEMPTED=true')
  raise
 finally:
  ftp.cwd(ROOT)
  for stage in stages:
   try:ftp.delete(stage)
   except ftplib.all_errors:pass
  try:ftp.quit()
  except ftplib.all_errors:pass
if __name__=='__main__':main()
