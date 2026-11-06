#!/usr/bin/env python3
"""Read-only inventory of the N7 Top.Host application. Never alter production."""
import ftplib,ssl,socket,os,json,urllib.request,urllib.error,io
ROOT='/bot.piratecartography.com/n7-app'
SAFE_FILES=('package.json','package-lock.json','.node-version','.nvmrc')
def main():
 host=os.environ['PCT_FTPS_HOST'];port=int(os.getenv('PCT_FTPS_PORT','21'))
 ips=lambda h:{x[4][0] for x in socket.getaddrinfo(h,port,type=socket.SOCK_STREAM)}
 assert ips(host)&ips('linux3087.grserver.gr'),'Host does not match expected Top.Host'
 ftp=ftplib.FTP_TLS(timeout=25,context=ssl.create_default_context())
 ftp.connect(host,port);ftp.host='linux3087.grserver.gr'
 ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD']);ftp.prot_p()
 try:
  ftp.cwd(ROOT)
  # Only selected names; no content of messages, environment variables, or credentials.
  try:
   names={n.lower():n for n in ftp.nlst()}
   names={k.split('/')[-1]:v for k,v in names.items()}
   print('N7_AUDIT_APP_ROOT_ACCESS=true')
   for d in ('node_modules','public','tmp','logs','uploads','data','.venv','venv','python','node','bin','scripts'):
    print('N7_AUDIT_ENTRY_'+d.upper().replace('.','_')+'='+str(d in names))
  except Exception as ex:print('N7_AUDIT_LISTING_ERROR='+type(ex).__name__)
  for filename in SAFE_FILES:
   try:
    chunks=[];ftp.retrbinary('RETR '+filename,chunks.append)
    data=b''.join(chunks)
    if filename=='package.json':
     obj=json.loads(data)
     print('N7_AUDIT_PACKAGE_NAME='+str(obj.get('name','missing'))[:65])
     print('N7_AUDIT_NODE_ENGINES='+str(obj.get('engines',{}))[:120])
     print('N7_AUDIT_DEPENDENCIES='+','.join(sorted(obj.get('dependencies',{})))[:900])
     print('N7_AUDIT_SCRIPTS='+','.join(sorted(obj.get('scripts',{})))[:300])
     print('N7_AUDIT_PACKAGE_FILE_READ=true')
    elif filename in ('.nvmrc','.node-version'):
     print('N7_AUDIT_NODE_VERSION_FILE='+data.decode('utf-8','replace').strip()[:50])
    else:print('N7_AUDIT_LOCKFILE_BYTES='+str(len(data)))
   except ftplib.error_perm as ex:print('N7_AUDIT_FILE_'+filename.replace('.','_').upper()+'=not_accessible')
  for rel in ('node_modules/docling','node_modules/qdrant','node_modules/@qdrant','node_modules/crawl4ai','node_modules/sqlite3','node_modules/better-sqlite3','node_modules/pdf-parse','node_modules/mammoth'):
   try:
    ftp.cwd(ROOT+'/'+rel)
    print('N7_AUDIT_MODULE_'+rel.replace('/','_').replace('-','_').replace('@','')+'=present')
   except ftplib.error_perm:
    print('N7_AUDIT_MODULE_'+rel.replace('/','_').replace('-','_').replace('@','')+'=not_found')
  print('N7_AUDIT_HOST_EXECUTION_CAPABILITY=not_testable_via_ftps')
  print('N7_AUDIT_AVAILABLE_RAM_CPU_PYTHON=not_testable_via_ftps')
  print('N7_AUDIT_FILE_WRITE_PERMISSIONS=not_tested_safety')
 finally:
  try:ftp.quit()
  except Exception:pass
 for suffix in ('/health','/api/status'):
  try:
   with urllib.request.urlopen('https://bot.piratecartography.com'+suffix,timeout=15) as response:
    payload=json.loads(response.read(10000))
    if suffix=='/health':
     print('N7_AUDIT_HEALTH='+str(payload.get('status','unknown')))
     print('N7_AUDIT_MODEL_CONFIGURED='+str(bool(payload.get('modelConfigured'))))
    else:
     print('N7_AUDIT_QUEUE_AVAILABLE='+str(bool(payload.get('queueModelAvailable'))))
  except Exception as ex:print('N7_AUDIT_HTTP_ERROR_'+suffix[1:].replace('/','_')+'='+type(ex).__name__)
 print('N7_AUDIT_READ_ONLY_COMPLETE=true')
if __name__=='__main__':main()
