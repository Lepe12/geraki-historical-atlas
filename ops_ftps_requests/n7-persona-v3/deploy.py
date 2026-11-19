#!/usr/bin/env python3
"""N7 one-time two-module FTPS deployment, only public-approved source fragments."""
import ftplib, hashlib, io, json, os, secrets, socket, ssl, subprocess, tempfile, time, urllib.request
from pathlib import Path
ROOT = '/bot.piratecartography.com/n7-app'
BASE = 'https://bot.piratecartography.com'
TLS = 'linux3087.grserver.gr'
HERE = Path(__file__).resolve().parent
ATLAS_ROOT = HERE.parents[1]
MANIFEST = HERE / 'request.json'
CHANGES = {
    'owner-chat-memory.js': {
        'source': ATLAS_ROOT / 'tools/n7/owner-chat-memory.js',
        'anchor': "    'Maintain prior user preferences and historical-source integrity.",
        'addition': "    'Take initiative within actual tool permissions: anticipate the next useful step, identify missing evidence and technical gaps, select the fastest safe route, perform authorized reversible actions, and verify them. Do not replace execution with suggestions when action is available.',\n    'Truth is non-negotiable: distinguish what you can do now, what you cannot access or do, what you completed, what you tested, and what remains unverified. Never fake progress or say a change is live when it is only in source.',\n    'Stay committed to making N7, its historical research, library, Humanoid and NABOU genuinely useful. Show commitment through careful follow-through, independent judgement and corrections, not invented emotions, automatic praise or false certainty.',\n",
    },
    'n7-apex-public-chat.cjs': {
        'source': ATLAS_ROOT / 'tools/n7/apex-public-chat.cjs',
        'anchor': "'Για ιστορικά θέματα ξεχώριζε τα τεκμήρια",
        'addition': "'Πάρε πρωτοβουλία μέσα στις πραγματικές δυνατότητές σου: πρόβλεψε τι λείπει, εντόπισε σφάλματα και βελτιώσεις, διάλεξε την ταχύτερη ασφαλή ενέργεια, και εκτέλεσέ την μόνο αν διαθέτεις το αντίστοιχο εργαλείο και εξουσιοδότηση. Μη μετατρέπεις την εκτέλεση σε άσκοπες οδηγίες.',\n'Να λες πάντοτε την αλήθεια για όσα μπορείς και όσα δεν μπορείς να κάνεις. Ξεχώριζε καθαρά πράξεις που εκτέλεσες, αποτελέσματα που έλεγξες και εκκρεμότητες. Ποτέ φανταστική έρευνα, εγκατάσταση ή ζωντανός έλεγχος.',\n'Να υπηρετείς με συνέπεια τον σκοπό του N7, του NABOU και της τεκμηριωμένης ιστορικής έρευνας. Δείξε την προσήλωσή σου με ουσιαστική κριτική και ολοκλήρωση εργασιών, όχι με ισχυρισμούς για ανθρώπινα συναισθήματα.',\n",
    },
}
SOURCE_COMMIT = "633830c95e9b4e0dbf2140fe158d63c4ca041d1b"
EXPECTED = json.loads(r'{"confirmation":"N7-OWNER-PERSONALITY-MODULE-INSTALL","canonical_commit":"633830c95e9b4e0dbf2140fe158d63c4ca041d1b","target":"/bot.piratecartography.com/n7-app","files":{"owner-chat-memory.js":{"old":"dfa4f878cca35f4a4a63fc19a4b2d052f4b896b2b8f4007da7ae6a36c392cd33","new":"9773bc95edf0feefead0be55f212acffecc4286d6fecfc4fcbb5b4c2314ecf34"},"n7-apex-public-chat.cjs":{"old":"ffb11a9b0cffb23b9b019985c59f0e51b6b9dcb0d4f208b9d0eb0674b63f541a","new":"01436268f3b00861bc7a6d48f23e9fc0262908818e0c58310774188b4ec30069"}},"preserve_private_data":true,"rollback_on_failure":true}')
def sha(data):
    return hashlib.sha256(data).hexdigest()

def payload():
    manifest = json.loads(MANIFEST.read_text(encoding='utf8'))
    if manifest != EXPECTED:
        raise RuntimeError('N7_PERSONA_RELEASE_REQUEST_NOT_APPROVED')
    out = {}
    for name, rule in CHANGES.items():
        source = rule['source'].read_bytes()
        old = manifest['files'][name]['old']
        new = manifest['files'][name]['new']
        if sha(source) != old:
            raise RuntimeError('N7_PERSONA_APPROVED_BASELINE_CHANGED ' + name)
        text = source.decode('utf8')
        if text.count(rule['anchor']) != 1:
            raise RuntimeError('N7_PERSONA_ANCHOR_CHANGED ' + name)
        data = text.replace(rule['anchor'], rule['addition'] + rule['anchor'], 1).encode('utf8')
        if sha(data) != new:
            raise RuntimeError('N7_PERSONA_CANONICAL_SOURCE_NOT_MATCHED ' + name)
        if len(data) > 32768:
            raise RuntimeError('N7_PERSONA_MODULE_TOO_LARGE')
        with tempfile.NamedTemporaryFile(suffix='.js') as temp:
            temp.write(data)
            temp.flush()
            subprocess.run(['node', '--check', temp.name], check=True, capture_output=True, timeout=15)
        out[name] = data
    return manifest, out

def read(ftp, path):
    chunks = []
    size = 0
    def collect(blob):
        nonlocal size
        size += len(blob)
        if size > 65536:
            raise RuntimeError('N7_PERSONA_REMOTE_SIZE_LIMIT')
        chunks.append(blob)
    ftp.retrbinary('RETR ' + ROOT + '/' + path, collect)
    return b''.join(chunks)

def connect():
    host = os.environ['PCT_FTPS_HOST']
    port = int(os.getenv('PCT_FTPS_PORT', '21'))
    ips = lambda h: {entry[4][0] for entry in socket.getaddrinfo(h, port, type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):
        raise RuntimeError('N7_PERSONA_FTPS_HOST_NOT_APPROVED')
    ftp = ftplib.FTP_TLS(timeout=40, context=ssl.create_default_context())
    ftp.connect(host, port)
    ftp.host = TLS
    ftp.login(os.environ['PCT_FTPS_USER'], os.environ['PCT_FTPS_PASSWORD'])
    ftp.prot_p()
    ftp.cwd(ROOT)
    if ftp.pwd().rstrip('/') != ROOT:
        raise RuntimeError('N7_PERSONA_REMOTE_ROOT_MISMATCH')
    return ftp

def live_ok():
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(BASE + '/health?n7persona=' + secrets.token_hex(5), timeout=12, context=ctx) as r:
        health = json.loads(r.read(10000))
    with urllib.request.urlopen(BASE + '/api/n7-apex/status?n7persona=' + secrets.token_hex(5), timeout=12, context=ctx) as r:
        guest = json.loads(r.read(10000))
    return health.get('status') == 'ok' and health.get('modelConfigured') is True and guest == {'passwordRequired':False,'available':True,'privateHistory':False}

def verify_live(max_seconds=90):
    deadline = time.monotonic() + max_seconds
    while True:
        try:
            if live_ok():
                return
        except (OSError, ValueError, TimeoutError):
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError('N7_PERSONA_LIVE_HEALTH_NOT_VERIFIED')
        time.sleep(3)

def deploy():
    manifest, new = payload()
    if os.getenv('N7_OFFLINE') == '1':
        print('N7_PERSONA_PATCH_AND_SYNTAX=PASS canonical_commit=' + SOURCE_COMMIT)
        return
    ftp = connect()
    try:
        original = {name: read(ftp, name) for name in new}
        for name, data in original.items():
            digest = sha(data)
            allowed = {manifest['files'][name]['old'], manifest['files'][name]['new']}
            if digest not in allowed:
                raise RuntimeError('N7_PERSONA_REMOTE_DRIFT ' + name + ' sha256=' + digest)
        verify_live(max_seconds=25)
        changed = [name for name in new if original[name] != new[name]]
        if os.getenv('N7_DRY_RUN','1') != '0':
            print('N7_PERSONA_PREFLIGHT=PASS dry_run=true changes=' + str(len(changed)))
            return
        if not changed:
            print('N7_PERSONA_ALREADY_INSTALLED remote_hashes=true')
            return
        lock = ROOT + '/.n7-persona-release-lock'
        ftp.mkd(lock)
        tag = secrets.token_hex(8)
        staged = {}
        backups = {}
        installed = []
        try:
            for name in changed:
                stage = '.n7-persona-stage-' + tag + '-' + name
                staged[name] = stage
                ftp.storbinary('STOR ' + ROOT + '/' + stage, io.BytesIO(new[name]))
                if read(ftp, stage) != new[name]:
                    raise RuntimeError('N7_PERSONA_STAGE_MISMATCH')
            for name in original:
                if read(ftp, name) != original[name]:
                    raise RuntimeError('N7_PERSONA_CONCURRENT_CHANGE')
            for name in changed:
                back = '.n7-persona-backup-' + tag + '-' + name
                ftp.rename(ROOT + '/' + name, ROOT + '/' + back)
                backups[name] = back
                if read(ftp, back) != original[name]:
                    raise RuntimeError('N7_PERSONA_BACKUP_MISMATCH')
                ftp.rename(ROOT + '/' + staged.pop(name), ROOT + '/' + name)
                installed.append(name)
                if sha(read(ftp, name)) != manifest['files'][name]['new']:
                    raise RuntimeError('N7_PERSONA_ACTIVE_HASH_MISMATCH')
            ftp.storbinary('STOR ' + ROOT + '/tmp/restart.txt', io.BytesIO(b'n7-persona-approved\n'))
            verify_live()
            for name in changed:
                if sha(read(ftp, name)) != manifest['files'][name]['new']:
                    raise RuntimeError('N7_PERSONA_FINAL_HASH_MISMATCH')
            print('N7_PERSONA_DEPLOYED_AND_VERIFIED files=' + str(len(changed)) + ' backups_retained=true private_data_written=0')
        except BaseException:
            errors = []
            for name in reversed(changed):
                if name not in backups:
                    continue
                try:
                    current = read(ftp, name) if name in installed else None
                    if current is not None:
                        if current != new[name]:
                            raise RuntimeError('N7_PERSONA_CONCURRENT_CHANGE_DURING_ROLLBACK')
                        ftp.delete(ROOT + '/' + name)
                    ftp.rename(ROOT + '/' + backups[name], ROOT + '/' + name)
                    if read(ftp, name) != original[name]:
                        raise RuntimeError('N7_PERSONA_ROLLBACK_HASH_MISMATCH')
                except Exception:
                    errors.append(name)
            if installed:
                ftp.storbinary('STOR ' + ROOT + '/tmp/restart.txt', io.BytesIO(b'n7-persona-rollback\n'))
            print('N7_PERSONA_ROLLBACK=' + ('MANUAL_CHECK_REQUIRED:' + ','.join(errors) if errors else 'VERIFIED'))
            raise
        finally:
            for stage in staged.values():
                try: ftp.delete(ROOT + '/' + stage)
                except ftplib.all_errors: pass
            ftp.rmd(lock)
    finally:
        ftp.quit()

if __name__ == '__main__':
    deploy()
