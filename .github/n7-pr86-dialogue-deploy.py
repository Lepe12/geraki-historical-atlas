#!/usr/bin/env python3
"""One-shot fail-closed N7 PR86 dialogue UI activation via existing Atlas FTPS secrets.

Only approved, PUBLIC frontend/router modules and release receipt are changed.
No private source, credentials, model settings, conversation files, database or NABOU
assets are fetched into GitHub. Does not modify the server entry point or avatar.
"""
import ftplib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import secrets
import socket
import ssl
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT='/bot.piratecartography.com/n7-app'
BASE='https://bot.piratecartography.com'
TLS='linux3087.grserver.gr'
EXPECTED_OLD_COMMIT='f903c06557fb2692fd7eccc05bed89c6c72107c2'
EXPECTED_NEW_COMMIT='d41cac919395a3ef340cd963b8ad545099dde3d2'
OLD_STAGE_SHA='d9241f04f4d2658fff6d2ceb53d14d87beca79bb4870184006d3443a59e9c811'
NEW_STAGE_SHA='c945502980c0a50a26ec467804a31d2e5b6dda725bc0581183d72b8963557c3c'
CHANGED=('n7-command-router.js','public/app.js','public/index.html')
MANIFEST='release-manifest.json'
MAX_FILE=8*1024*1024

def sha(b):
    return hashlib.sha256(b).hexdigest()

def local(path):
    return Path(path).read_bytes()

def config():
    r=json.loads(local('.github/n7-pr86-contract.json'))
    if r.get('schema')!='n7-reconciled-deploy/v1' or r.get('target')!=ROOT:
        raise RuntimeError('N7_CONTRACT_IDENTITY_INVALID')
    new=r.get('files',{});previous=r.get('previous_files',{})
    if len(new)!=69 or set(new)!=set(previous):
        raise RuntimeError('N7_CONTRACT_FILE_LIST_CHANGED')
    if {k for k in new if new[k]!=previous[k]}!=set(CHANGED):
        raise RuntimeError('N7_UNEXPECTED_RELEASE_CHANGE_SCOPE')
    if r['release_id']!=sha(json.dumps(new,sort_keys=True,separators=(',',':')).encode()):
        raise RuntimeError('N7_CONTRACT_RELEASE_HASH_INVALID')
    for key,value in {**new,**previous}.items():
        if not isinstance(value,str) or len(value)!=64 or any(c not in '0123456789abcdef' for c in value):
            raise RuntimeError('N7_INVALID_FILE_HASH '+key)
    return r

def load_modules(r):
    old_router=local('tools/n7/n7-command-router.js')
    new_router=local('.github/n7-pr86-new-router.js')
    old_stage=local('tools/n7/humanoid-stage.js')
    new_stage=local('.github/n7-pr86-new-stage.js')
    if (sha(old_router)!=r['previous_files']['n7-command-router.js']
            or sha(new_router)!=r['files']['n7-command-router.js']):
        raise RuntimeError('N7_ROUTER_SOURCE_IDENTITY_INVALID')
    if sha(old_stage)!=OLD_STAGE_SHA or sha(new_stage)!=NEW_STAGE_SHA:
        raise RuntimeError('N7_STAGE_SOURCE_IDENTITY_INVALID')
    if b'one-tap, hands-free Greek conversation' not in new_stage:
        raise RuntimeError('N7_HANDSFREE_BEHAVIOUR_MISSING')
    return old_router,new_router,old_stage,new_stage

def read(ftp,name):
    buf=[];size=0
    def add(part):
        nonlocal size
        size+=len(part)
        if size>MAX_FILE:raise RuntimeError('N7_LIVE_FILE_TOO_LARGE')
        buf.append(part)
    ftp.retrbinary('RETR '+ROOT+'/'+name,add)
    return b''.join(buf)

def connect():
    host=os.environ['PCT_FTPS_HOST']
    port=int(os.getenv('PCT_FTPS_PORT','21'))
    ips=lambda name:{entry[4][0] for entry in socket.getaddrinfo(name,port,type=socket.SOCK_STREAM)}
    if not (ips(host)&ips(TLS)):
        raise RuntimeError('N7_FTPS_HOST_IDENTITY_MISMATCH')
    ftp=ftplib.FTP_TLS(timeout=40,context=ssl.create_default_context())
    ftp.connect(host,port);ftp.host=TLS
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p();ftp.cwd(ROOT)
    if ftp.pwd().rstrip('/')!=ROOT:
        raise RuntimeError('N7_UNEXPECTED_N7_ROOT')
    return ftp

def syntax(data):
    with tempfile.NamedTemporaryFile(suffix='.js') as f:
        f.write(data);f.flush()
        result=subprocess.run(['node','--check',f.name],capture_output=True,timeout=30)
        if result.returncode:raise RuntimeError('N7_PUBLIC_APP_JAVASCRIPT_INVALID')

def assemble(old_app,old_index,style,modules,release):
    old_router,new_router,old_stage,new_stage=modules
    if old_app.count(old_router)!=1 or old_app.count(old_stage)!=1:
        raise RuntimeError('N7_COMPILED_FRONTEND_ANCHOR_MISMATCH')
    app=old_app.replace(old_router,new_router,1).replace(old_stage,new_stage,1)
    if sha(app)!=release['files']['public/app.js']:
        raise RuntimeError('N7_COMPILED_APP_NOT_CANONICAL')
    syntax(app)
    spec=importlib.util.spec_from_file_location('n7_asset_version','tools/n7/asset_version.py')
    versioner=importlib.util.module_from_spec(spec);spec.loader.exec_module(versioner)
    index=versioner.version_html(old_index,app,style)
    if sha(index)!=release['files']['public/index.html']:
        raise RuntimeError('N7_COMPILED_INDEX_NOT_CANONICAL')
    return app,index

def url(path):
    return urllib.request.Request(BASE+path,headers={
        'Cache-Control':'no-store, no-cache','Pragma':'no-cache',
        'User-Agent':'N7-PR86-owner-approved-dialogue-verify/1'})

def health(release_id,commit,deadline=90):
    stop=time.monotonic()+deadline
    while True:
        try:
            with urllib.request.urlopen(url('/health?n7check='+secrets.token_hex(8)),
                                        context=ssl.create_default_context(),timeout=15) as response:
                data=json.loads(response.read(20000))
            if (data.get('status')=='ok' and data.get('modelConfigured') is True and
                data.get('release')=={'id':release_id,'canonical_commit':commit}):
                return
        except (OSError,ValueError):
            pass
        if time.monotonic()>stop:raise RuntimeError('N7_HEALTH_RELEASE_NOT_VERIFIED')
        time.sleep(2)

def private_endpoints():
    for path in ('/api/conversations','/api/tasks'):
        try:
            with urllib.request.urlopen(url(path),context=ssl.create_default_context(),timeout=15) as response:response.read(1000)
        except urllib.error.HTTPError as err:
            if err.code==401:continue
            raise
        raise RuntimeError('N7_PRIVATE_ENDPOINT_EXPOSED '+path)

def preflight(ftp,r,modules):
    current={}
    for name,expected in r['previous_files'].items():
        data=read(ftp,name)
        if sha(data)!=expected:raise RuntimeError('N7_PREDEPLOY_RUNTIME_DRIFT '+name)
        if name in CHANGED:current[name]=data
        if name=='public/style.css':style=data
    original_receipt=read(ftp,MANIFEST)
    receipt=json.loads(original_receipt)
    if (receipt.get('schema')!='n7-runtime-build/v1' or
        receipt.get('files')!=r['previous_files'] or
        receipt.get('release_id')!=sha(json.dumps(r['previous_files'],sort_keys=True,separators=(',',':')).encode()) or
        receipt.get('canonical_commit')!=EXPECTED_OLD_COMMIT):
        raise RuntimeError('N7_LIVE_RECEIPT_DRIFT')
    app,index=assemble(current['public/app.js'],current['public/index.html'],style,modules,r)
    next_receipt=dict(receipt)
    next_receipt.update(release_id=r['release_id'],canonical_commit=EXPECTED_NEW_COMMIT,
                        source_lock_verified=True,files=r['files'],
                        deployment='verified-n7-pr86-public-dialogue-only')
    targets={'n7-command-router.js':modules[1],'public/app.js':app,'public/index.html':index,
             MANIFEST:(json.dumps(next_receipt,indent=2)+'\n').encode()}
    health(receipt['release_id'],EXPECTED_OLD_COMMIT,deadline=25)
    private_endpoints()
    print('N7_DIALOGUE_PREFLIGHT_OK old_release_verified=true changed_runtime_files=3 model_configured=true private_401=true')
    current[MANIFEST]=original_receipt
    return targets,current

def verify_new(ftp,r,targets):
    health(r['release_id'],EXPECTED_NEW_COMMIT,deadline=100)
    private_endpoints()
    for name,data in targets.items():
        if read(ftp,name)!=data:raise RuntimeError('N7_DEPLOYED_FILE_READBACK_MISMATCH '+name)
    for public_file in ('public/app.js','public/index.html'):
        route='/app.js' if public_file.endswith('app.js') else '/'
        valid=False
        for _ in range(20):
            try:
                with urllib.request.urlopen(url(route+'?n7app='+secrets.token_hex(8)),
                                            context=ssl.create_default_context(),timeout=15) as response:
                    content=response.read(MAX_FILE+1)
                if sha(content)==r['files'][public_file]:valid=True;break
            except (OSError,ValueError):pass
            time.sleep(2)
        if not valid:raise RuntimeError('N7_PUBLIC_ASSET_NOT_ACTIVATED '+public_file)
    print('N7_DIALOGUE_LIVE_VERIFIED=true health=true private_401=true public_assets=true release_hashes=true')

def restart(ftp,tag):
    ftp.storbinary('STOR '+ROOT+'/tmp/restart.txt',io.BytesIO(('n7-pr86-'+tag+'\n').encode()))

def install(ftp,r,targets,originals):
    lock=ROOT+'/.n7-pr86-activate-lock'
    ftp.mkd(lock)
    tag=secrets.token_hex(8)
    staged={};backups={};installed=[]
    try:
        for name,data in targets.items():
            stage='.n7-pr86-stage-'+tag+'-'+name.replace('/','__')
            ftp.storbinary('STOR '+ROOT+'/'+stage,io.BytesIO(data))
            if read(ftp,stage)!=data:raise RuntimeError('N7_STAGE_HASH_MISMATCH '+name)
            staged[name]=stage
        for name,expected in r['previous_files'].items():
            if sha(read(ftp,name))!=expected:raise RuntimeError('N7_CONCURRENT_RUNTIME_DRIFT '+name)
        if read(ftp,MANIFEST)!=originals[MANIFEST]:raise RuntimeError('N7_CONCURRENT_RECEIPT_DRIFT')
        for name,data in targets.items():
            backup='.n7-pr86-backup-'+tag+'-'+name.replace('/','__')
            ftp.rename(ROOT+'/'+name,ROOT+'/'+backup)
            backups[name]=backup
            if read(ftp,backup)!=originals[name]:raise RuntimeError('N7_BACKUP_HASH_MISMATCH '+name)
            ftp.rename(ROOT+'/'+staged.pop(name),ROOT+'/'+name)
            installed.append(name)
            if read(ftp,name)!=data:raise RuntimeError('N7_ACTIVE_HASH_MISMATCH '+name)
        restart(ftp,tag)
        verify_new(ftp,r,targets)
    except BaseException:
        failures=[]
        for name in reversed(list(backups)):
            try:
                if name in installed:
                    if read(ftp,name)!=targets[name]:
                        raise RuntimeError('N7_CONCURRENT_ACTIVE_MUTATION')
                    ftp.delete(ROOT+'/'+name)
                ftp.rename(ROOT+'/'+backups[name],ROOT+'/'+name)
                if read(ftp,name)!=originals[name]:raise RuntimeError('N7_RESTORE_HASH_MISMATCH')
            except Exception:failures.append(name)
        if installed:
            try:restart(ftp,'rollback-'+tag)
            except Exception:failures.append('restart')
        print('N7_DIALOGUE_ROLLBACK_VERIFIED='+str(not failures).lower())
        if failures:print('N7_DIALOGUE_MANUAL_ROLLBACK_REQUIRED='+','.join(failures))
        raise
    finally:
        for stage in staged.values():
            try:ftp.delete(ROOT+'/'+stage)
            except ftplib.all_errors:pass
        try:ftp.rmd(lock)
        except ftplib.all_errors:pass
    print('N7_DIALOGUE_LIVE_DEPLOYED=true files_changed=4 data_paths_written=0 backups_retained=true')

def main():
    r=config();modules=load_modules(r)
    ftp=connect()
    try:
        targets,originals=preflight(ftp,r,modules)
        if os.getenv('N7_DRY_RUN','1')!='0':
            print('N7_DIALOGUE_DRY_RUN_PASS=true no_writes=true');return
        install(ftp,r,targets,originals)
    finally:
        try:ftp.quit()
        except ftplib.all_errors:ftp.close()

if __name__=='__main__':
    main()
