#!/usr/bin/env python3
"""N7_HYBRID_SEARCH_V1: narrow FTPS installation of hybrid library search. Run from a GitHub Actions
runner after n7-semantic-index.mjs and tools/n7/prepare-semantic-model.cjs.

Writes ONLY:
  /piratecartography-gateway/tools/library/n7_library.php        (staged, read back, backup kept)
  /piratecartography-gateway/tools/library/n7-semantic/*         (index for the PHP search)
  /bot.piratecartography.com/n7-app/n7-semantic/*                (authenticated index for the N7 page)
  /bot.piratecartography.com/n7-app/public/n7-model/*            (pinned public model + runtime)
No database, server.js, gateway, credentials or page text are written. Every upload is staged under
a temporary name, verified by SHA-256 read-back and then renamed; manifest.json is written last.
On any failure the PHP file is restored from its backup. Without a valid index PHP stays lexical.
Usage: deploy_n7_semantic_ftps.py INDEX_DIR MODEL_DIR
"""
import ftplib, hashlib, io, json, os, socket, ssl, sys, uuid
from pathlib import Path

GATEWAY = '/piratecartography-gateway/tools/library'
BOT = '/bot.piratecartography.com/n7-app'
INDEX_FILES = ('chunks.i8', 'chunks.meta.json', 'words.keys', 'words.i8', 'words.w')

def connect():
    host = os.environ['PCT_FTPS_HOST']; port = int(os.getenv('PCT_FTPS_PORT', '21'))
    alias = os.getenv('PCT_FTPS_TLS_SERVER_NAME', '').strip()
    if alias:
        a = {r[4][0] for r in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)}
        b = {r[4][0] for r in socket.getaddrinfo(alias, port, type=socket.SOCK_STREAM)}
        if not a & b: raise RuntimeError('TLS_ALIAS_NOT_VERIFIED')
    ftp = ftplib.FTP_TLS(timeout=60, context=ssl.create_default_context())
    ftp.connect(host, port)
    if alias: ftp.host = alias
    ftp.login(os.environ['PCT_FTPS_USER'], os.environ['PCT_FTPS_PASSWORD']); ftp.prot_p()
    return ftp

def remote_sha(ftp, path):
    h = hashlib.sha256()
    try: ftp.retrbinary('RETR ' + path, h.update)
    except ftplib.error_perm as e:
        if str(e).startswith('550'): return None
        raise
    return h.hexdigest()

def mkdirs(ftp, path):
    cur = ''
    for part in path.strip('/').split('/'):
        cur += '/' + part
        try: ftp.mkd(cur)
        except ftplib.error_perm as e:
            if not str(e).startswith('550'): raise

def put(ftp, path, data, tag):
    """Stage, verify by read-back, then atomically replace. Returns backup name or None."""
    expected = hashlib.sha256(data).hexdigest()
    if remote_sha(ftp, path) == expected: return None, False
    stage = path + '.n7stage-' + tag
    ftp.storbinary('STOR ' + stage, io.BytesIO(data), blocksize=1 << 20)
    if remote_sha(ftp, stage) != expected: raise RuntimeError('STAGE_READBACK_MISMATCH ' + path)
    backup = None
    if remote_sha(ftp, path) is not None:
        backup = path + '.n7backup-' + tag; ftp.rename(path, backup)
    ftp.rename(stage, path)
    if remote_sha(ftp, path) != expected: raise RuntimeError('FINAL_HASH_MISMATCH ' + path)
    return backup, True

def main(index_dir, model_dir):
    index_dir, model_dir = Path(index_dir), Path(model_dir)
    manifest = json.loads((index_dir / 'manifest.json').read_text())
    for name in INDEX_FILES:
        if hashlib.sha256((index_dir / name).read_bytes()).hexdigest() != manifest['files'][name]:
            raise RuntimeError('LOCAL_INDEX_HASH_MISMATCH ' + name)
    spec = json.loads((Path(__file__).resolve().parents[1] / 'n7' / 'semantic-model.json').read_text())
    php = (Path(__file__).resolve().parent / 'n7_library.php').read_bytes()
    if b'N7_HYBRID_SEARCH_V1' not in php: raise RuntimeError('PHP_NOT_HYBRID')
    ftp = connect(); tag = uuid.uuid4().hex[:10]; php_backup = None; written = 0
    try:
        current = io.BytesIO(); ftp.retrbinary('RETR ' + GATEWAY + '/n7_library.php', current.write)
        if b'function n7search' not in current.getvalue(): raise RuntimeError('UNEXPECTED_REMOTE_LIBRARY_CLI')
        if b'independent-ai-bot' not in (lambda b: (ftp.retrbinary('RETR ' + BOT + '/package.json', b.write), b.getvalue())[1])(io.BytesIO()):
            raise RuntimeError('WRONG_BOT_APP')
        # 1. Public model files (no private data).
        for rel, f in spec['files'].items():
            data = (model_dir / rel).read_bytes()
            if hashlib.sha256(data).hexdigest() != f['sha256']: raise RuntimeError('LOCAL_MODEL_HASH_MISMATCH ' + rel)
            target = BOT + '/public/n7-model/' + rel
            mkdirs(ftp, target.rsplit('/', 1)[0]); _, changed = put(ftp, target, data, tag); written += changed
        # Apache serves public/ directly: ES modules and WebAssembly need their exact MIME types.
        _, changed = put(ftp, BOT + '/public/n7-model/.htaccess',
                         b'AddType text/javascript .mjs .js\nAddType application/wasm .wasm\nAddType application/octet-stream .onnx\n', tag); written += changed
        # 2. Index files in both places, manifest last.
        for base in (GATEWAY + '/n7-semantic', BOT + '/n7-semantic'):
            mkdirs(ftp, base)
            for name in (*INDEX_FILES, 'manifest.json'):
                _, changed = put(ftp, base + '/' + name, (index_dir / name).read_bytes(), tag); written += changed
        # 3. The hybrid-capable library CLI (falls back to lexical if the index is invalid).
        php_backup, changed = put(ftp, GATEWAY + '/n7_library.php', php, tag); written += changed
        print(json.dumps({'status': 'N7_SEMANTIC_INSTALLED', 'files_written': written, 'chunks': manifest['chunks'],
                          'words': manifest['words'], 'sources': manifest.get('sources'), 'pages': manifest.get('pages'),
                          'php_backup_retained': php_backup is not None}))
    except BaseException:
        if php_backup:
            try:
                ftp.delete(GATEWAY + '/n7_library.php'); ftp.rename(php_backup, GATEWAY + '/n7_library.php')
                print('N7_SEMANTIC_PHP_ROLLED_BACK=true')
            except ftplib.all_errors:
                print('N7_SEMANTIC_MANUAL_ROLLBACK_REQUIRED=' + php_backup)
        raise
    finally:
        try: ftp.quit()
        except ftplib.all_errors: pass

if __name__ == '__main__':
    if len(sys.argv) != 3: raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
