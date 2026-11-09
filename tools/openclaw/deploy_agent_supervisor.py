#!/usr/bin/env python3
"""Safely upgrade ONLY new n7-agent Passenger app with loopback-only Gateway supervisor."""
import ftplib
import hashlib
import io
import os
from pathlib import Path
import socket
import ssl
import uuid

TARGET = '/n7-agent.piratecartography.com'
TLS = 'linux3087.grserver.gr'
HERE = Path(__file__).resolve().parent / 'passenger-bootstrap'
OLD_APP_SHA256 = '29d7487e0dc1f43f8813fe8fb2df9f19965ca34208e895df9559f20518e28338'
OLD_GATEWAY_BLOB_SHA1 = '2f460df27c7c132c3a9cb1ce9d0bce5e7d271d2d'


def git_blob_sha(data):
    return hashlib.sha1(('blob '+str(len(data))+'\\0').replace('\\0', chr(0)).encode()+data).hexdigest()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def connect():
    host = os.environ['PCT_FTPS_HOST']
    port = int(os.getenv('PCT_FTPS_PORT','21'))
    ips = lambda name: {r[4][0] for r in socket.getaddrinfo(name,port,type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):
        raise RuntimeError('UNEXPECTED_FTPS_HOST')
    ftp=ftplib.FTP_TLS(timeout=45,context=ssl.create_default_context())
    ftp.connect(host,port)
    ftp.host=TLS
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    return ftp


def read(ftp,name):
    chunks=[]
    try: ftp.retrbinary('RETR '+name,chunks.append)
    except ftplib.error_perm as e:
        if str(e).startswith('550'): return None
        raise
    return b''.join(chunks)


def upload_verified(ftp,name,data):
    temp = '.n7-agent-atomic-' + uuid.uuid4().hex[:12] + '-' + name
    ftp.storbinary('STOR '+temp,io.BytesIO(data))
    if digest(read(ftp,temp) or b'') != digest(data):
        raise RuntimeError('TEMP_HASH_MISMATCH_'+name)
    return temp


def main():
    ftp=connect()
    try:
        ftp.cwd(TARGET)
        if ftp.pwd().rstrip('/') != TARGET:
            raise RuntimeError('UNEXPECTED_TARGET_ROOT')
        initial=read(ftp,'app.js')
        if initial is None:
            raise RuntimeError('APP_JS_MISSING')
        desired=(HERE/'app.js').read_bytes()
        addition=(HERE/'gateway-supervisor.js').read_bytes()
        existing_extra=read(ftp,'gateway-supervisor.js')
        if existing_extra is not None and existing_extra != addition:
            if git_blob_sha(existing_extra) != OLD_GATEWAY_BLOB_SHA1:
                raise RuntimeError('SUPERVISOR_CONFLICT_REFUSE_OVERWRITE')
        # Refuse destructive changes if another actor changed the bootstrap.
        if digest(initial) not in (OLD_APP_SHA256,digest(desired)):
            raise RuntimeError('APP_JS_CONFLICT_REFUSE_OVERWRITE')
        if read(ftp,'public/index.html') is None:
            raise RuntimeError('EXPECTED_PUBLIC_DOCROOT_MISSING')
        if existing_extra is None:
            tmp=upload_verified(ftp,'gateway-supervisor.js',addition)
            ftp.rename(tmp,'gateway-supervisor.js')
            if digest(read(ftp,'gateway-supervisor.js') or b'')!=digest(addition):
                raise RuntimeError('SUPERVISOR_READBACK_FAILED')
            print('N7_AGENT_SUPERVISOR_UPLOADED=true')
        elif existing_extra != addition:
            # Replacement is allowed only for the known earlier supervisor build.
            backup='.n7-agent-gateway-supervisor.pre-sigkill.js'
            saved=read(ftp,backup)
            if saved is None:
                tmp=upload_verified(ftp,'supervisor-backup',existing_extra)
                ftp.rename(tmp,backup)
            elif saved != existing_extra:
                raise RuntimeError('SUPERVISOR_BACKUP_CONFLICT')
            tmp=upload_verified(ftp,'gateway-supervisor.js',addition)
            ftp.delete('gateway-supervisor.js')
            try: ftp.rename(tmp,'gateway-supervisor.js')
            except BaseException:
                ftp.storbinary('STOR gateway-supervisor.js',io.BytesIO(existing_extra))
                raise
            if digest(read(ftp,'gateway-supervisor.js') or b'') != digest(addition):
                raise RuntimeError('SUPERVISOR_UPGRADE_READBACK_FAILED')
            print('N7_AGENT_SUPERVISOR_SAFE_HOTFIX_APPLIED=true')
        else:
            print('N7_AGENT_SUPERVISOR_ALREADY_MATCHES=true')
        if initial != desired:
            # One-time backup is never replaced; do not expose via public/ document root.
            backup='.n7-agent-app.js.pre-gateway-backup'
            backup_data=read(ftp,backup)
            if backup_data is None:
                tmp=upload_verified(ftp,'app-backup',initial)
                ftp.rename(tmp,backup)
            elif backup_data != initial:
                raise RuntimeError('BASELINE_BACKUP_CONFLICT')
            tmp=upload_verified(ftp,'app.js',desired)
            # Atomically substitute only the new domain's startup file.
            ftp.delete('app.js')
            try: ftp.rename(tmp,'app.js')
            except BaseException:
                ftp.storbinary('STOR app.js',io.BytesIO(initial))
                raise
            if digest(read(ftp,'app.js') or b'') != digest(desired):
                raise RuntimeError('APP_READBACK_HASH_FAILED')
            print('N7_AGENT_APP_JS_UPGRADED=true')
        else:
            print('N7_AGENT_APP_JS_ALREADY_MATCHES=true')
        # Passenger checks tmp/restart.txt on requests (new agent subdomain only).
        try: ftp.cwd('tmp')
        except ftplib.error_perm as e:
            if not str(e).startswith('550'): raise
            ftp.mkd('tmp')
            ftp.cwd('tmp')
        ftp.cwd(TARGET)
        ftp.storbinary('STOR tmp/restart.txt',io.BytesIO(uuid.uuid4().hex.encode() + b'\n'))
        print('N7_AGENT_PASSENGER_RESTART_REQUESTED=true')
        print('N7_AGENT_SUPERVISOR_FILES_VERIFIED=true')
        print('N7_AGENT_LOOPBACK_PORT=19487')
        print('N7_AGENT_GATEWAY_AUTOSTART_DISABLED_AFTER_SIGKILL=true')
        print('N7_EXISTING_N7_MODIFIED=false')
    finally:
        try: ftp.quit()
        except ftplib.all_errors: ftp.close()


if __name__=='__main__': main()
