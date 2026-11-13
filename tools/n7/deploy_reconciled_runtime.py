#!/usr/bin/env python3
"""Guarded installation of a canonical N7 runtime using existing, hash-verified code.

No private source is stored in GitHub logs/artifacts. Only approved backend modules,
the release receipt and restart marker can change.
"""
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import socket
import ssl
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = '/bot.piratecartography.com/n7-app'
BASE = 'https://bot.piratecartography.com'
TLS = 'linux3087.grserver.gr'
HERE = Path(__file__).resolve().parent
PUBLIC_MODULES = {'conversation-store.js': 'conversation-store.js',
                  'workspace-workflows.js': 'workspace-workflows.js',
                  'n7-queue-bridge.js': 'n7-queue-bridge.js',
                  'historical-research.js': '../library/n7-historical-research.js',
                  'n7-stream-attachments.js': 'stream-attachments.js',
                  'owner-chat-memory.js': 'owner-chat-memory.js',
                  'source-library.js': 'source-library.js',
                  'n7-release-info.js': 'runtime-release-info.js',
                  'n7-weather.js': 'weather-tool.js',
                  'n7-public-web-search.js': 'public-web-search.js',
                  'n7-semantic-assets.js': 'semantic-assets.js',
                  'n7-coding-agent.js': 'coding-agent-tool.js'}
for _skill in ('book-project-canon', 'document-reading-plan', 'claim-evidence-ledger', 'editorial-preservation'):
    PUBLIC_MODULES['skills/' + _skill + '/SKILL.md'] = 'skills/' + _skill + '/SKILL.md'
# The engineering workflow is distributed with the other reviewed skills (owner decision, no secrets);
# skills/n7-verified-change/SKILL.md in the canonical repository is kept byte-identical by a test.
PUBLIC_MODULES['skills/n7-verified-change/SKILL.md'] = 'skills/n7-verified-change/SKILL.md'
WRITABLE = {'server.js', 'public/app.js', 'public/index.html', 'public/style.css', 'release-manifest.json', *PUBLIC_MODULES}
LIMIT = 8 * 1024 * 1024


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
    if "require('./n7-release-info')" not in source:
        start = source.index("    if(req.method==='GET'&&/^\\/api\\/research\\/corpus")
        end = source.index("      if(!originOK(req))return json(res,403,{error:'Invalid origin'});\n      try{return json(res,200,{lessons:ownerChatMemory.list()});}", start)
        block = source[start:end]
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
    for name in ('n7-command-router.js', 'n7-map-protocol.js', 'humanoid-stage.js'):
        tail += '\n' + (HERE / name).read_text()
    return (prefix + tail).encode()


# SHA-256 of the installed approved-character block (release 483096c9…, canonical 1ba82fd/f9932e6).
PREVIOUS_CHARACTER_BLOCKS = {'cdc734194899240f5045266863c16dbcea28f57b0907af17655be264760c0286'}
# Owner decision 2026-11-13: remove the unreviewed password-free public chat that atlas PR #347
# (tools/n7_apex_preview/deploy_public_chat.py) installed directly on the live server. Only this
# exact live variant is accepted, and only if removing those two insertions yields the installed
# reviewed release byte for byte.
APEX_PUBLIC_SHIM = ("// N7_APEX_PASSWORDLESS_CHAT_V1\nconst n7ApexPublic=require('./n7-apex-public-chat.cjs')"
                    ".createApexPublicChat({apiKey:API_KEY,model:MODEL,base:BASE});\n")
APEX_PUBLIC_GUARD = ("\n  try { if(await n7ApexPublic.handle(req,res)) return; } catch { res.writeHead(500,{'Content-Type':"
                     "'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Η συνομιλία δεν ολοκληρώθηκε.'}));return; }\n")
KNOWN_UNREVIEWED_SERVERS = {'2a4d6c8a6003a13f6b040ff25482516113a90b692372d89baaef7d3298eb05cd'}


def remove_apex_public(source):
    text = source.decode('utf8')
    if text.count(APEX_PUBLIC_SHIM) != 1 or text.count(APEX_PUBLIC_GUARD) != 1:
        raise RuntimeError('N7_UNREVIEWED_LIVE_SERVER')
    return text.replace(APEX_PUBLIC_SHIM, '', 1).replace(APEX_PUBLIC_GUARD, '', 1).encode()


STAGE_CSS_MARKER = '/* N7_HUMANOID_STAGE_V1'


def transform_css(original):
    # N7_HUMANOID_STAGE_V1: the canonical stylesheet is the installed one plus the stage styles.
    source = original.decode('utf8')
    stage = (HERE / 'humanoid-stage.css').read_text()
    if source.count(STAGE_CSS_MARKER) > 1:
        raise RuntimeError('N7_PUBLIC_CSS_ANCHOR_CHANGED')
    prefix = source[:source.index(STAGE_CSS_MARKER)] if STAGE_CSS_MARKER in source else source + '\n'
    return (prefix + stage).encode()


def syntax(data):
    with tempfile.NamedTemporaryFile(suffix='.js') as file:
        file.write(data)
        file.flush()
        subprocess.run(['node', '--check', file.name], capture_output=True, check=True, timeout=20)


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
            if name == 'server.js' and current is not None and sha(current) in KNOWN_UNREVIEWED_SERVERS:
                reverted = remove_apex_public(current)
                if sha(reverted) != previous_files.get('server.js'):
                    raise RuntimeError('N7_UNREVIEWED_LIVE_SERVER')
                server_input = reverted
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
        if name.endswith('.js'):
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


def restart(ftp):
    ftp.storbinary('STOR ' + ROOT + '/tmp/restart.txt', io.BytesIO(b'n7-reconciled-runtime\n'))


def install(ftp, payload, originals, verifier):
    if set(payload) - WRITABLE or set(payload) != set(originals):
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
        # Create only explicitly approved new skill directories, never private paths.
        for name in changed:
            if name.startswith('skills/'):
                directory = ROOT + '/' + name.rsplit('/', 1)[0]
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
        if installed:
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


def verify(release, commit, ftp=None, active=True):
    deadline = time.monotonic() + 110
    while True:
        try:
            with request('/health?n7release=' + secrets.token_hex(8)) as response:
                health = json.loads(response.read(20000))
            valid = health.get('status') == 'ok' and health.get('modelConfigured') is True
            if active:
                valid = valid and health.get('release') == {'id': release['release_id'], 'canonical_commit': commit}
            if valid:
                break
        except (OSError, ValueError):
            pass
        if time.monotonic() >= deadline:
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


def main():
    release = contract()
    commit = os.environ['N7_CANONICAL_COMMIT']
    dry = os.getenv('N7_DRY_RUN', '1') != '0'
    ftp = connect()
    try:
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
    main()
