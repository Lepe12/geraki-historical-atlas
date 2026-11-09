#!/usr/bin/env python3
"""Stage a pinned, verified OpenClaw npm archive in the *private* N7 Plesk app tree.

This does not install npm packages, launch processes, change Plesk settings,
restart Passenger or modify any current N7 code/config/data.
"""
from __future__ import annotations

import ftplib
import hashlib
import io
import os
import socket
import ssl
import urllib.request

VERSION = '2026.11.2'
URL = f'https://registry.npmjs.org/openclaw/-/openclaw-{VERSION}.tgz'
EXPECTED_SHA512_B64 = 'SgBml4WLp8V1DdAYkrTPLzVdA/iYo3iuHCtm4788GjaG83QZdd1VeOTlue0HBJGdn3SbFE06b6uPs+AM5ShMgg=='
FTP_ROOT = '/bot.piratecartography.com/n7-app'
STAGING_DIR = '.openclaw-staging'
TLS_HOST = 'linux3087.grserver.gr'
MAX_ARCHIVE = 160 * 1024 * 1024


def checked_archive(data: bytes) -> dict:
    import base64
    if not data or len(data) > MAX_ARCHIVE:
        raise ValueError('OPENCLAW_PACKAGE_SIZE_INVALID')
    got = base64.b64encode(hashlib.sha512(data).digest()).decode()
    if got != EXPECTED_SHA512_B64:
        raise ValueError('OPENCLAW_PACKAGE_INTEGRITY_FAILED')
    return {'version': VERSION, 'source': URL, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'runtime_started': False}


def download() -> bytes:
    req = urllib.request.Request(URL, headers={'User-Agent': 'N7-verified-stager/1'})
    with urllib.request.urlopen(req, timeout=90, context=ssl.create_default_context()) as response:
        if response.status != 200:
            raise ValueError('OPENCLAW_DOWNLOAD_HTTP_ERROR')
        raw = response.read(MAX_ARCHIVE + 1)
    checked_archive(raw)
    return raw


def ftp_connection():
    host = os.environ['PCT_FTPS_HOST']
    port = int(os.environ.get('PCT_FTPS_PORT', '21'))
    ip_addresses = lambda name: {entry[4][0] for entry in socket.getaddrinfo(name, port, type=socket.SOCK_STREAM)}
    if not ip_addresses(host).intersection(ip_addresses(TLS_HOST)):
        raise ValueError('FTPS_TLS_HOST_MISMATCH')
    ftp = ftplib.FTP_TLS(timeout=45, context=ssl.create_default_context())
    ftp.connect(host, port)
    ftp.host = TLS_HOST
    ftp.login(os.environ['PCT_FTPS_USER'], os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    return ftp


def stage(ftp, archive: bytes, meta: dict):
    ftp.cwd(FTP_ROOT)
    try:
        ftp.cwd(STAGING_DIR)
    except ftplib.error_perm as exc:
        if not str(exc).startswith('550'):
            raise
        ftp.mkd(STAGING_DIR)
        ftp.cwd(STAGING_DIR)

    target = f'openclaw-{VERSION}.tgz'
    incoming = target + '.uploading'
    try:
        ftp.size(target)
    except ftplib.error_perm as exc:
        if not str(exc).startswith('550'):
            raise
    else:
        existing = hashlib.sha256()
        ftp.retrbinary('RETR ' + target, existing.update)
        if existing.hexdigest() != meta['sha256']:
            raise ValueError('STAGED_PACKAGE_EXISTS_WITH_DIFFERENT_HASH')
        print('N7_OPENCLAW_STAGE_ALREADY_MATCHES=true')
        return

    ftp.storbinary('STOR ' + incoming, io.BytesIO(archive), blocksize=128 * 1024)
    sha = hashlib.sha256()
    ftp.retrbinary('RETR ' + incoming, sha.update, blocksize=128 * 1024)
    if sha.hexdigest() != meta['sha256']:
        raise ValueError('STAGED_PACKAGE_READBACK_HASH_MISMATCH')
    ftp.rename(incoming, target)
    published = hashlib.sha256()
    ftp.retrbinary('RETR ' + target, published.update, blocksize=128 * 1024)
    if published.hexdigest() != meta['sha256']:
        raise ValueError('STAGED_PACKAGE_FINAL_READBACK_HASH_MISMATCH')
    print('N7_OPENCLAW_STAGING_UPLOAD_VERIFIED=true')
    print('N7_OPENCLAW_VERSION=' + VERSION)
    print('N7_OPENCLAW_BYTES=' + str(meta['bytes']))
    print('N7_OPENCLAW_SHA256=' + meta['sha256'])
    print('N7_OPENCLAW_GATEWAY_RUNNING=false')


def main():
    archive = download()
    info = checked_archive(archive)
    ftp = ftp_connection()
    try:
        stage(ftp, archive, info)
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            ftp.close()


if __name__ == '__main__':
    main()
