#!/usr/bin/env python3
"""Read-only, bounded capture of installed application code; no data/config dirs."""
import argparse
import ftplib
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import ssl

ROOT = '/bot.piratecartography.com/n7-app'
TLS = 'linux3087.grserver.gr'
EXTENSIONS = {'.js', '.cjs', '.mjs', '.py', '.css', '.html'}
MAX_FILE = 8 * 1024 * 1024
MAX_TOTAL = 40 * 1024 * 1024
KEY = re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|gsk_[A-Za-z0-9]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{30,}|AIza[A-Za-z0-9_-]{30,})')


def safe_name(name):
    return bool(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', name))


def capture(ftp, destination, protected_values=()):
    payload = {}
    total = 0

    def read(relative):
        nonlocal total
        chunks = []
        size = 0

        def append(chunk):
            nonlocal size
            size += len(chunk)
            if size > MAX_FILE or total + size > MAX_TOTAL:
                raise ValueError('Live source exceeds capture bounds')
            chunks.append(chunk)

        ftp.retrbinary('RETR ' + ROOT + '/' + relative, append)
        data = b''.join(chunks)
        if KEY.search(data) or any(value and len(value) >= 12 and value.encode() in data for value in protected_values):
            raise ValueError('Possible embedded credential; source capture withheld')
        total += size
        payload[relative] = data

    def walk(relative, depth=0):
        if depth > 5:
            raise ValueError('Unexpected public source directory depth')
        directory = ROOT + ('/' + relative if relative else '')
        entries = sorted(ftp.mlsd(directory), key=lambda entry: entry[0])
        for name, facts in entries:
            if not safe_name(name):
                continue
            path = relative + '/' + name if relative else name
            if facts.get('type') == 'dir':
                # Explicit source roots only: never .env, data, tmp, node_modules or learned memory.
                if path in {'public', 'public/n7-pdf', 'public/assets', 'public/assets/n7'}:
                    walk(path, depth + 1)
            elif facts.get('type') == 'file':
                allowed = (not relative or relative.startswith('public')) and Path(name).suffix in EXTENSIONS
                if path == 'package.json' or allowed:
                    read(path)

    walk('')
    if 'server.js' not in payload or b'independent-ai-bot' not in payload.get('package.json', b''):
        raise ValueError('Unexpected installed application')
    # Only immutable built-in skill source names; never enumerate private revisions/memory.
    for name in ('registry.js', 'learning.js', 'proposals.js', 'improvements.js'):
        try:
            read('skills/' + name)
        except ftplib.error_perm as error:
            if not str(error).startswith('550'):
                raise
    for skill in ('greek-prose-editor', 'historical-source-audit'):
        try:
            read('skills/' + skill + '/SKILL.md')
        except ftplib.error_perm as error:
            if not str(error).startswith('550'):
                raise
    # Check for concurrent changes before exporting a usable snapshot.
    for name, expected in payload.items():
        digest = hashlib.sha256()
        ftp.retrbinary('RETR ' + ROOT + '/' + name, digest.update)
        if digest.hexdigest() != hashlib.sha256(expected).hexdigest():
            raise ValueError('Live source changed during capture; retry without deploying')
    destination.mkdir(parents=True, exist_ok=False, mode=0o700)
    receipt = {'schema': 'n7-live-source/v1', 'root': ROOT, 'read_only': True,
               'excluded': ['credentials', 'private data', 'original documents', 'models', 'third-party vendor runtime', 'binary public assets'],
               'files': {name: hashlib.sha256(data).hexdigest() for name, data in payload.items()}}
    for name, data in payload.items():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        target.write_bytes(data)
        target.chmod(0o600)
    (destination / 'capture-manifest.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print('N7_LIVE_SOURCE_CAPTURED read_only=true files=' + str(len(payload)) + ' bytes=' + str(total))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    host = os.environ['PCT_FTPS_HOST']
    port = int(os.getenv('PCT_FTPS_PORT', '21'))
    ips = lambda name: {item[4][0] for item in socket.getaddrinfo(name, port, type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):
        raise ValueError('Unexpected FTPS host')
    ftp = ftplib.FTP_TLS(timeout=35, context=ssl.create_default_context())
    try:
        ftp.connect(host, port)
        ftp.host = TLS
        ftp.login(os.environ['PCT_FTPS_USER'], os.environ['PCT_FTPS_PASSWORD'])
        ftp.prot_p()
        protected = [value for name, value in os.environ.items() if any(word in name for word in ('TOKEN', 'SECRET', 'PASSWORD', 'API_KEY'))]
        capture(ftp, args.destination, protected)
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            ftp.close()


if __name__ == '__main__':
    main()
