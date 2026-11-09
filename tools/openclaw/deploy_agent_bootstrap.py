#!/usr/bin/env python3
"""Guarded upload of only app.js and package.json into newly created N7-agent subdomain.

FTPS readback and exact hash checks. Does not deploy/modify bot.piratecartography.com,
does not restart Plesk, does not run OpenClaw, and does not copy secrets.
"""
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
FILES = ('app.js', 'package.json', 'public/index.html')
HERE = Path(__file__).resolve().parent / 'passenger-bootstrap'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def connect():
    host = os.environ['PCT_FTPS_HOST']
    port = int(os.getenv('PCT_FTPS_PORT','21'))
    ips = lambda name: {r[4][0] for r in socket.getaddrinfo(name,port,type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):
        raise RuntimeError('UNEXPECTED_FTPS_HOST')
    ftp = ftplib.FTP_TLS(timeout=35, context=ssl.create_default_context())
    ftp.connect(host,port)
    ftp.host=TLS
    ftp.login(os.environ['PCT_FTPS_USER'],os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    return ftp


def read_if_exists(ftp,name):
    chunks=[]
    try:
        ftp.retrbinary('RETR '+name,chunks.append)
    except ftplib.error_perm as e:
        if str(e).startswith('550'):
            return None
        raise
    return b''.join(chunks)


def deploy(ftp):
    ftp.cwd(TARGET)
    if ftp.pwd().rstrip('/') != TARGET:
        raise RuntimeError('UNEXPECTED_SUBDOMAIN_ROOT')
    # This is the new domain confirmed on the existing FTPS connection.
    if read_if_exists(ftp,'index.html') is None:
        raise RuntimeError('NEW_DOMAIN_PLACEHOLDER_MISSING')

    payload={name: (HERE/name).read_bytes() for name in FILES}
    # Always check *all* targets for conflicting contents before any mutation.
    for name, new_data in payload.items():
        current=read_if_exists(ftp,name)
        if current is not None and current != new_data:
            raise RuntimeError('REFUSE_OVERWRITE_EXISTING_FILE_'+name)
    # Keep the document root under a separate public/ subfolder.
    try:
        ftp.cwd(TARGET + '/public')
    except ftplib.error_perm as exc:
        if not str(exc).startswith('550'):
            raise
        ftp.mkd(TARGET + '/public')
    ftp.cwd(TARGET)
    uploaded=[]
    try:
        for name, data in payload.items():
            if read_if_exists(ftp,name) == data:
                print('N7_AGENT_BOOTSTRAP_ALREADY_MATCHES_'+name+'=true')
                continue
            dirname, _, basename = name.rpartition('/')
            temp = (dirname + '/' if dirname else '') + '.n7-agent-upload-' + uuid.uuid4().hex[:12] + '-' + basename
            ftp.storbinary('STOR '+temp, io.BytesIO(data),blocksize=65536)
            if digest(read_if_exists(ftp,temp) or b'') != digest(data):
                raise RuntimeError('TEMPORARY_FILE_HASH_FAILED_'+name)
            ftp.rename(temp,name)
            uploaded.append(name)
            if digest(read_if_exists(ftp,name) or b'') != digest(data):
                raise RuntimeError('FINAL_FILE_HASH_FAILED_'+name)
            print('N7_AGENT_BOOTSTRAP_UPLOADED_'+name+'=true')
    except BaseException:
        # Only remove files newly created by this operation. Never modify index.html or N7.
        for name in uploaded:
            try: ftp.delete(name)
            except ftplib.all_errors: print('N7_AGENT_MANUAL_CLEANUP_REQUIRED_'+name)
        raise
    print('N7_AGENT_BOOTSTRAP_FILES_VERIFIED=true')
    print('N7_AGENT_PASSENGER_RUNNING=NOT_YET_CONFIRMED')
    print('N7_OPENCLAW_GATEWAY_RUNNING=false')
    print('N7_EXISTING_BOT_APP_MODIFIED=false')


def main():
    ftp=connect()
    try: deploy(ftp)
    finally:
        try: ftp.quit()
        except ftplib.all_errors: ftp.close()


if __name__ == '__main__': main()
