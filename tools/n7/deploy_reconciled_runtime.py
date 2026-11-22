#!/usr/bin/env python3
"""Guarded installation of a canonical N7 runtime using existing, hash-verified code.

No private source is stored in GitHub logs/artifacts. Only approved backend modules,
the release receipt and restart marker can change.
"""
import argparse
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import socket
import ssl
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile

ROOT = '/bot.piratecartography.com/n7-app'
PLESK_ROOT = Path('/var/www/vhosts/piratecartography.com' + ROOT)
BASE = 'https://bot.piratecartography.com'
TLS = 'linux3087.grserver.gr'
HERE = Path(__file__).resolve().parent
PUBLIC_MODULES = {'conversation-store.js': 'conversation-store.js',
                  'workspace-workflows.js': 'workspace-workflows.js',
                  'n7-queue-bridge.js': 'n7-queue-bridge.js',
                  'historical-research.js': '../library/n7-historical-research.js',
                  'n7-stream-attachments.js': 'stream-attachments.js',
                  'owner-chat-memory.js': 'owner-chat-memory.js',
                  'n7-apex-public-chat.cjs': 'apex-public-chat.cjs',
                  'source-library.js': 'source-library.js',
                  'document-reader.js': 'document-reader.js',
                  'browser-reader-hosts.json': '../../runtime/plesk/browser-reader-hosts.json',
                  'n7-release-info.js': 'runtime-release-info.js',
                  'n7-weather.js': 'weather-tool.js',
                  'n7-public-web-search.js': 'public-web-search.js',
                  'n7-semantic-assets.js': 'semantic-assets.js',
                  'n7-coding-agent.js': 'coding-agent-tool.js',
                  'n7-security-agent.js': 'security-agent.js',
                  # N7_SPECIALIST_AGENTS_V1: the News & Geopolitics and Weather agents, their dispatcher and the
                  # command router the dispatcher shares with the Humanoid. All new files, written only if absent
                  # or identical; a different file already on the server stops the installation.
                  'n7-agents.js': 'n7-agents.js',
                  'news-geopolitics.js': 'news-geopolitics.js',
                  'n7-command-router.js': 'n7-command-router.js',
                  # N7_CHAT_AGENT_V1: the chat model's own web search and read-only page reader (new file).
                  'n7-chat-agent.js': 'chat-agent.js'}
for _skill in ('book-project-canon', 'document-reading-plan', 'claim-evidence-ledger', 'editorial-preservation'):
    PUBLIC_MODULES['skills/' + _skill + '/SKILL.md'] = 'skills/' + _skill + '/SKILL.md'
# The engineering workflow is distributed with the other reviewed skills (owner decision, no secrets);
# skills/n7-verified-change/SKILL.md in the canonical repository is kept byte-identical by a test.
PUBLIC_MODULES['skills/n7-verified-change/SKILL.md'] = 'skills/n7-verified-change/SKILL.md'
PUBLIC_MODULES['skills/cybersecurity-audit/SKILL.md'] = '../../skills/cybersecurity-audit/SKILL.md'
# Apache-licensed upstream Agent Skills are reviewed, read-only files. The installer
# may add only these exact paths after verifying their reviewed release hashes.
for _skill in ('frontend-design', 'webapp-testing', 'mcp-builder', 'skill-creator'):
    for _filename in ('SKILL.md', 'LICENSE.txt'):
        _target = 'skills/' + _skill + '/' + _filename
        PUBLIC_MODULES[_target] = '../../' + _target
# Only the reviewed files for the new execution capability are upgradable.
for _file in ('agent.js', 'browser.js', 'browser-test.py',
              'skills/registry.js', 'skills/active.js', 'skills/mcp-client.js',
              'skills/mcp-builtin-server.js', 'skills/mcp-builder-runtime.js'):
    PUBLIC_MODULES[_file] = '../../' + _file
WRITABLE = {'server.js', 'public/app.js', 'public/index.html', 'public/style.css', 'release-manifest.json', *PUBLIC_MODULES}
LIMIT = 8 * 1024 * 1024
SECURITY_FILES = ('n7-security-agent.js', 'skills/cybersecurity-audit/SKILL.md',
                  'skills/mcp-builtin-server.js', 'skills/mcp-client.js', 'n7-agents.js')
SECURITY_READ_ONLY = ('server.js', 'n7-stream-attachments.js', 'n7-release-info.js',
                      'skills/registry.js', 'skills/mcp-builder-runtime.js')
AGENTS_EXTRA_MODULES = {'n7-private-answer-reader.js': '../library/n7-private-answer-reader.js',
                        'public/n7-mission-owner-ui.js': '../library/n7-mission-owner-ui.js'}
BROWSER_CONFIG = 'browser-reader-hosts.json'
AGENTS_COMPILED = ('public/app.js', 'public/index.html')
APEX_ROOT = 'public/n7-apex/'
APEX_ENTRY = (APEX_ROOT + 'index.txt', APEX_ROOT + 'index.html', APEX_ROOT + '.n7-apex-release.json')
APEX_NIKI = (APEX_ROOT + 'n7-niki-voice-v1.bin', APEX_ROOT + 'n7-niki-voice-worker-v1.js')
AGENTS_BUNDLE = HERE.parents[1] / 'runtime' / 'agents-plesk-release.zip'
AGENTS_BUNDLE_LOCK = AGENTS_BUNDLE.with_suffix('.json')
DELTA_FILES = {'security': SECURITY_FILES, 'news': ('n7-agents.js', 'news-geopolitics.js'),
               'agents': ('n7-agents.js', 'news-geopolitics.js', 'n7-command-router.js', 'n7-apex-public-chat.cjs',
                          *AGENTS_EXTRA_MODULES, *AGENTS_COMPILED),
               'browser': ('browser.js', 'document-reader.js', 'n7-agents.js', BROWSER_CONFIG)}
# Verified in Plesk and served by /health after the security installation.
NEWS_PREVIOUS_RELEASE = '49493e516bbff042aa9fdbdfc36fc3e137f7bdc8be3df625f8a6e8a427058f24'
AGENTS_PREVIOUS_RELEASE = '2cf91c0e05822db04304f8e6f7f71d4a0fc2b1a9388a53ff7c5835f80b28a615'
BROWSER_PREVIOUS_RELEASE = '58a880dc1106dd2a31a3767ba2bb42ad4390022d1e1bf51b88b7a9ae1f24abd2'


class PleskFiles:
    """Local file transport for the existing guarded transaction."""

    def __init__(self, root, scope='security', apex_paths=()):
        if root.is_symlink() or not root.is_dir():
            raise RuntimeError('N7_PLESK_APP_ROOT_UNAVAILABLE')
        self.root = root.resolve(strict=True)
        runtime_targets = DELTA_FILES[scope] + ('release-manifest.json',) if scope is not None else ()
        self.targets = frozenset(runtime_targets) | frozenset(apex_paths)
        self.write_paths = self.targets | {'.n7-runtime-deploy-lock'}
        if scope is not None:
            self.write_paths |= {'tmp/restart.txt'}
        if scope == 'security':
            self.write_paths |= {'skills', 'skills/cybersecurity-audit'}
        self.write_paths |= {str(parent) for name in apex_paths for parent in PurePosixPath(name).parents
                             if str(parent).startswith(APEX_ROOT + '_next')}

    def path(self, absolute, write=False):
        if not absolute.startswith(ROOT + '/'):
            raise RuntimeError('N7_PLESK_PATH_OUTSIDE_APP')
        name = absolute[len(ROOT) + 1:]
        parts = name.split('/')
        if any(not part or part in ('.', '..') for part in parts):
            raise RuntimeError('N7_PLESK_PATH_INVALID')
        if write:
            temporary = re.fullmatch(r'\.n7-runtime-(?:stage|backup)-[a-f0-9]{20}-(.+)', name)
            allowed_temp = temporary and temporary.group(1) in {
                target.replace('/', '__') for target in self.targets
            }
            if not (allowed_temp or name in self.write_paths):
                raise RuntimeError('N7_PLESK_WRITE_SCOPE_INVALID')
        target = self.root
        for part in parts:
            target = target / part
            if target.is_symlink():
                raise RuntimeError('N7_PLESK_SYMLINK_REFUSED')
        return target

    def retrbinary(self, command, callback):
        path = self.path(command[len('RETR '):])
        # Refuse special files and final-component symlinks before reading bytes.
        try:
            fd = os.open(str(path), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        except FileNotFoundError:
            raise ftplib.error_perm('550 File not found') from None
        with os.fdopen(fd, 'rb') as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise RuntimeError('N7_PLESK_REGULAR_FILE_REQUIRED')
            for part in iter(lambda: stream.read(65536), b''):
                callback(part)

    def storbinary(self, command, source):
        absolute = command[len('STOR '):]
        path = self.path(absolute, write=True)
        # Stage files are exclusive. Passenger's existing marker is only touched.
        if absolute == ROOT + '/tmp/restart.txt':
            flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK
        else:
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
        fd = os.open(str(path), flags, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise RuntimeError('N7_PLESK_REGULAR_FILE_REQUIRED')
            if absolute == ROOT + '/tmp/restart.txt':
                os.utime(stream.fileno(), None)
            else:
                shutil.copyfileobj(source, stream)
                stream.flush()
                os.fsync(stream.fileno())

    def sendcmd(self, command):
        if not command.startswith('SITE CHMOD 644 '):
            raise RuntimeError('N7_PLESK_COMMAND_INVALID')
        self.path(command[len('SITE CHMOD 644 '):], write=True).chmod(0o644)

    def mkd(self, absolute):
        try:
            mode = 0o755 if absolute.startswith(ROOT + '/' + APEX_ROOT) else 0o750
            path = self.path(absolute, write=True)
            path.mkdir(mode=mode)
            if mode == 0o755:
                path.chmod(mode)
        except FileExistsError:
            raise ftplib.error_perm('550 Directory exists') from None

    def rename(self, old, new):
        source, target = self.path(old, write=True), self.path(new, write=True)
        if target.exists():
            raise RuntimeError('N7_CONCURRENT_RUNTIME_CHANGE')
        source.rename(target)

    def delete(self, absolute):
        self.path(absolute, write=True).unlink()

    def rmd(self, absolute):
        self.path(absolute, write=True).rmdir()

    def quit(self):
        pass


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(ftp, name, optional=False):
    output = []
    size = 0
    def append(part):
        nonlocal size
        size += len(part)
        if size > LIMIT:
            raise RuntimeError('N7_REMOTE_SOURCE_TOO_LARGE')
        output.append(part)
    try:
        ftp.retrbinary('RETR ' + ROOT + '/' + name, append)
    except ftplib.error_perm as error:
        if optional and str(error).startswith('550'):
            return None
        raise
    return b''.join(output)


def transform_server(original):
    source = original.decode('utf8')
    # Some previously reviewed releases already contain release-info but still
    # carry the unreachable owner mission routes. Normalize those exact anchors
    # before the idempotent release transforms, without bypassing authentication.
    if ("require('./n7-release-info')" in source and
            "    // Owner mission endpoints: the global session guard above applies." not in source):
        old_head = (
            "    // Owner-reviewed writing knowledge: authenticated only, never silently derived from chats.\\n"
            "    if(req.method==='GET'&&p==='/api/n7/approved-lessons'){\\n"
            "    if(req.method==='GET'&&p==='/n7-mission-owner-ui.js')return serve(res,p);\\n"
            "      if(!session(req))return json(res,401,{error:'Authentication required'});\\n"
        )
        new_head = (
            "    // Owner mission endpoints: the global session guard above applies.\\n"
            "    if(req.method==='GET'&&p==='/n7-mission-owner-ui.js')return serve(res,p);\\n"
        )
        old_tail = (
            "    }\\n"
            "      if(!originOK(req))return json(res,403,{error:'Invalid origin'});\\n"
            "      try{return json(res,200,{lessons:ownerChatMemory.list()});}"
        )
        new_tail = (
            "    }\\n"
            "    // Owner-reviewed writing knowledge: authenticated only, never silently derived from chats.\\n"
            "    if(req.method==='GET'&&p==='/api/n7/approved-lessons'){\\n"
            "      if(!originOK(req))return json(res,403,{error:'Invalid origin'});\\n"
            "      try{return json(res,200,{lessons:ownerChatMemory.list()});}"
        )
        # Use actual newline characters in verified Python anchor strings.
        old_head, new_head = old_head.replace('\\n', '\n'), new_head.replace('\\n', '\n')
        old_tail, new_tail = old_tail.replace('\\n', '\n'), new_tail.replace('\\n', '\n')
        research_anchor = "    if(req.method==='GET'&&/^\\/api\\/research\\/corpus\\/[0-9]{8,20}$/.test(p)){"
        lesson_anchor = "    // Owner-reviewed writing knowledge: authenticated only, never silently derived from chats."
        if source.count(research_anchor) == 1 and source.count(lesson_anchor) == 1 and source.index(research_anchor) < source.index(lesson_anchor):
            # Older review-stage release already hoisted the handlers, but has
            # not yet gained the explicit owner-mission marker.
            source = source.replace(research_anchor,
                                    "    // Owner mission endpoints: the global session guard above applies.\n" + research_anchor, 1)
            old_guard = (
                "    if(req.method==='GET'&&p==='/api/n7/approved-lessons'){\n"
                "      if(!session(req))return json(res,401,{error:'Authentication required'});\n"
            )
            if source.count(old_guard) != 1:
                raise RuntimeError('N7_MISSION_ROUTE_ANCHOR_CHANGED')
            source = source.replace(old_guard,
                "    if(req.method==='GET'&&p==='/api/n7/approved-lessons'){\n", 1)
        else:
            if source.count(old_head) != 1 or source.count(old_tail) != 1:
                raise RuntimeError('N7_MISSION_ROUTE_ANCHOR_CHANGED')
            source = source.replace(old_head, new_head, 1).replace(old_tail, new_tail, 1)
    if "require('./n7-release-info')" not in source:
        start = source.index("    if(req.method==='GET'&&/^\\/api\\/research\\/corpus")
        # Reviewed mission-routing fix places mission handlers immediately before
        # approved-lessons. Keep the legacy anchor for older captured runtimes.
        if "    // Owner mission endpoints: the global session guard above applies." in source:
            end = source.index("    // Owner-reviewed writing knowledge: authenticated only, never silently derived from chats.", start)
            block = source[start:end].rstrip("\n") + "\n"
        else:
            end = source.index("      if(!originOK(req))return json(res,403,{error:'Invalid origin'});\n      try{return json(res,200,{lessons:ownerChatMemory.list()});}", start)
            block = ("    // Owner mission endpoints: the global session guard above applies.\n"
                     + source[start:end])
        source = source[:start] + source[end:]
        replacements = [
            ("    if(req.method==='GET'&&p==='/n7-mission-owner-ui.js')return serve(res,p);\n", ''),
            ('    // Owner-reviewed writing knowledge: authenticated only, never silently derived from chats.', block + '\n    // Owner-reviewed writing knowledge: authenticated only, never silently derived from chats.'),
            ("'/app.js': 'app.js','/n7-mission-owner-ui.js':'n7-mission-owner-ui.js',", "'/app.js': 'app.js', '/n7-mission-owner-ui.js':'n7-mission-owner-ui.js', '/n7-library-ui.js':'n7-library-ui.js', '/n7-pdf/pdf.js':'n7-pdf/pdf.js', '/n7-pdf/pdf.worker.js':'n7-pdf/pdf.worker.js',"),
            ("        '/app.js', '/historical-library.js',", "        '/app.js', '/historical-library.js', '/n7-library-ui.js', '/n7-mission-owner-ui.js', '/n7-pdf/pdf.js', '/n7-pdf/pdf.worker.js',"),
            ("        status: 'ok',", "        status: 'ok',\n        release: require('./n7-release-info').readReleaseInfo(__dirname),"),
        ]
        for old, new in replacements:
            if source.count(old) != 1:
                raise RuntimeError('N7_RELEASE_SOURCE_ANCHOR_CHANGED')
            source = source.replace(old, new, 1)
    # Upgrade the exact previously reviewed project-guide wiring before applying current patches.
    legacy_guide = "      const projectGuide=require('./workspace-workflows').projectContext(DATA_DIR,item.projectId);\n      const history = [\n        ...(projectGuide?[{role:'system',content:projectGuide}]:[]),\n        ...item.messages,"
    if source.count(legacy_guide) == 1:
        source = source.replace(legacy_guide, '      const history = [\n        ...item.messages,', 1)
    for file in ('chat-storage-patch.json', 'runtime-workflow-patch.json'):
        for patch in json.loads((HERE / file).read_text()):
            # Already-applied patches are skipped so an installed current release is not re-patched.
            if patch['new'] and source.count(patch['new']) == 1:
                continue
            if source.count(patch['old']) == 1:
                source = source.replace(patch['old'], patch['new'], 1)
            elif not patch['new'] or source.count(patch['new']) != 1:
                raise RuntimeError('N7_RUNTIME_PATCH_ANCHOR_CHANGED')
    # The guest route is an approved, pinned release dependency. Reproduce exactly the live shim.
    if APEX_MARKER.decode() in source:
        if source.count(APEX_PUBLIC_SHIM) != 1 or source.count(APEX_PUBLIC_GUARD) != 1:
            raise RuntimeError('N7_APEX_PUBLIC_SHIM_DRIFT')
    else:
        anchor = 'const server = http.createServer(async (req, res) => {'
        if source.count(anchor) != 1:
            raise RuntimeError('N7_APEX_PUBLIC_ANCHOR_CHANGED')
        source = source.replace(anchor, APEX_PUBLIC_SHIM + anchor + APEX_PUBLIC_GUARD, 1)
    return source.encode()


def transform_app(original):
    source = original.decode('utf8')
    marker = '// N7_MODERN_LIGHT_UI_V1'
    if source.count(marker) != 1 or source.count('// N7_PROJECT_BOOK_WORKFLOWS_V1') > 1:
        raise RuntimeError('N7_PUBLIC_APP_ANCHOR_CHANGED')
    # plan() restricts input to the reviewed previous/current SHA256. Replace only
    # the canonical modern UI and its canonical workflow/voice suffixes.
    prefix = source[:source.index(marker)]
    # N7_PRESENCE_API_V1: replace the approved-character block only when it is the reviewed
    # installed revision (or already current); any other content stops the deployment.
    start = prefix.find('/* N7_APPROVED_CHARACTER_V1')
    owner = (HERE / 'owner-chat-ui.js').read_text().splitlines()[0]
    end = prefix.find(owner)
    if start < 0 or end < start or prefix.count(owner) != 1:
        raise RuntimeError('N7_PUBLIC_APP_ANCHOR_CHANGED')
    current = (HERE / 'n7-approved-character.js').read_text().rstrip() + '\n\n\n'
    block = prefix[start:end]
    if block != current and sha(block.encode()) not in PREVIOUS_CHARACTER_BLOCKS:
        raise RuntimeError('N7_UNREVIEWED_CHARACTER_BLOCK')
    prefix = prefix[:start] + current + prefix[end:]
    tail = (HERE / 'modern-ui.js').read_text().rstrip() + '\n\n'
    tail += (HERE / 'workspace-ui.js').read_text() + '\n'
    tail += (HERE / 'voice-protocol.js').read_text() + '\n'
    tail += (HERE / 'voice-bridge-ui.js').read_text()
    # N7_HUMANOID_STAGE_V1: command router, NABOU map protocol and the Humanoid entry screen.
    # N7_APEX_HOME_V1: the APEX Humanoid is the home screen; apex-home.js decides where the visitor lands.
    for name in ('n7-command-router.js', 'n7-map-protocol.js', 'humanoid-stage.js', 'apex-home.js'):
        tail += '\n' + (HERE / name).read_text()
    return (prefix + tail).encode()


# SHA-256 of the installed approved-character block (release 483096c9…, canonical 1ba82fd/f9932e6).
PREVIOUS_CHARACTER_BLOCKS = {'cdc734194899240f5045266863c16dbcea28f57b0907af17655be264760c0286'}
# N7_APEX_PUBLIC_CANONICAL_V1: the owner-approved public APEX route is now part of the
# reproducible 70-file release. Never strip it during deployment; validate exact bytes.
APEX_PUBLIC_SHIM = ("// N7_APEX_PASSWORDLESS_CHAT_V1\nconst n7ApexPublic=require('./n7-apex-public-chat.cjs')"
                    ".createApexPublicChat({apiKey:API_KEY,model:MODEL,base:BASE});\n")
APEX_PUBLIC_GUARD = ("\n  try { if(await n7ApexPublic.handle(req,res)) return; } catch { res.writeHead(500,{'Content-Type':"
                     "'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Η συνομιλία δεν ολοκληρώθηκε.'}));return; }\n")
APEX_MARKER = b'N7_APEX_PASSWORDLESS_CHAT_V1'

STAGE_CSS_MARKER = '/* N7_HUMANOID_STAGE_V1'


def transform_css(original):
    # N7_HUMANOID_STAGE_V1: the canonical stylesheet is the installed one plus the stage styles.
    source = original.decode('utf8')
    stage = (HERE / 'humanoid-stage.css').read_text() + '\n' + (HERE / 'apex-home.css').read_text()
    if source.count(STAGE_CSS_MARKER) > 1:
        raise RuntimeError('N7_PUBLIC_CSS_ANCHOR_CHANGED')
    prefix = source[:source.index(STAGE_CSS_MARKER)] if STAGE_CSS_MARKER in source else source + '\n'
    return (prefix + stage).encode()


def syntax(data):
    with tempfile.NamedTemporaryFile(suffix='.js') as file:
        file.write(data)
        file.flush()
        subprocess.run(['node', '--check', file.name], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=20)


def contract():
    data = json.loads((HERE / 'reconciled-runtime-contract.json').read_text())
    if data.get('schema') != 'n7-reconciled-deploy/v1' or data.get('target') != ROOT:
        raise RuntimeError('N7_RELEASE_CONTRACT_INVALID')
    digest = sha(json.dumps(data['files'], sort_keys=True, separators=(',', ':')).encode())
    if digest != data.get('release_id'):
        raise RuntimeError('N7_RELEASE_ID_INVALID')
    for name, value in data['files'].items():
        path = PurePosixPath(name)
        if path.is_absolute() or any(p in ('.', '..') or p.startswith('.') for p in path.parts) or path.parts[0] in ('data', 'tmp', 'node_modules') or not re.fullmatch(r'[a-f0-9]{64}', value):
            raise RuntimeError('N7_RELEASE_PATH_OR_HASH_INVALID')
    return data


def plan(ftp, release, canonical_commit, transformer=transform_server):
    if not re.fullmatch(r'[a-f0-9]{40}', canonical_commit):
        raise RuntimeError('N7_CANONICAL_COMMIT_REQUIRED')
    originals = {}
    previous_files = release.get('previous_files', {})
    server_input = None
    for name, expected in release['files'].items():
        mutable = name in WRITABLE
        current = read(ftp, name, optional=mutable and name not in previous_files and name != 'server.js')
        if mutable:
            allowed = {expected, previous_files.get(name)} - {None}
            if name == 'server.js':
                allowed.add(release['previous_server_sha256'])
                # Exact, independently observed and approved live predecessor.
                # No wildcard hashes, no bypass for unreviewed server changes.
                reviewed = release.get('reviewed_live_server_sha256')
                if reviewed:
                    if not re.fullmatch(r'[a-f0-9]{64}', reviewed):
                        raise RuntimeError('N7_REVIEWED_LIVE_HASH_INVALID')
                    allowed.add(reviewed)
            if name == 'server.js' and current is not None and APEX_MARKER in current:
                # Already-installed approved guest routes are PRESERVED, not removed.
                if (sha(current) not in allowed or current.count(APEX_PUBLIC_SHIM.encode()) != 1
                        or current.count(APEX_PUBLIC_GUARD.encode()) != 1):
                    raise RuntimeError('N7_UNREVIEWED_LIVE_SERVER')
                server_input = current
            elif current is not None and sha(current) not in allowed:
                raise RuntimeError('N7_UNREVIEWED_LIVE_SERVER' if name == 'server.js' else 'N7_RUNTIME_DRIFT ' + name)
            originals[name] = current
        elif current is None or sha(current) != expected:
            raise RuntimeError('N7_RUNTIME_DRIFT ' + name)
    previous = server_input if server_input is not None else originals['server.js']
    server = previous if sha(previous) == release['files']['server.js'] else transformer(previous)
    payload = {}
    for name, source in PUBLIC_MODULES.items():
        if name not in release['files']:
            continue
        data = (HERE / source).read_bytes()
        if sha(data) != release['files'][name]:
            raise RuntimeError('N7_CANONICAL_RUNTIME_OUTPUT_MISMATCH')
        if name.endswith(('.js', '.cjs')):
            syntax(data)
        payload[name] = data
    if sha(server) != release['files']['server.js']:
        raise RuntimeError('N7_CANONICAL_RUNTIME_OUTPUT_MISMATCH')
    syntax(server)
    receipt = {'schema': 'n7-runtime-build/v1', 'release_id': release['release_id'],
               'canonical_commit': canonical_commit, 'source_lock_verified': True,
               'files': release['files'], 'deployment': 'verified-existing-files-and-guarded-delta'}
    originals['release-manifest.json'] = read(ftp, 'release-manifest.json', optional=True)
    if 'public/app.js' in originals:
        app = originals['public/app.js']
        if sha(app) != release['files']['public/app.js']:
            app = transform_app(app)
        if sha(app) != release['files']['public/app.js']:
            raise RuntimeError('N7_PUBLIC_APP_OUTPUT_MISMATCH')
        syntax(app)
        payload['public/app.js'] = app
    if 'public/style.css' in originals:
        css = originals['public/style.css']
        if css is None or sha(css) != release['files']['public/style.css']:
            css = transform_css(css or b'')
        if sha(css) != release['files']['public/style.css']:
            raise RuntimeError('N7_PUBLIC_CSS_OUTPUT_MISMATCH')
        payload['public/style.css'] = css
    if 'public/index.html' in originals:
        import runpy
        versioner = runpy.run_path(str(HERE / 'asset_version.py'))
        html = versioner['version_html'](originals['public/index.html'], payload['public/app.js'], payload.get('public/style.css', originals.get('public/style.css')))
        if sha(html) != release['files']['public/index.html']:
            raise RuntimeError('N7_PUBLIC_HTML_OUTPUT_MISMATCH')
        payload['public/index.html'] = html
    payload['release-manifest.json'] = (json.dumps(receipt, indent=2) + '\n').encode()
    payload['server.js'] = server
    return payload, originals


def plan_delta(ftp, release, commit, scope='security', compiled=None):
    if not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise RuntimeError('N7_CANONICAL_COMMIT_REQUIRED')
    targets = DELTA_FILES[scope]
    prefix = 'N7_' + scope.upper()
    reviewed = release.get('security_live_prerequisites') or {}
    if set(reviewed) != set(SECURITY_READ_ONLY) or any(
            not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{64}', value)
            for value in reviewed.values()):
        raise RuntimeError(prefix + '_PREREQUISITES_NOT_REVIEWED')
    manifest = read(ftp, 'release-manifest.json')
    installed = json.loads(manifest)
    installed_hashes = installed.get('files')
    if (installed.get('schema') != 'n7-runtime-build/v1' or not isinstance(installed_hashes, dict)
            or not installed_hashes or not set(installed_hashes) <= set(release['files'])
            or installed.get('release_id') != sha(json.dumps(
                installed_hashes, sort_keys=True, separators=(',', ':')).encode())):
        raise RuntimeError(prefix + '_LIVE_MANIFEST_INVALID')
    predecessors = {'news': NEWS_PREVIOUS_RELEASE, 'agents': AGENTS_PREVIOUS_RELEASE,
                    'browser': BROWSER_PREVIOUS_RELEASE}
    pinned = scope in predecessors
    if pinned:
        optional_new = {BROWSER_CONFIG} if scope == 'browser' else set()
        if set(targets) - set(installed_hashes) - optional_new:
            raise RuntimeError(prefix + '_LIVE_MANIFEST_INVALID')
        # The exact live release ID authenticates the recorded predecessor hashes.
        # Allow repeating a successful install with an already matching target set.
        predecessor = predecessors[scope]
        if installed['release_id'] != predecessor and any(
                installed_hashes.get(name) != release['files'][name] for name in targets):
            raise RuntimeError(prefix + '_PREDECESSOR_NOT_REVIEWED')

    # Read the actual live bytes for the release receipt. Unrelated live patches
    # are carried forward without ever entering the writable payload.
    protected = {}
    for name in sorted((set(installed_hashes) | set(SECURITY_READ_ONLY)) - set(targets)):
        protected[name] = sha(read(ftp, name))
        if name in reviewed and protected[name] != reviewed[name]:
            raise RuntimeError(prefix + '_PREREQUISITE_DRIFT ' + name)
        if pinned and name in installed_hashes and protected[name] != installed_hashes[name]:
            raise RuntimeError(prefix + '_PRESERVED_FILE_DRIFT ' + name)

    payload, originals = {}, {}
    for name in targets:
        previous = installed_hashes.get(name) if pinned else release['previous_files'].get(name)
        current = read(ftp, name, optional=previous is None and name not in installed_hashes)
        expected = release['files'][name]
        if current is not None and sha(current) not in (expected, previous):
            raise RuntimeError(prefix + '_TARGET_DRIFT ' + name)
        if name in AGENTS_COMPILED:
            data = compiled[name]
        else:
            source = AGENTS_EXTRA_MODULES.get(name) or PUBLIC_MODULES[name]
            data = (HERE / source).read_bytes()
        if sha(data) != expected:
            raise RuntimeError(prefix + '_TARGET_OUTPUT_MISMATCH ' + name)
        if name.endswith(('.js', '.cjs')):
            syntax(data)
        originals[name], payload[name] = current, data

    files = {**protected, **{name: sha(data) for name, data in payload.items()}}
    release_id = sha(json.dumps(files, sort_keys=True, separators=(',', ':')).encode())
    receipt = {'schema': 'n7-runtime-build/v1', 'release_id': release_id,
               'canonical_commit': commit, 'source_lock_verified': files == release['files'],
               'files': files, 'deployment': 'guarded-' + scope + '-delta'}
    originals['release-manifest.json'] = manifest
    payload['release-manifest.json'] = (json.dumps(receipt, indent=2) + '\n').encode()
    return payload, originals, receipt, protected


def read_agent_bundle():
    lock = json.loads(AGENTS_BUNDLE_LOCK.read_text())
    raw = AGENTS_BUNDLE.read_bytes()
    if lock.get('schema') != 'n7-plesk-agents-assets-v1' or sha(raw) != lock.get('archive_sha256'):
        raise RuntimeError('N7_AGENTS_BUNDLE_HASH_MISMATCH')
    expected, original, preserve = (lock.get(key) for key in ('files', 'apex_previous', 'apex_preserve'))
    allowed_static = re.compile(r'public/n7-apex/_next/static/(?:[\w-][\w.-]*/)*[\w-][\w.-]*\.(?:js|css)', re.ASCII)
    if (not all(isinstance(values, dict) for values in (expected, original, preserve))
            or set(expected) != set(AGENTS_COMPILED) | set(original)
            or any(not original.get(name) for name in APEX_ENTRY)
            or any(value is not None for name, value in original.items() if name not in APEX_ENTRY)
            or not set(APEX_NIKI) <= set(preserve) or len(expected) > 60 or len(preserve) > 60
            or set(preserve) & set(expected) or any(not name.startswith(APEX_ROOT) or
                any(part in ('', '.', '..') for part in name.split('/')) for name in preserve)
            or any(name not in APEX_ENTRY and not allowed_static.fullmatch(name) for name in original)
            or any(value is not None and (not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{64}', value))
                   for value in original.values())
            or any(not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{64}', value)
                   for value in (*expected.values(), *preserve.values()))):
        raise RuntimeError('N7_AGENTS_BUNDLE_SCOPE_INVALID')
    with zipfile.ZipFile(io.BytesIO(raw)) as bundle:
        if len(bundle.namelist()) != len(expected) or set(bundle.namelist()) != set(expected):
            raise RuntimeError('N7_AGENTS_BUNDLE_SCOPE_INVALID')
        payload = {}
        for name in expected:
            if bundle.getinfo(name).file_size > LIMIT:
                raise RuntimeError('N7_AGENTS_BUNDLE_FILE_TOO_LARGE')
            value = bundle.read(name)
            if sha(value) != expected[name]:
                raise RuntimeError('N7_AGENTS_BUNDLE_FILE_HASH_MISMATCH ' + name)
            payload[name] = value
    return payload, original, preserve


def restart(ftp):
    ftp.storbinary('STOR ' + ROOT + '/tmp/restart.txt', io.BytesIO(b'n7-reconciled-runtime\n'))


def install(ftp, payload, originals, verifier, protected=None, restart_app=True):
    allowed = ftp.targets if isinstance(ftp, PleskFiles) else WRITABLE
    if set(payload) - allowed or set(payload) != set(originals):
        raise RuntimeError('N7_WRITE_SCOPE_INVALID')
    lock = ROOT + '/.n7-runtime-deploy-lock'
    ftp.mkd(lock)
    tag = secrets.token_hex(10)
    staged, backups, installed, created_dirs = {}, {}, [], []
    changed = [name for name, data in payload.items() if originals[name] != data]
    try:
        if not changed:
            verifier()
            print('N7_RUNTIME_ALREADY_INSTALLED no_writes=true no_restart=true')
            return
        # Verify every stage before replacing any active path.
        for name in changed:
            stage = '.n7-runtime-stage-' + tag + '-' + name.replace('/', '__')
            staged[name] = stage
            ftp.storbinary('STOR ' + ROOT + '/' + stage, io.BytesIO(payload[name]))
            ftp.sendcmd('SITE CHMOD 644 ' + ROOT + '/' + stage)
            if read(ftp, stage) != payload[name]:
                raise RuntimeError('N7_STAGE_HASH_MISMATCH')
        for name in payload:
            if read(ftp, name, optional=True) != originals[name]:
                raise RuntimeError('N7_CONCURRENT_RUNTIME_CHANGE')
        for name, expected in (protected or {}).items():
            if sha(read(ftp, name)) != expected:
                raise RuntimeError('N7_CONCURRENT_RUNTIME_CHANGE')
        # Create only explicitly approved directories for skills or versioned APEX assets.
        directories = set()
        for name in changed:
            if name.startswith('skills/'):
                directories.add(name.rsplit('/', 1)[0])
            if name.startswith(APEX_ROOT + '_next/'):
                directories.update(str(parent) for parent in PurePosixPath(name).parents
                                   if str(parent).startswith(APEX_ROOT + '_next'))
        for relative in sorted(directories):
            directory = ROOT + '/' + relative
            try:
                ftp.mkd(directory)
                created_dirs.append(directory)
            except ftplib.error_perm as error:
                if not str(error).startswith('550'):
                    raise
        # Dependency and receipt first; the verified server entry point last.
        for name in changed:
            if originals[name] is not None:
                backup = '.n7-runtime-backup-' + tag + '-' + name.replace('/', '__')
                ftp.rename(ROOT + '/' + name, ROOT + '/' + backup)
                backups[name] = backup
                if read(ftp, backup) != originals[name]:
                    raise RuntimeError('N7_BACKUP_HASH_MISMATCH')
            try:
                ftp.rename(ROOT + '/' + staged[name], ROOT + '/' + name)
            except BaseException:
                if name in backups:
                    ftp.rename(ROOT + '/' + backups.pop(name), ROOT + '/' + name)
                raise
            staged.pop(name)
            installed.append(name)
            if read(ftp, name) != payload[name]:
                raise RuntimeError('N7_ACTIVE_HASH_MISMATCH')
        if restart_app:
            restart(ftp)
        verifier()
    except BaseException:
        failures = []
        pending = [name for name in backups if name not in installed]
        for name in [*reversed(installed), *pending]:
            try:
                current = read(ftp, name, optional=True)
                if (name in installed and current != payload[name]) or (name not in installed and current is not None):
                    raise RuntimeError('concurrent_change_during_rollback')
                if current is not None:
                    ftp.delete(ROOT + '/' + name)
                if name in backups:
                    ftp.rename(ROOT + '/' + backups.pop(name), ROOT + '/' + name)
                if read(ftp, name, optional=True) != originals[name]:
                    raise RuntimeError('rollback_hash_mismatch')
            except Exception:
                failures.append(name)
        for directory in reversed(created_dirs):
            try:
                ftp.rmd(directory)
            except ftplib.all_errors:
                failures.append(directory)
        if installed and restart_app:
            restart(ftp)
        if failures:
            print('N7_MANUAL_ROLLBACK_REQUIRED=' + ','.join(failures))
        else:
            print('N7_RUNTIME_ROLLBACK_VERIFIED=true')
        raise
    finally:
        for stage in staged.values():
            try:
                ftp.delete(ROOT + '/' + stage)
            except ftplib.all_errors:
                pass
        ftp.rmd(lock)
    print('N7_RUNTIME_DEPLOYED files_changed=' + str(len(changed)) + ' data_paths_written=0 backups_retained=true')


def request(path, method='GET'):
    headers = {'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache', 'User-Agent': 'N7-canonical-runtime-verify/1'}
    return urllib.request.urlopen(urllib.request.Request(BASE + path, headers=headers, method=method),
                                  context=ssl.create_default_context(), timeout=15)


def verify(release, commit, ftp=None, active=True, require_browser=False):
    deadline = time.monotonic() + 110
    browser_pending = False
    while True:
        try:
            with request('/health?n7release=' + secrets.token_hex(8)) as response:
                health = json.loads(response.read(20000))
            valid = health.get('status') == 'ok' and health.get('modelConfigured') is True
            if active:
                valid = valid and health.get('release') == {'id': release['release_id'], 'canonical_commit': commit}
            # The older Passenger worker can read the new receipt from disk
            # before it reloads modules and their configuration.
            browser_pending = valid and require_browser and health.get('browserConfigured') is not True
            if valid and not browser_pending:
                break
        except (OSError, ValueError):
            pass
        if time.monotonic() >= deadline:
            if browser_pending:
                raise RuntimeError('N7_BROWSER_READER_NOT_CONFIGURED')
            raise RuntimeError('N7_ACTIVE_RELEASE_OR_MODEL_NOT_VERIFIED')
        time.sleep(2)
    for path, method in [('/api/conversations','GET'),('/api/n7/approved-lessons','GET'),
                         ('/api/tasks','GET'),('/api/research/missions','POST'),
                         ('/api/conversations/00000000-0000-4000-8000-000000000007/stream','POST')]:
        try:
            with request(path, method):
                pass
        except urllib.error.HTTPError as error:
            if error.code == 401:
                continue
            raise
        raise RuntimeError('N7_PRIVATE_ENDPOINT_EXPOSED')
    # Public APEX guest route must survive every clean rebuild without exposing owner data.
    with request('/api/n7-apex/status') as response:
        guest = json.loads(response.read(20000))
    if guest != {'passwordRequired': False, 'available': True, 'privateHistory': False}:
        raise RuntimeError('N7_PUBLIC_APEX_ROUTE_MISSING_OR_UNSAFE')
    with request('/api/status') as response:
        status = json.loads(response.read(20000))
    if status.get('authenticated') is not False or status.get('modelConfigured') is not True:
        raise RuntimeError('N7_PUBLIC_AUTHENTICATION_STATUS_INVALID')
    for name, expected in release['files'].items():
        if ftp is not None and sha(read(ftp, name)) != expected:
            raise RuntimeError('N7_FINAL_RUNTIME_DRIFT ' + name)
        if name.startswith('public/'):
            # Verify the actual application entry route; nginx may serve /index.html
            # from a separately cached static-file location.
            route = '/' if name == 'public/index.html' else '/' + name[len('public/'):]
            accepted = {expected}
            if not active and name in WRITABLE:
                accepted.add(release.get('previous_files', {}).get(name))
            public_deadline = time.monotonic() + 60
            while True:
                with request(route + '?n7verify=' + secrets.token_hex(8)) as response:
                    valid_public = sha(response.read(LIMIT + 1)) in accepted
                if valid_public:
                    break
                if time.monotonic() >= public_deadline:
                    raise RuntimeError('N7_PUBLIC_RUNTIME_HASH_MISMATCH ' + name)
                time.sleep(2)
    print('N7_RUNTIME_VERIFIED active=' + str(active) + ' model_configured=true private_http=401 public_hashes=true')


def connect():
    host, port = os.environ['PCT_FTPS_HOST'], int(os.getenv('PCT_FTPS_PORT', '21'))
    ips = lambda name: {item[4][0] for item in socket.getaddrinfo(name, port, type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):
        raise RuntimeError('N7_UNEXPECTED_FTPS_HOST')
    ftp = ftplib.FTP_TLS(timeout=40, context=ssl.create_default_context())
    ftp.connect(host, port)
    ftp.host = TLS
    ftp.login(os.environ['PCT_FTPS_USER'], os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    ftp.cwd(ROOT)
    if ftp.pwd().rstrip('/') != ROOT:
        raise RuntimeError('N7_UNEXPECTED_APP_ROOT')
    return ftp


def local_commit(scope):
    repo = HERE.parents[1]
    paths = DELTA_FILES.get(scope, PUBLIC_MODULES)
    inputs = [str((HERE / (AGENTS_EXTRA_MODULES.get(name) or PUBLIC_MODULES[name])).resolve())
              for name in sorted(paths) if name not in AGENTS_COMPILED]
    if scope == 'agents':
        inputs.extend((str(AGENTS_BUNDLE), str(AGENTS_BUNDLE_LOCK)))
    if scope == 'runtime':
        # Export/transform helpers can contribute to the full runtime payload.
        inputs.extend((str(HERE), str(repo / 'tools' / 'library'), str(repo / 'skills')))
    inputs.extend((__file__, str(HERE / 'reconciled-runtime-contract.json')))
    git = ['git', '-C', str(repo)]
    try:
        check = subprocess.run([*git, 'diff', '--quiet', 'HEAD', '--', *inputs],
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
        if check.returncode == 1:
            raise RuntimeError('N7_LOCAL_INSTALL_INPUTS_DIFFER_FROM_HEAD')
        if check.returncode:
            raise RuntimeError('N7_LOCAL_GIT_CHECKOUT_REQUIRED')
        return subprocess.check_output([*git, 'rev-parse', '--verify', 'HEAD'], stderr=subprocess.DEVNULL,
                                       timeout=15, universal_newlines=True).strip()
    except (OSError, subprocess.SubprocessError):
        raise RuntimeError('N7_LOCAL_GIT_CHECKOUT_REQUIRED') from None


def public_preview(ftp, release, payload, destination):
    target = Path(destination).resolve()
    target.mkdir(parents=True, exist_ok=True)
    for name, expected in release['files'].items():
        if not name.startswith('public/'):
            continue
        relative = PurePosixPath(name[len('public/'):])
        if relative.is_absolute() or any(p in ('.', '..') for p in relative.parts):
            raise RuntimeError('N7_PREVIEW_PATH_INVALID')
        data = payload.get(name)
        if data is None:
            data = read(ftp, name)
        if sha(data) != expected:
            raise RuntimeError('N7_PUBLIC_PREVIEW_HASH_MISMATCH')
        local = target / str(relative)
        if local.is_symlink() or any(p.is_symlink() for p in local.parents):
            raise RuntimeError('N7_PREVIEW_SYMLINK')
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(data)
    print('N7_PUBLIC_PREVIEW_VERIFIED source_hashes=true private_files_exported=0')


def diagnose_server(source, release):
    """Dry-run only, when the live server is not a reviewed release: structural facts, never code text."""
    text = source.decode('utf8', 'replace')
    print('N7_DIAG_SERVER sha256=' + sha(source) + ' bytes=' + str(len(source)) + ' lines=' + str(text.count('\n')))
    print('N7_DIAG_SERVER previous=' + release.get('previous_files', {}).get('server.js', '')[:12] +
          ' previous_server=' + release.get('previous_server_sha256', '')[:12] + ' target=' + release['files']['server.js'][:12])
    print('N7_DIAG_MARKERS ' + ','.join(sorted(set(re.findall(r'N7_[A-Z0-9_]+_V[0-9]+', text)))))
    print('N7_DIAG_ROUTES ' + ','.join(sorted(set(re.findall(r"p\s*===?\s*'(/[a-z0-9/_.-]{1,60})'", text)))))
    for file in ('chat-storage-patch.json', 'runtime-workflow-patch.json'):
        for i, patch in enumerate(json.loads((HERE / file).read_text())):
            print('N7_DIAG_PATCH %s#%d old=%d new=%d id=%s' % (file, i, text.count(patch['old']), text.count(patch['new']) if patch['new'] else -1,
                                                           hashlib.sha256(patch['old'].encode()).hexdigest()[:8]))
    try:
        out = transform_server(source)
        print('N7_DIAG_TRANSFORM sha256=' + sha(out) + ' equals_target=' + str(sha(out) == release['files']['server.js']))
    except RuntimeError as error:
        print('N7_DIAG_TRANSFORM error=' + str(error))


def plan_apex(ftp, bundle, previous, preserved):
    for name, expected in preserved.items():
        if sha(read(ftp, name)) != expected:
            raise RuntimeError('N7_AGENT_APEX_PRESERVED_FILE_DRIFT ' + name)
    # Publish versioned dependencies before the entry documents. Existing chunks
    # remain available to browsers already using the preceding release.
    names = sorted(set(previous) - set(APEX_ENTRY)) + list(APEX_ENTRY)
    payload, originals = {}, {}
    for name in names:
        current = read(ftp, name, optional=previous[name] is None)
        if current is not None and sha(current) not in (previous[name], sha(bundle[name])):
            raise RuntimeError('N7_AGENT_APEX_PREDECESSOR_DRIFT ' + name)
        payload[name], originals[name] = bundle[name], current
    return payload, originals


def verify_apex(ftp, installed, preserved):
    expected = {**preserved, **{name: sha(data) for name, data in installed.items()}}
    for name, digest in expected.items():
        if sha(read(ftp, name)) != digest:
            raise RuntimeError('N7_AGENT_APEX_FILE_DRIFT ' + name)
        if name in installed or name in APEX_NIKI:
            route = '/n7-apex/' if name == APEX_ROOT + 'index.html' else '/' + name[len('public/'):]
            with request(route + '?n7verify=' + secrets.token_hex(8)) as response:
                if sha(response.read(LIMIT + 1)) != digest:
                    raise RuntimeError('N7_AGENT_APEX_HTTP_HASH_MISMATCH ' + name)
    marker = json.loads(installed[APEX_ROOT + '.n7-apex-release.json'])
    print('N7_HUMANOID_RELEASE_VERIFIED release=' + marker['release'])


def verify_browser(root):
    # Exercise the deployed implementation directly without creating a live
    # conversation, exposing a new HTTP endpoint or requiring model credentials.
    script = """
const {browsePage}=require(process.argv[1]);
const urls=['https://el.wikipedia.org/wiki/Κρήτη',
            'https://en.wikipedia.org/wiki/Crete',
            'https://docs.python.org/3/library/urllib.parse.html'];
(async()=>{
  const attempts=[];
  for(const url of urls){
    const host=new URL(url).hostname;
    try{
      const page=JSON.parse(await browsePage(url));
      if(page.text.length>=100){
        console.log('N7_BROWSER_READER_VERIFIED host='+host+' characters='+page.text.length);
        return;
      }
      attempts.push(host+'=no_readable_text');
    }catch(error){
      const code=String(error.code||error.message||'');
      attempts.push(host+'='+(/^[a-z0-9_]{1,40}$/i.test(code)?code:'read_failed'));
    }
  }
  console.log('N7_BROWSER_READER_ATTEMPTS '+attempts.join(' '));
  process.exitCode=1;
})();
"""
    outcome = subprocess.run(['node', '-e', script, str(root / 'browser.js')],
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
    if outcome.stdout:
        print(outcome.stdout.decode('utf8').strip())
    if outcome.returncode:
        raise RuntimeError('N7_BROWSER_READER_PUBLIC_READ_FAILED')


def main(argv=()):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scope', choices=('runtime', *DELTA_FILES),
                        help='Select the full runtime or a reviewed file delta')
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--apply', action='store_true', help='Apply after the guarded preflight')
    modes.add_argument('--dry-run', action='store_true', help='Inspect the live release without writes (CLI default)')
    parser.add_argument('--plesk', action='store_true', help='Use the server-local Plesk application directory')
    args = parser.parse_args(argv)
    scope = args.scope or os.getenv('N7_INSTALL_SCOPE', 'runtime')
    if scope != 'runtime' and scope not in DELTA_FILES:
        raise RuntimeError('N7_INSTALL_SCOPE_INVALID')
    if args.apply and args.scope is None:
        parser.error('--apply requires an explicit --scope')
    if args.plesk and args.scope not in DELTA_FILES:
        parser.error('--plesk requires an explicit delta scope')
    if scope in ('news', 'agents', 'browser') and not args.plesk:
        parser.error('--scope ' + scope + ' requires --plesk')
    release = contract()
    # No arguments preserves the environment-based invocation used by existing operators.
    if argv:
        dry = not args.apply
        commit = local_commit(scope)
    else:
        dry = os.getenv('N7_DRY_RUN', '1') != '0'
        commit = os.getenv('N7_CANONICAL_COMMIT') or local_commit(scope)
    bundle, apex_previous, apex_preserved = read_agent_bundle() if scope == 'agents' else ({}, {}, {})
    ftp = PleskFiles(PLESK_ROOT, scope, apex_previous) if args.plesk else connect()
    try:
        if scope in DELTA_FILES:
            payload, originals, receipt, protected = plan_delta(ftp, release, commit, scope, bundle)
            if scope == 'agents':
                apex_payload, apex_originals = plan_apex(ftp, bundle, apex_previous, apex_preserved)
                preflight = dict(receipt, files={name: sha(originals[name]) if name in originals else value
                                               for name, value in receipt['files'].items()})
                payload.update(apex_payload)
                originals.update(apex_originals)
                protected.update(apex_preserved)
            else:
                preflight = receipt
            verify(preflight, commit, active=False)
            print('N7_' + scope.upper() + '_PREFLIGHT_OK dry_run=' + str(dry) +
                  ' target_files=' + str(len(DELTA_FILES[scope])) + ' release_id=' + receipt['release_id'])
            if not dry:
                def verify_installation():
                    verify(receipt, commit, ftp=ftp, require_browser=scope == 'browser')
                    if scope == 'agents':
                        verify_apex(ftp, apex_payload, apex_preserved)
                    if scope == 'browser':
                        verify_browser(ftp.root)
                install(ftp, payload, originals, verify_installation, protected)
                print('N7_LIVE_RELEASE_VERIFIED release_id=' + receipt['release_id'] + ' commit=' + commit)
            return
        try:
            payload, originals = plan(ftp, release, commit)
        except RuntimeError as error:
            if dry and str(error) == 'N7_UNREVIEWED_LIVE_SERVER':
                diagnose_server(read(ftp, 'server.js'), release)
            raise
        verify(release, commit, active=False)
        print('N7_CANONICAL_PREFLIGHT_OK dry_run=' + str(dry) + ' runtime_files=' + str(len(release['files'])))
        preview = os.getenv('N7_PREVIEW_PUBLIC_DIR')
        if preview:
            if not dry:
                raise RuntimeError('N7_PUBLIC_PREVIEW_REQUIRES_DRY_RUN')
            public_preview(ftp, release, payload, preview)
        if not dry:
            install(ftp, payload, originals, lambda: verify(release, commit, ftp=ftp))
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            ftp.close()


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except ftplib.Error as exc:
        # FTP replies can contain account data. Report only a numeric FTP status.
        status = re.match(r'^\d{3}', str(exc))
        raise SystemExit('N7_FTPS_REQUEST_FAILED status=' + (status.group() if status else 'unknown')) from None
    except (OSError, subprocess.SubprocessError) as exc:
        raise SystemExit('N7_INSTALL_TRANSPORT_OR_TOOL_ERROR ' + type(exc).__name__) from None
    except RuntimeError as exc:
        # Only static installer codes and reviewed file paths go to the terminal.
        detail = str(exc)
        if not re.fullmatch(r'N7_[A-Z0-9_]+(?: [a-zA-Z0-9_./-]+)?', detail):
            detail = 'N7_INSTALL_GUARD_FAILED'
        raise SystemExit(detail) from None
    except KeyboardInterrupt:
        raise SystemExit('N7_INSTALL_INTERRUPTED') from None
