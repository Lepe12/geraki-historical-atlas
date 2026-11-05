#!/usr/bin/env python3
"""Atomic safeguarded N7 rich chat upgrade: stream, attachments, source reading.

Preserves production secrets, Groq settings, existing history/owner memory,
N7 queue/Agents, UI style, and previous N7 clock. Rollback all touched files.
"""
import ftplib,io,os,ssl,socket,secrets,subprocess,tempfile,hashlib,json,urllib.request,urllib.error
from pathlib import Path
ROOT='/bot.piratecartography.com/n7-app'
PUB=ROOT+'/public'
BASE='https://bot.piratecartography.com'
TLS='linux3087.grserver.gr'
HERE=Path(__file__).resolve().parent
MAIN='server.js'
NEW='n7-stream-attachments.js'
SEARCH='n7-public-web-search.js'
FRONT='app.js'
MARK='N7_STREAM_ATTACHMENTS_ROUTE_V1'
def sha(b):return hashlib.sha256(b).hexdigest()
def read(ftp,directory,name):
 ftp.cwd(directory)
 blocks=[]
 ftp.retrbinary('RETR '+name,blocks.append)
 return b''.join(blocks)
def optional(ftp,directory,name):
 try:return read(ftp,directory,name)
 except ftplib.error_perm as e:
  if str(e).startswith('550 '):return None
  raise
def check_js(blob):
 with tempfile.NamedTemporaryFile(mode='wb',suffix='.js') as tmp:
  tmp.write(blob);tmp.flush()
  chk=subprocess.run(['node','--check',tmp.name],capture_output=True,text=True,timeout=20)
  if chk.returncode:raise RuntimeError('N7_RICH_JS_SYNTAX_FAILED')
def server_patch(original):
 s=original.decode('utf8')
 if MARK in s:return original
 for marker in ('N7_OWNER_CHAT_LEARNING_V1','N7_REALTIME_CLOCK_INJECTION_V1',
       'N7_PUBLIC_WEB_GROUNDING_V1','N7_COMPLETE_OUTPUT_V1','N7_FAST_GROQ_BOOTSTRAP_v1'):
  if marker not in s:raise RuntimeError('N7_PREVIOUS_FEATURE_MISSING')
 anchor='async function answer(messages) {'
 if s.count(anchor)!=1:raise RuntimeError('N7_UNEXPECTED_CHAT_FUNCTION')
 init="""// N7_STREAM_ATTACHMENTS_ROUTE_V1: secure genuine Groq streaming endpoint.
const n7StreamChat=require('./n7-stream-attachments').makeHandler({
 API_KEY,MODEL,BASE,DATA_DIR,
 promptMessages:history=>promptMessages(history),
 load,save,publicSearch:n7PublicSearch
});
"""
 s=s.replace(anchor,init+anchor,1)
 route_anchor='    const chat = p.match('
 if s.count(route_anchor)!=1:
  print('N7_CHAT_ROUTE_CANDIDATES='+repr([line.strip()[:180] for line in s.splitlines() if 'chat' in line.lower() and ('match(' in line or 'const ' in line or '/api/conversations' in line)][:10]))
  raise RuntimeError('N7_MISSING_CHAT_ROUTE_ANCHOR')
 routes="""    const n7StreamMatch=p.match(/^\\/api\\/conversations\\/([a-f0-9-]+)\\/stream$/);
    if(req.method==='POST'&&n7StreamMatch)
      return await n7StreamChat(req,res,n7StreamMatch[1]);
"""
 s=s.replace(route_anchor,routes+route_anchor,1)
 if s.count(MARK)!=1:raise RuntimeError('N7_BAD_STREAM_PATCH_COUNT')
 return s.encode('utf8')
def front_patch(original):
 s=original.decode('utf8')
 if 'N7_GROQ_TRUE_STREAM_AND_UPLOADS_V1' in s:return original
 for needed in ('N7_OWNER_MEMORY_UI_V1','N7_CHAT_CORRECTION_CONFIRM_V1',"el('chat').onsubmit=",
      'N7_NONBLOCKING_QUEUE_WATCH_v1'):
  if needed not in s:raise RuntimeError('N7_EXPECTED_UI_MODULE_MISSING')
 addon=(HERE/'stream-upload-ui.js').read_text('utf8')
 return (s+'\n'+addon+'\n').encode('utf8')
def connect():
 host=os.environ['PCT_FTPS_HOST'];port=int(os.environ.get('PCT_FTPS_PORT','21'))
 resolve=lambda h:{a[4][0] for a in socket.getaddrinfo(h,port,type=socket.SOCK_STREAM)}
 if not resolve(host).intersection(resolve(TLS)):raise RuntimeError('N7_WRONG_FTPS_HOST')
 f=ftplib.FTP_TLS(timeout=35,context=ssl.create_default_context())
 f.connect(host,port);f.host=TLS
 f.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD']);f.prot_p()
 return f
def restart(ftp,name):
 ftp.cwd(ROOT+'/tmp')
 ftp.storbinary('STOR restart.txt',io.BytesIO(('n7-rich-chat-'+name+'\n').encode()))
def public_verify(front):
 ctx=ssl.create_default_context()
 for target in ('/health','/api/status'):
  with urllib.request.urlopen(urllib.request.Request(BASE+target,headers={
    'Cache-Control':'no-cache','User-Agent':'N7-rich-chat-verify/1'
  }),timeout=17,context=ctx) as response:
   value=json.loads(response.read(20000))
   if response.status!=200 or value.get('modelConfigured') is not True:
    raise RuntimeError('N7_MODEL_UNAVAILABLE')
 with urllib.request.urlopen(urllib.request.Request(BASE+'/app.js',headers={
    'Cache-Control':'no-cache','User-Agent':'N7-rich-chat-verify/1'
 }),timeout=17,context=ctx) as response:
  live=response.read(400000)
  if sha(live)!=sha(front):raise RuntimeError('N7_RICH_UI_CHECKSUM_FAIL')
  if b'N7_CHAT_CORRECTION_CONFIRM_V1' not in live:
   raise RuntimeError('N7_INLINE_MEMORY_UI_MISSING')
 for endpoint in ('/api/n7/approved-lessons',
    '/api/conversations/11111111-1111-4111-8111-111111111111/stream'):
  request=urllib.request.Request(BASE+endpoint,method='POST' if endpoint.endswith('/stream') else 'GET',
      headers={'User-Agent':'N7-rich-chat-verify/1'})
  try:
   urllib.request.urlopen(request,timeout=13,context=ctx)
   raise RuntimeError('N7_RICH_UNAUTHENTICATED_ACCESS')
  except urllib.error.HTTPError as e:
   if e.code!=401:raise RuntimeError('N7_RICH_AUTH_FAILED status='+str(e.code))
 print('N7_RICH_LIVE_VERIFIED=true groqConfigured=true uiChecksum=true privateEndpoints=401')
def main():
 dry=os.getenv('N7_DRY_RUN','1')!='0'
 ftp=connect()
 changes=[];stages=[];backups=[];created=[]
 token=secrets.token_hex(6)
 try:
  original_server=read(ftp,ROOT,MAIN)
  original_front=read(ftp,PUB,FRONT)
  original_search=read(ftp,ROOT,SEARCH)
  existing_stream=optional(ftp,ROOT,NEW)
  stream=(HERE/'stream-attachments.js').read_bytes()
  search=(HERE/'public-web-search.js').read_bytes()
  if existing_stream is not None and existing_stream!=stream:
   raise RuntimeError('N7_RICH_STREAM_HELPER_CONFLICT')
  revised_server=server_patch(original_server)
  revised_front=front_patch(original_front)
  files=[
   (ROOT,NEW,existing_stream,stream),
   (ROOT,SEARCH,original_search,search),
   (ROOT,MAIN,original_server,revised_server),
   (PUB,FRONT,original_front,revised_front)
  ]
  for directory,name,before,after in files:
   if name.endswith('.js'):check_js(after)
   if before!=after:changes.append((directory,name,before,after))
  print('N7_RICH_PREFLIGHT_OK dry_run='+str(dry)+' changed='+','.join(x[1] for x in changes))
  if dry:return
  for directory,name,before,after in changes:
   ftp.cwd(directory)
   if optional(ftp,directory,name)!=before:raise RuntimeError('N7_RICH_CONCURRENT_FILE_UPDATE_'+name)
   stage='.n7-rich-stage-'+token+'-'+name
   ftp.storbinary('STOR '+stage,io.BytesIO(after));stages.append((directory,stage))
   ftp.sendcmd('SITE CHMOD 644 '+stage)
   if sha(read(ftp,directory,stage))!=sha(after):raise RuntimeError('N7_RICH_STAGE_HASH_FAIL_'+name)
   if before is not None:
    backup='.n7-rich-backup-'+token+'-'+name
    ftp.rename(name,backup)
    try:ftp.rename(stage,name)
    except BaseException:ftp.rename(backup,name);raise
    backups.append((directory,name,backup))
   else:
    ftp.rename(stage,name)
    created.append((directory,name))
   stages.remove((directory,stage))
   if sha(read(ftp,directory,name))!=sha(after):raise RuntimeError('N7_RICH_FINAL_HASH_FAIL_'+name)
  restart(ftp,'activate')
  public_verify(revised_front)
  print('N7_RICH_DEPLOY_SUCCESS=true')
 except BaseException:
  if not dry and (backups or created):
   for directory,name,backup in reversed(backups):
    try:ftp.cwd(directory);ftp.delete(name);ftp.rename(backup,name)
    except ftplib.all_errors:print('N7_RICH_MANUAL_ROLLBACK_NEEDED='+name)
   for directory,name in reversed(created):
    try:ftp.cwd(directory);ftp.delete(name)
    except ftplib.all_errors:print('N7_RICH_HELPER_MANUAL_CLEANUP_NEEDED='+name)
   try:restart(ftp,'rollback')
   except ftplib.all_errors:pass
   print('N7_RICH_ROLLBACK_ATTEMPTED=true')
  raise
 finally:
  for directory,name in stages:
   try:ftp.cwd(directory);ftp.delete(name)
   except ftplib.all_errors:pass
  try:ftp.quit()
  except ftplib.all_errors:pass
if __name__=='__main__':main()
