#!/usr/bin/env python3
"""N7 library-only schema request: FTPS staged, verified, then existing private cron applies DDL."""
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path
import posixpath
import socket
import subprocess
import ssl
import sys
import time
import uuid

ROOT=Path(__file__).resolve().parents[2]
HOST=os.environ['PCT_FTPS_HOST']
USER=os.environ['PCT_FTPS_USER']
PASSWORD=os.environ['PCT_FTPS_PASSWORD']
PORT=int(os.environ.get('PCT_FTPS_PORT','21'))
TLS_NAME=os.environ.get('PCT_FTPS_TLS_SERVER_NAME','').strip()
REV=os.environ['GITHUB_SHA']
BASE='/piratecartography-gateway/tools/storage'
LIB='/piratecartography-gateway/tools/library'
FILES=('n7_library_schema_request.php','pct_research_store.php')
if os.environ.get('PCT_FTPS_APP_ROOT')!='/piratecartography-gateway/server/command-center-live':
    raise SystemExit('BLOCKED_APP_ROOT')
if len(REV)!=40 or any(ch not in '0123456789abcdef' for ch in REV):
    raise SystemExit('BLOCKED_REVISION')
payload={name:(ROOT/'tools/storage'/name).read_bytes() for name in FILES}
source_hashes={name:hashlib.sha256((ROOT/'tools/library'/name).read_bytes()).hexdigest() for name in ('schema.sql','n7_library.php')}
manifest=dict(schema='n7-library-additive-install-request-v1',
              database='piratecartography', confirmation='INSTALL-N7-LIBRARY-SCHEMA',
              source_revision=REV, code_sha256=source_hashes)
payload['.n7-library-install-request.json']=(json.dumps(manifest,indent=2)+'\n').encode()
try:
    previous=subprocess.check_output(['git','show','HEAD^:tools/storage/pct_research_store.php'],cwd=ROOT,timeout=20)
except (subprocess.CalledProcessError,subprocess.TimeoutExpired,FileNotFoundError) as exc:
    raise SystemExit('BLOCKED_CANNOT_VERIFY_PREVIOUS_STORAGE_REVISION') from exc
expected_old=hashlib.sha256(previous).hexdigest()
# Every uploaded byte is pinned, but the currently deployed storage script must not be overwritten
# if the server has untracked changes. The old importer is compared to the declared main version.
ftp=ftplib.FTP_TLS(timeout=30,context=ssl.create_default_context())
backups={}; staged=[]; activated=[]; archived={}
nonce=uuid.uuid4().hex[:12]
phase='CONNECT'
def read(name):
    buffer=[]
    ftp.retrbinary('RETR '+name,buffer.append)
    return b''.join(buffer)
try:
    if TLS_NAME:
        a={i[4][0] for i in socket.getaddrinfo(HOST,PORT,type=socket.SOCK_STREAM)}
        b={i[4][0] for i in socket.getaddrinfo(TLS_NAME,PORT,type=socket.SOCK_STREAM)}
        if not a.intersection(b):raise RuntimeError('TLS_NAME_NOT_MATCHING_CONFIGURED_HOST')
    ftp.connect(HOST,PORT)
    if TLS_NAME:ftp.host=TLS_NAME
    phase='AUTH'
    ftp.login(USER,PASSWORD)
    ftp.prot_p()
    phase='PREFLIGHT'
    ftp.cwd(BASE)
    names={posixpath.basename(x.rstrip('/')) for x in ftp.nlst()}
    if 'pct_research_store.php' not in names:raise RuntimeError('STORAGE_IMPORTER_MISSING')
    ftp.cwd(LIB)
    for name, digest in source_hashes.items():
        if hashlib.sha256(read(name)).hexdigest()!=digest:
            raise RuntimeError('LIBRARY_DEPLOYMENT_NOT_VERIFIED')
    ftp.cwd(BASE)
    # Avoid replacing host-local changes by comparing to repository version before this PR.
    current=read('pct_research_store.php')
    if hashlib.sha256(current).hexdigest()!=expected_old:
        raise RuntimeError('HOST_STORAGE_SCRIPT_DIFFERS_FROM_PREVIOUS_RELEASE')
    if b'n7LibrarySchemaRequest' in current:
        raise RuntimeError('LIBRARY_SCHEMA_HOOK_ALREADY_PRESENT')
    for name in FILES:
        if name in names:
            backups[name]=read(name)
        else:
            backups[name]=None
    try:
        read('.n7-library-install-request.json')
        raise RuntimeError('UNCONSUMED_SCHEMA_REQUEST_EXISTS')
    except ftplib.error_perm as ex:
        if not str(ex).startswith('550'):raise
    backups['.n7-library-install-request.json']=None
    phase='STAGE'
    for name,data in payload.items():
        stage='.n7-schema-stage-'+nonce+'-'+name.lstrip('.')
        ftp.storbinary('STOR '+stage,io.BytesIO(data))
        staged.append(stage)
        if hashlib.sha256(read(stage)).digest()!=hashlib.sha256(data).digest():
            raise RuntimeError('STAGE_CHECKSUM_FAILED')
    phase='ACTIVATE'
    for name in (*FILES,'.n7-library-install-request.json'):
        stage='.n7-schema-stage-'+nonce+'-'+name.lstrip('.')
        if backups[name] is not None:
            old='.n7-schema-before-'+nonce+'-'+name
            ftp.rename(name,old)
            archived[name]=old
        try:ftp.rename(stage,name)
        except Exception:
            if name in archived:ftp.rename(archived.pop(name),name)
            raise
        staged.remove(stage)
        activated.append(name)
    for name,data in payload.items():
        if hashlib.sha256(read(name)).digest()!=hashlib.sha256(data).digest():
            raise RuntimeError('FINAL_CHECKSUM_FAILED')
    print(json.dumps({'status':'SCHEMA_REQUEST_STAGED','database_executed':False,'files_verified':list(payload)}))
    # The existing host-local scheduled sync owns the schema migration and real database test.
    # Poll for its private FTPS-visible receipt; never claim database installed merely on upload.
    phase='CRON_RECEIPT'
    for _ in range(21):
        try:
            receipt=json.loads(read('.n7-library-schema-status.json'))
            if receipt.get('source_revision')==REV and receipt.get('status')=='PASS' and receipt.get('roundtrip')=='PASS_ROLLED_BACK':
                print(json.dumps({'status':'DB_SCHEMA_INSTALLED_AND_ROUNDTRIP_PASS','receipt':receipt}))
                sys.exit(0)
            if receipt.get('status')=='BLOCKED' and receipt.get('source_revision')==REV:
                print(json.dumps({'status':'SCHEMA_REQUEST_BLOCKED','receipt':receipt}))
                sys.exit(1)
        except (ftplib.error_perm,json.JSONDecodeError):
            pass
        time.sleep(20)
    print(json.dumps({'status':'SCHEMA_REQUEST_STAGED_AWAITING_CRON','database_execution_confirmed':False}))
except Exception as error:
    print(json.dumps({'status':'FTPS_DEPLOY_FAILED','phase':phase,'error_type':type(error).__name__}))
    if phase!='CRON_RECEIPT':
        for name in reversed(activated):
            try:
                ftp.delete(name)
                if name in archived:ftp.rename(archived[name],name)
                elif backups.get(name) is not None:
                    ftp.storbinary('STOR '+name,io.BytesIO(backups[name]))
            except Exception:
                print('ROLLBACK_REQUIRES_MANUAL_INSPECTION',name)
    sys.exit(1)
finally:
    for stage in staged:
        try:ftp.delete(stage)
        except Exception:pass
    try:ftp.quit()
    except Exception:pass
