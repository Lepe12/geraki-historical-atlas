#!/usr/bin/env python3
"""Receive a one-time X25519/AES-GCM encrypted canonical N7 release over GitHub.
Private key stays in runner memory. Public Atlas branch never contains N7 plaintext.
The live deployment still uses the canonical guarded installer with rollback.
"""
import base64,hashlib,io,json,os,sys,tarfile,tempfile,time,subprocess
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey,X25519PublicKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

REPO='Lepe12/geraki-historical-atlas'
BRANCH='audit/n7-live-readonly-20261116'
MANIFEST='n7-secure-relay/capsule-manifest.json'
SOURCE_COMMIT='6617c8852f6252b1f372a0573f1d36c6fc83f449'
AAD=b'N7-AUTHORIZED-RELEASE-6617c885'
def read_path(path):
    api=f'https://api.github.com/repos/{REPO}/contents/{path}?ref={BRANCH}'
    request=Request(api,headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],
                  'Accept':'application/vnd.github+json','User-Agent':'n7-relay'})
    with urlopen(request,timeout=15) as resp:
        data=json.load(resp)
    if data.get('encoding')!='base64':raise ValueError('Unexpected capsule encoding')
    return base64.b64decode(data['content'])
def publish_key(public):
    key_data=json.dumps({'schema':'n7-ephemeral-recipient-v1','public_key':base64.b64encode(public).decode(),
        'source_commit':SOURCE_COMMIT}).encode()
    existing_sha=None
    try:
        existing_api=f'https://api.github.com/repos/{REPO}/contents/n7-secure-relay/session-public-key.json?ref={BRANCH}'
        existing_request=Request(existing_api,headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],
            'Accept':'application/vnd.github+json','User-Agent':'n7-relay'})
        with urlopen(existing_request,timeout=15) as existing_response:
            existing_sha=json.load(existing_response)['sha']
    except HTTPError as error:
        if error.code!=404:raise
    payload_obj={'message':'ci(n7): rotate ephemeral encryption recipient, no secrets',
        'content':base64.b64encode(key_data).decode(),'branch':BRANCH}
    if existing_sha:payload_obj['sha']=existing_sha
    payload=json.dumps(payload_obj).encode()
    url=f'https://api.github.com/repos/{REPO}/contents/n7-secure-relay/session-public-key.json'
    request=Request(url,data=payload,method='PUT',headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],
                   'Accept':'application/vnd.github+json','Content-Type':'application/json',
                   'User-Agent':'n7-relay'})
    with urlopen(request,timeout=25) as response:
        if response.status not in (200,201):raise ValueError('Cannot publish recipient public key')
    print('N7_EPHEMERAL_PUBLIC_KEY_PUBLISHED=true',flush=True)

def receive(private,pub):
    deadline=time.monotonic()+12*60
    while time.monotonic()<deadline:
        try:
            manifest=json.loads(read_path(MANIFEST))
            if manifest.get('schema')!='n7-ephemeral-encrypted-release-v1' or manifest.get('source_commit')!=SOURCE_COMMIT:
                raise ValueError('Unexpected canonical release')
            if manifest.get('recipient_pub')!=base64.b64encode(pub).decode():
                raise ValueError('Encrypted for another runner')
            chunks=manifest.get('parts')
            if not isinstance(chunks,list) or not 1<=len(chunks)<=20 or chunks!=[
                f'n7-secure-relay/chunk-{i:03d}.txt' for i in range(len(chunks))]:
                raise ValueError('Unexpected encrypted chunks')
            payload=''.join(read_path(p).decode('ascii') for p in chunks)
            ciphertext=base64.b64decode(payload,validate=True)
            if hashlib.sha256(ciphertext).hexdigest()!=manifest.get('cipher_sha256'):
                raise ValueError('Ciphertext SHA256 mismatch')
            peer=X25519PublicKey.from_public_bytes(base64.b64decode(manifest['ephemeral_pub']))
            key=HKDF(algorithm=hashes.SHA256(),length=32,salt=None,info=AAD).derive(private.exchange(peer))
            package=AESGCM(key).decrypt(base64.b64decode(manifest['nonce']),ciphertext,AAD)
            if hashlib.sha256(package).hexdigest()!=manifest.get('package_sha256'):
                raise ValueError('Release SHA256 mismatch')
            print('N7_SECURE_CAPSULE_AUTHENTICATED=true',flush=True)
            return package
        except HTTPError as e:
            if e.code!=404:raise
        time.sleep(6)
    raise TimeoutError('Canonical encrypted release not received')
def extract(payload,root):
    with tarfile.open(fileobj=io.BytesIO(payload),mode='r:gz') as tar:
        members=tar.getmembers()
        if len(members)>400 or sum(m.size for m in members)>8*1024*1024:raise ValueError('Oversized N7 release')
        for member in members:
            p=Path(member.name)
            if not member.isfile() or p.is_absolute() or '..' in p.parts or not p.parts:
                raise ValueError('Unsafe N7 archive member')
            target=root/p
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(tar.extractfile(member).read())
    contract=json.loads((root/'tools/n7/reconciled-runtime-contract.json').read_text())
    if contract.get('schema')!='n7-reconciled-deploy/v1':raise ValueError('Unexpected installer contract')
    print('N7_RELEASE_CONTRACT_VERIFIED files='+str(len(contract['files'])),flush=True)
def install(root):
    script=root/'tools/n7/deploy_reconciled_runtime.py'
    env=os.environ.copy()
    env['N7_CANONICAL_COMMIT']=SOURCE_COMMIT
    for phase in ('1','0'):
        env['N7_DRY_RUN']=phase
        result=subprocess.run([sys.executable,str(script)],env=env,capture_output=True,text=True,timeout=290)
        log=result.stdout+' '+result.stderr
        if result.returncode!=0:
            if 'N7_RUNTIME_DRIFT' in log: category='RUNTIME_DRIFT'
            elif 'N7_UNREVIEWED' in log:category='UNREVIEWED_SERVER'
            elif 'N7_FINAL_RUNTIME_DRIFT' in log:category='FINAL_HASH_MISMATCH'
            elif 'N7_ACTIVE_RELEASE' in log:category='LIVE_VERIFICATION_FAILED'
            else:category='INSTALLER_REJECTED'
            print('N7_'+('PREFLIGHT' if phase=='1' else 'DEPLOY')+'_RESULT='+category,flush=True)
            raise RuntimeError('N7 canonical guarded installer rejected release')
        if phase=='1':
            if 'N7_CANONICAL_PREFLIGHT_OK' not in log:raise RuntimeError('No preflight proof')
            print('N7_PRODUCTION_PREFLIGHT=PASS',flush=True)
        else:
            if 'N7_RUNTIME_DEPLOYED' not in log:raise RuntimeError('No deployment proof')
            print('N7_PRODUCTION_DEPLOYMENT=PASS',flush=True)
def main():
    private=X25519PrivateKey.generate()
    public=private.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,format=serialization.PublicFormat.Raw)
    publish_key(public)
    print('N7_EPHEMERAL_PUBLIC_KEY='+base64.b64encode(public).decode(),flush=True)
    print('N7_SOURCE_COMMIT_REQUIRED='+SOURCE_COMMIT,flush=True)
    with tempfile.TemporaryDirectory(prefix='n7-authorized-release-') as temporary:
        root=Path(temporary)
        payload=receive(private,public)
        extract(payload,root)
        install(root)
if __name__=='__main__':
    main()
