#!/usr/bin/env python3
"""Bounded, read-only Top.Host FTPS file-size audit for X8 VPS sizing.

NO file content, credentials, full paths, or file names are emitted.
Database, mailbox, and VPS OS sizes are explicitly OUTSIDE this audit.
"""
import collections
import ftplib
import json
import os
import socket
import ssl
import time

HOST_FINGERPRINT = 'linux3087.grserver.gr'
ROOTS = (
    '/piratecartography.com',
    '/www.piratecartography.com',
    '/bot.piratecartography.com',
    '/n7-agent.piratecartography.com',
)
MAX_SECONDS = 490
MAX_DIRS_PER_ROOT = 18000
MAX_FILES_PER_ROOT = 250000


def connect():
    host = os.environ['PCT_FTPS_HOST']
    port = int(os.environ.get('PCT_FTPS_PORT', '21'))
    def ipset(h):
        return {x[4][0] for x in socket.getaddrinfo(h,port,type=socket.SOCK_STREAM)}
    if not ipset(host).intersection(ipset(HOST_FINGERPRINT)):
        raise RuntimeError('UNEXPECTED_FTPS_ENDPOINT')
    ftp=ftplib.FTP_TLS(timeout=48, context=ssl.create_default_context())
    ftp.connect(host,port)
    ftp.host=HOST_FINGERPRINT
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    return ftp


def entries(ftp,folder):
    try:
        return list(ftp.mlsd(folder, facts=['type','size']))
    except ftplib.error_perm as e:
        if str(e).startswith(('550','450','553')):
            raise FileNotFoundError('not_accessible') from e
        raise


def present(ftp, folder):
    try:
        ftp.cwd(folder)
        return True
    except ftplib.error_perm as e:
        if str(e).startswith(('550','450','553')):
            return False
        raise


def audit(ftp, root, start):
    if not present(ftp,root):
        return {'present':False,'complete':False}
    stack=[root]
    directories=0
    files=0
    total=0
    sizes_unknown=0
    errors=0
    ext_bytes=collections.Counter()
    root_direct_bytes=collections.Counter()
    root_direct_files=collections.Counter()
    while stack:
        if time.monotonic()-start > MAX_SECONDS:
            break
        if directories >= MAX_DIRS_PER_ROOT or files >= MAX_FILES_PER_ROOT:
            break
        folder=stack.pop()
        try:
            rows=entries(ftp,folder)
        except (OSError,ftplib.all_errors):
            errors+=1
            continue
        directories+=1
        for name,facts in rows:
            if name in ('.','..') or '/' in name or '\\' in name:
                continue
            kind=facts.get('type','')
            if kind in ('dir','cdir','pdir'):
                if kind=='dir':
                    stack.append(folder.rstrip('/')+'/'+name)
                continue
            if kind not in ('file',):
                continue
            files+=1
            raw=facts.get('size')
            if raw is None:
                sizes_unknown+=1
                continue
            try:
                size=int(raw)
            except (ValueError,TypeError):
                sizes_unknown+=1
                continue
            total+=size
            ext=name.rpartition('.')[2].lower() if '.' in name else '(none)'
            if ext in ('pdf','jpg','jpeg','png','webp','gif','zip','tgz','gz','sqlite','db','mp4','mov','mp3'):
                ext_bytes[ext]+=size
            sub=folder[len(root):].strip('/').split('/')[0] or '(root)'
            # Don't print arbitrary directory names: aggregate only approved labels.
            label=sub if sub in ('httpdocs','public','public_html','wp-content','wp-includes',
                                  'wp-admin','n7-app','node_modules','.openclaw-staging',
                                  '.n7-agent-state','logs','tmp','backup','backups') else '(other)'
            root_direct_bytes[label]+=size
            root_direct_files[label]+=1
        if directories%250==0:
            print('AUDIT_PROGRESS '+json.dumps({'root':root,'dirs':directories,
              'files':files,'gb':round(total/1e9,3),'elapsed_seconds':round(time.monotonic()-start)}),flush=True)
    complete=(not stack and errors==0 and sizes_unknown==0)
    return {'present':True,'complete':complete,'dirs':directories,'files':files,
            'known_bytes':total,'known_gb':round(total/1e9,3),
            'unmeasured_files':sizes_unknown,'directory_errors':errors,
            'remaining_dirs':len(stack),'largest_sections_gb':{
                k:round(v/1e9,3) for k,v in root_direct_bytes.most_common(12)
            },'extensions_gb':{k:round(v/1e9,3) for k,v in ext_bytes.most_common(12)},
            'elapsed_seconds':round(time.monotonic()-start)}


def main():
    start=time.monotonic()
    ftp=connect()
    try:
        print('TOPHOST_FTPS_READ_ONLY=PASS',flush=True)
        try:
            rootnames=[n for n,_ in entries(ftp,'/') if 'piratecartography' in n.lower()]
            print('TOPHOST_FTPS_DOMAIN_ENTRIES='+json.dumps(rootnames[:20]),flush=True)
        except Exception as e:
            print('TOPHOST_FTPS_ROOT_LIST_ERROR='+type(e).__name__,flush=True)
        stats={}
        for root in ROOTS:
            try:
                result=audit(ftp,root,start)
            except (OSError,ftplib.all_errors) as exc:
                result={'present':None,'complete':False,'scan_error':type(exc).__name__}
            stats[root]=result
            print('TOPHOST_FTPS_STORAGE_ROOT '+json.dumps({'root':root,**result},sort_keys=True),flush=True)
        known=sum(x.get('known_bytes',0) for x in stats.values())
        print('TOPHOST_FTPS_TOTAL_KNOWN_GB='+str(round(known/1e9,3)),flush=True)
        print('TOPHOST_DISK_DATABASE_SIZE=NOT_OBSERVABLE_VIA_FTPS',flush=True)
        print('TOPHOST_DISK_EMAIL_SIZE=NOT_OBSERVABLE_VIA_FTPS',flush=True)
        print('TOPHOST_DISK_OS_DOCKER_DATABASE_BACKUPS=ADDITIONAL',flush=True)
        print('X8_DISK_CAPACITY_GB=75',flush=True)
        print('TOPHOST_FTPS_AUDIT_COMPLETE='+str(all(x.get('complete') for x in stats.values() if x.get('present'))).lower(),flush=True)
    finally:
        try: ftp.quit()
        except ftplib.all_errors: ftp.close()


if __name__=='__main__':
    main()
