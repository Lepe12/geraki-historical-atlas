#!/usr/bin/env python3
"""Read-only measured WordPress file footprint, 3 concurrent FTPS data sessions."""
import collections
import ftplib
import json
import os
import queue
import socket
import ssl
import threading
import time

ROOT='/httpdocs'
DOMAIN_FINGERPRINT='linux3087.grserver.gr'
MAX_SECONDS=430
WORKERS=3
Q=queue.Queue()
LOCK=threading.Lock()
STATS={
    'folders':0,'files':0,'known_bytes':0,'unmeasured_files':0,'directory_errors':0,
    'section_bytes':collections.Counter(), 'extensions_bytes':collections.Counter()
}
ERRORS=[]
START=time.monotonic()


def connect():
    host=os.environ['PCT_FTPS_HOST'];port=int(os.getenv('PCT_FTPS_PORT','21'))
    def ips(name):return {x[4][0] for x in socket.getaddrinfo(name,port,type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(DOMAIN_FINGERPRINT)):
        raise RuntimeError('UNEXPECTED_FTPS_HOST')
    ftp=ftplib.FTP_TLS(timeout=38,context=ssl.create_default_context())
    ftp.connect(host,port)
    ftp.host=DOMAIN_FINGERPRINT
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    return ftp


def section(folder):
    parts=folder[len(ROOT):].strip('/').split('/')
    if parts[0]=='wp-content':
        return 'wp-content/'+(parts[1] if len(parts)>1 else '(root)')
    if parts[0] in ('wp-admin','wp-includes'):
        return parts[0]
    return '(root-other)'


def one(ftp,folder):
    records=list(ftp.mlsd(folder,facts=['type','size']))
    total=0
    count=0
    missing=0
    newdirs=[]
    extensions=collections.Counter()
    for name,facts in records:
        if name in ('.','..') or '/' in name or '\\' in name:continue
        kind=facts.get('type')
        if kind=='dir':
            newdirs.append(folder.rstrip('/')+'/'+name)
        elif kind=='file':
            count+=1
            size=facts.get('size')
            if size is None or not size.isdigit():
                missing+=1
            else:
                total+=int(size)
                ext=name.rpartition('.')[2].lower() if '.' in name else '(none)'
                if ext in ('pdf','jpg','jpeg','png','webp','gif','zip','tgz','gz','mp4','mov','mp3'):
                    extensions[ext]+=int(size)
    with LOCK:
        STATS['folders']+=1
        STATS['files']+=count
        STATS['known_bytes']+=total
        STATS['unmeasured_files']+=missing
        STATS['section_bytes'][section(folder)]+=total
        STATS['extensions_bytes'].update(extensions)
        n=STATS['folders']
        if n%100==0:
            print('WP_AUDIT_PROGRESS '+json.dumps({'folders':n,'files':STATS['files'],'size_gb':round(STATS['known_bytes']/1e9,3),'elapsed_s':round(time.monotonic()-START)}),flush=True)
    for d in newdirs:
        Q.put(d)


def worker(i):
    try:
        ftp=connect()
    except Exception as e:
        with LOCK:ERRORS.append(type(e).__name__)
        return
    try:
        while time.monotonic()-START < MAX_SECONDS:
            try:folder=Q.get(timeout=1)
            except queue.Empty:
                if Q.unfinished_tasks==0:break
                continue
            try:
                one(ftp,folder)
            except Exception as e:
                with LOCK:
                    STATS['directory_errors']+=1
                    ERRORS.append(type(e).__name__)
            finally:
                Q.task_done()
    finally:
        try:ftp.quit()
        except ftplib.all_errors:ftp.close()


def main():
    Q.put(ROOT)
    threads=[threading.Thread(target=worker,args=(i,),daemon=True) for i in range(WORKERS)]
    for t in threads:t.start()
    for t in threads:t.join(timeout=MAX_SECONDS+45)
    with LOCK:
        total=STATS['known_bytes']
        print('WP_FTPS_DOSSIER '+json.dumps({
            'root':ROOT,
            'measured_files':STATS['files'],
            'measured_folders':STATS['folders'],
            'file_bytes_known':total,
            'file_gb_known':round(total/1e9,3),
            'unmeasured_files':STATS['unmeasured_files'],
            'directory_errors':STATS['directory_errors'],
            'queued_or_inflight_dirs':Q.unfinished_tasks,
            'complete':Q.unfinished_tasks==0 and STATS['unmeasured_files']==0 and STATS['directory_errors']==0 and not ERRORS,
            'section_gb':{k:round(v/1e9,3) for k,v in STATS['section_bytes'].most_common(20)},
            'extensions_gb':{k:round(v/1e9,3) for k,v in STATS['extensions_bytes'].most_common(12)},
            'elapsed_seconds':round(time.monotonic()-START),
            'error_types':list(sorted(set(ERRORS)))[:5]
        },sort_keys=True),flush=True)
    print('WP_DATABASE_SIZE=UNMEASURED_VIA_FTPS',flush=True)
    print('WP_MAILBOX_SIZE=UNMEASURED_VIA_FTPS',flush=True)
    print('WP_OS_AND_BACKUPS=NOT_INCLUDED',flush=True)
    print('WP_FTPS_READ_ONLY=true',flush=True)


if __name__=='__main__':main()
