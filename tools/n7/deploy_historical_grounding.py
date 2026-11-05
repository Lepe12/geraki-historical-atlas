#!/usr/bin/env python3
"""Bounded N7 historical evidence hotfix (3 existing code files only)."""
import ftplib,os,socket,ssl,hashlib,subprocess,tempfile,io,secrets,json,urllib.request,urllib.error
from pathlib import Path
ROOT='/bot.piratecartography.com/n7-app'
BASE='https://bot.piratecartography.com'
TLS='linux3087.grserver.gr'
HERE=Path(__file__).resolve().parent
FILES=('server.js','n7-public-web-search.js','n7-stream-attachments.js')
def sha(b):return hashlib.sha256(b).hexdigest()
def read(f,name):
 chunks=[];f.retrbinary('RETR '+name,chunks.append)
 return b''.join(chunks)
def check(data):
 with tempfile.NamedTemporaryFile(suffix='.js') as t:
  t.write(data);t.flush()
  p=subprocess.run(['node','--check',t.name],capture_output=True,timeout=20)
  if p.returncode:raise RuntimeError('N7_HISTORY_JS_SYNTAX_FAILED')
def server_patch(data):
 source=data.decode('utf8')
 if 'N7_HISTORICAL_TOPIC_WIRING_V1' in source:return data
 for marker in ('N7_PUBLIC_WEB_GROUNDING_V1','N7_REALTIME_CLOCK_INJECTION_V1',
                'N7_OWNER_CHAT_LEARNING_V1','N7_STREAM_ATTACHMENTS_ROUTE_V1'):
  if marker not in source:raise RuntimeError('N7_HISTORY_GUARD_MISSING')
 before='  const initialMessages = promptMessages(messages);'
 after="""  // N7_HISTORICAL_TOPIC_WIRING_V1: don't trust earlier unrelated cited claims.
  const initialMessages = promptMessages(n7PublicSearch.cleanHistoryForTopic(messages));"""
 if source.count(before)!=1:raise RuntimeError('N7_HISTORY_PROMPT_LAYOUT_UNEXPECTED')
 source=source.replace(before,after,1)
 a='    n7WebEvidence = await n7PublicSearch.researchMessages(messages);'
 if source.count(a)!=1:raise RuntimeError('N7_HISTORY_SEARCH_LAYOUT_UNEXPECTED')
 source=source.replace(a,a+"\n    n7WebEvidence = await n7PublicSearch.enrichPublisherArticles(n7WebEvidence);",1)
 return source.encode('utf8')
def connect():
 host=os.environ['PCT_FTPS_HOST'];port=int(os.getenv('PCT_FTPS_PORT','21'))
 ips=lambda h:{i[4][0] for i in socket.getaddrinfo(h,port,type=socket.SOCK_STREAM)}
 if not ips(host).intersection(ips(TLS)):raise RuntimeError('N7_HOST_MISMATCH')
 f=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
 f.connect(host,port);f.host=TLS
 f.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD']);f.prot_p();f.cwd(ROOT)
 return f
def verify():
 ctx=ssl.create_default_context()
 for endpoint in ('/health','/api/status'):
  with urllib.request.urlopen(urllib.request.Request(BASE+endpoint,headers={'Cache-Control':'no-cache'}),timeout=15,context=ctx) as r:
   data=json.loads(r.read(15000))
   if r.status!=200 or not data.get('modelConfigured'):
    raise RuntimeError('N7_HISTORY_LIVE_UNHEALTHY')
 for route,method in (('/api/n7/approved-lessons','GET'),
   ('/api/conversations/11111111-1111-4111-8111-111111111111/stream','POST')):
  try:
   urllib.request.urlopen(urllib.request.Request(BASE+route,method=method),timeout=12,context=ctx)
   raise RuntimeError('N7_HISTORY_UNAUTHENTICATED_ENDPOINT')
  except urllib.error.HTTPError as e:
   if e.code!=401:raise
 print('N7_HISTORY_LIVE_VERIFIED=true groq=true owner_memory_private=true stream_private=true')
def main():
 dry=os.getenv('N7_DRY_RUN','1')!='0'
 f=connect();token=secrets.token_hex(6);old={};new={};backup=[];stages=[]
 try:
  for filename in FILES:
   old[filename]=read(f,filename)
   new[filename]=(server_patch(old[filename]) if filename=='server.js' else
     (HERE/('public-web-search.js' if filename=='n7-public-web-search.js' else 'stream-attachments.js')).read_bytes())
   check(new[filename])
   if filename!='server.js':
    must=b'N7_HISTORICAL_TOPIC_ISOLATION_V1' if filename=='n7-public-web-search.js' else b'publicSearch.cleanHistoryForTopic(history)'
    if must not in new[filename]:raise RuntimeError('N7_HISTORY_HELPER_GUARD_FAILED')
  names=[name for name in FILES if old[name]!=new[name]]
  print('N7_HISTORY_PREFLIGHT_OK dry_run='+str(dry)+' files='+','.join(names))
  if dry:return
  for name in names:
   if sha(read(f,name))!=sha(old[name]):raise RuntimeError('N7_HISTORY_CONCURRENT_CHANGE_'+name)
   stage='.n7-history-stage-'+token+'-'+name
   b='.n7-history-backup-'+token+'-'+name
   f.storbinary('STOR '+stage,io.BytesIO(new[name]));stages.append(stage)
   f.sendcmd('SITE CHMOD 644 '+stage)
   if sha(read(f,stage))!=sha(new[name]):raise RuntimeError('N7_HISTORY_UPLOAD_MISMATCH')
   f.rename(name,b)
   try:f.rename(stage,name)
   except BaseException:f.rename(b,name);raise
   stages.remove(stage);backup.append((name,b))
   if sha(read(f,name))!=sha(new[name]):raise RuntimeError('N7_HISTORY_READBACK_MISMATCH')
  f.cwd(ROOT+'/tmp');f.storbinary('STOR restart.txt',io.BytesIO(b'n7-historical-evidence-activate\n'))
  verify()
  print('N7_HISTORY_DEPLOY_SUCCESS=true')
 except BaseException:
  if not dry and backup:
   f.cwd(ROOT)
   for name,b in reversed(backup):
    try:f.delete(name);f.rename(b,name)
    except ftplib.all_errors:print('N7_HISTORY_MANUAL_ROLLBACK_NEEDED='+name)
   try:f.cwd(ROOT+'/tmp');f.storbinary('STOR restart.txt',io.BytesIO(b'n7-historical-evidence-rollback\n'))
   except ftplib.all_errors:pass
   print('N7_HISTORY_ROLLBACK_ATTEMPTED=true')
  raise
 finally:
  f.cwd(ROOT)
  for stage in stages:
   try:f.delete(stage)
   except ftplib.all_errors:pass
  try:f.quit()
  except ftplib.all_errors:pass
if __name__=='__main__':main()
