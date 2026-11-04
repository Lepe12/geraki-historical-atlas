#!/usr/bin/env python3
"""Guarded FTPS install of the N7 private Qwen workflow_dispatch trigger.
Only n7-queue-bridge.js and n7-app/public/app.js may change.
No passwords, token values or owner conversation text are accessed or logged.
"""
import ftplib,ssl,socket,io,os,posixpath,uuid,hashlib,subprocess,tempfile,urllib.request,urllib.error,json,time
from pathlib import Path
ROOT='/bot.piratecartography.com/n7-app'
PUBLIC=ROOT+'/public'
TLS='linux3087.grserver.gr'
SOURCE=Path(__file__).resolve().with_name('n7-queue-bridge.js')
TARGETS=[
  (ROOT,'n7-queue-bridge.js','600'),
  (PUBLIC,'app.js','644')
]
OLD_NOTICE="el('notice').textContent='Η εντολή μπήκε στην ιδιωτική ουρά Qwen. Ο worker εκκινεί ανά 5 λεπτά· η απάντηση μπορεί να καθυστερήσει.';"
NEW_NOTICE=("el('notice').textContent=reply.dispatch==='immediate'?"
            "'Το Qwen ενεργοποιήθηκε στο GitHub. Η εκκίνηση του μοντέλου μπορεί να καθυστερήσει.':"
            "'Η εντολή μπήκε στην ιδιωτική ουρά Qwen. Ο εφεδρικός έλεγχος γίνεται ανά 5 λεπτά.';")
def digest(data):
  return hashlib.sha256(data).hexdigest()
def read(ftp,name):
  chunks=[]
  ftp.retrbinary('RETR '+name,chunks.append)
  return b''.join(chunks)
def patch_frontend(data):
  text=data.decode('utf-8')
  if NEW_NOTICE in text:return data
  if text.count(OLD_NOTICE)!=1:
    raise RuntimeError('N7_UNRECOGNIZED_FRONTEND_ABORT')
  return text.replace(OLD_NOTICE,NEW_NOTICE).encode('utf-8')
def syntax_check(data,which):
  with tempfile.NamedTemporaryFile('wb',suffix='.js') as f:
    f.write(data);f.flush()
    p=subprocess.run(['node','--check',f.name],capture_output=True,text=True,timeout=20)
    if p.returncode:
      raise RuntimeError('N7_INVALID_JS_'+which)
def verify_live():
  context=ssl.create_default_context()
  base='https://bot.piratecartography.com'
  for attempt in range(15):
    try:
      with urllib.request.urlopen(urllib.request.Request(base+'/api/status',
        headers={'Cache-Control':'no-cache','User-Agent':'n7-queue-immediate-verification'}),
        timeout=10,context=context) as r:
        v=json.loads(r.read(10000))
        if r.status==200 and v.get('queueModelAvailable') is True and \
            isinstance(v.get('queueDispatchConfigured'),bool):
          break
    except (ValueError,TimeoutError,urllib.error.URLError):
      pass
    time.sleep(2)
  else:raise RuntimeError('N7_DEPLOY_STATUS_NOT_UPDATED')
  for endpoint in ('/','/app.js','/health'):
    with urllib.request.urlopen(base+endpoint,timeout=12,context=context) as response:
      if response.status!=200:raise RuntimeError('N7_PUBLIC_ROUTE_FAILED_'+endpoint)
      response.read(100000)
  request=urllib.request.Request(base+'/api/n7/worker/claim',method='POST',data=b'{}',
    headers={'Content-Type':'application/json'})
  try:
    urllib.request.urlopen(request,timeout=12,context=context)
    raise RuntimeError('N7_WORKER_AUTH_BROKEN')
  except urllib.error.HTTPError as error:
    if error.code!=401:raise
  print('N7_IMMEDIATE_LIVE_PASS '+json.dumps({'queueDispatchConfigured':v['queueDispatchConfigured'],
    'pages_healthy':True,'worker_authorization_protected':True,'backend_queue_available':True}))
def deploy():
  dry=os.environ.get('N7_DRY_RUN','1')=='1'
  host=os.environ['PCT_FTPS_HOST'];port=int(os.environ.get('PCT_FTPS_PORT','21'))
  a={v[4][0] for v in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
  b={v[4][0] for v in socket.getaddrinfo(TLS,port,type=socket.SOCK_STREAM)}
  if not a.intersection(b):raise RuntimeError('N7_TLS_NAME_MISMATCH')
  ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
  ftp.connect(host,port);ftp.host=TLS
  ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
  ftp.prot_p()
  pending=[];done=[]
  try:
    new_bridge=SOURCE.read_bytes()
    syntax_check(new_bridge,'BRIDGE')
    ftp.cwd(ROOT)
    if ftp.pwd().rstrip('/')!=ROOT:raise RuntimeError('N7_UNEXPECTED_APP_ROOT')
    old_bridge=read(ftp,'n7-queue-bridge.js')
    if b'createN7Relay' not in old_bridge or b'WORKFLOW' not in old_bridge:
      raise RuntimeError('N7_UNKNOWN_BRIDGE_ABORT')
    ftp.cwd(PUBLIC)
    if ftp.pwd().rstrip('/')!=PUBLIC:raise RuntimeError('N7_UNEXPECTED_PUBLIC_ROOT')
    old_frontend=read(ftp,'app.js')
    new_frontend=patch_frontend(old_frontend)
    syntax_check(new_frontend,'FRONTEND')
    payloads=[(ROOT,'n7-queue-bridge.js','600',old_bridge,new_bridge),
      (PUBLIC,'app.js','644',old_frontend,new_frontend)]
    print('N7_IMMEDIATE_PATCH_PREPARED '+json.dumps({'dry_run':dry,
      'bridge_changed':old_bridge!=new_bridge,'frontend_changed':old_frontend!=new_frontend,
      'syntax_pass':True,'private_user_messages_touched':False,'other_websites_touched':False}))
    if dry:return
    for directory,name,mode,old,new in payloads:
      if old==new:continue
      ftp.cwd(directory)
      if digest(read(ftp,name))!=digest(old):raise RuntimeError('N7_CONCURRENT_FILE_CHANGE_'+name)
      stamp=uuid.uuid4().hex[:12]
      staged='.n7-immediate-stage-'+stamp+'-'+name
      backup='.n7-immediate-backup-'+stamp+'-'+name
      pending.append((directory,staged))
      ftp.storbinary('STOR '+staged,io.BytesIO(new))
      if digest(read(ftp,staged))!=digest(new):raise RuntimeError('N7_STAGE_HASH_FAILED_'+name)
      ftp.sendcmd('SITE CHMOD '+mode+' '+staged)
      ftp.rename(name,backup)
      try:
        ftp.rename(staged,name)
      except BaseException:
        ftp.rename(backup,name)
        raise
      pending.pop()
      done.append((directory,name,backup))
      if digest(read(ftp,name))!=digest(new):raise RuntimeError('N7_FINAL_HASH_FAILED_'+name)
    ftp.cwd(ROOT+'/tmp')
    ftp.storbinary('STOR restart.txt',io.BytesIO(b'n7-immediate-qwen-dispatch-updated\n'))
    verify_live()
    print('N7_IMMEDIATE_DEPLOY_SUCCESS')
  except BaseException:
    if not dry:
      for directory,name,backup in reversed(done):
        try:
          ftp.cwd(directory);ftp.delete(name);ftp.rename(backup,name)
        except ftplib.all_errors:print('N7_MANUAL_ROLLBACK_REQUIRED '+name)
      try:
        ftp.cwd(ROOT+'/tmp')
        ftp.storbinary('STOR restart.txt',io.BytesIO(b'n7-immediate-qwen-rollback\n'))
        print('N7_IMMEDIATE_ROLLBACK_REQUESTED')
      except ftplib.all_errors:pass
    raise
  finally:
    for directory,staged in pending:
      try:ftp.cwd(directory);ftp.delete(staged)
      except ftplib.all_errors:pass
    ftp.quit()
if __name__=='__main__':deploy()
