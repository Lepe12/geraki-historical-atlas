#!/usr/bin/env python3
"""One-time immutable public voice bundle, separate from UI exports/backends."""
import io,json,os,pathlib,secrets,hashlib
from deploy_apex_preview import connect
from prepare_female_voice import ASSET_VERSION,FILES
PARENT='/bot.piratecartography.com/n7-app/public'
def read(ftp,name):
 parts=[];ftp.retrbinary('RETR '+name,parts.append);return b''.join(parts)
def main():
 root=pathlib.Path(os.environ['N7_FEMALE_VOICE_ASSETS']);manifest=json.loads((root/'manifest.json').read_text());dry=os.getenv('N7_DRY_RUN','1')!='0'
 if manifest.get('version')!=ASSET_VERSION or any(manifest.get('files',{}).get(n)!=sha for n,sha in FILES.items()):raise RuntimeError('VOICE_MANIFEST_MISMATCH')
 for n,sha in manifest['files'].items():
  if pathlib.PurePosixPath(n).name!=n or hashlib.sha256((root/n).read_bytes()).hexdigest()!=sha:raise RuntimeError('VOICE_LOCAL_HASH_MISMATCH')
 ftp=connect();stage=None
 try:
  try:ftp.cwd('n7-apex-voice')
  except Exception as e:
   if not str(e).startswith('550'):raise
   if dry:print('N7_FEMALE_VOICE_PREFLIGHT new_bundle=true dry_run=true');return
   ftp.mkd('n7-apex-voice');ftp.cwd('n7-apex-voice')
  try:ftp.cwd(ASSET_VERSION)
  except Exception as e:
   if not str(e).startswith('550'):raise
  else:
   installed=json.loads(read(ftp,'manifest.json'))
   if installed!=manifest:raise RuntimeError('IMMUTABLE_VOICE_BUNDLE_MISMATCH')
   print('N7_FEMALE_VOICE_ALREADY_INSTALLED no_writes=true');return
  if dry:print('N7_FEMALE_VOICE_PREFLIGHT new_bundle=true dry_run=true');return
  stage='.voice-stage-'+secrets.token_hex(6);ftp.mkd(stage);ftp.cwd(stage)
  for n in [*sorted(manifest['files']),'manifest.json']:
   b=(root/n).read_bytes();ftp.storbinary('STOR '+n,io.BytesIO(b));ftp.sendcmd('SITE CHMOD 644 '+n)
   if hashlib.sha256(read(ftp,n)).digest()!=hashlib.sha256(b).digest():raise RuntimeError('VOICE_REMOTE_HASH_MISMATCH_'+n)
  ftp.cwd('..');ftp.rename(stage,ASSET_VERSION);stage=None;print('N7_FEMALE_VOICE_INSTALLED version='+ASSET_VERSION+' backend_unchanged=true')
 finally:
  try:ftp.quit()
  except Exception:ftp.close()
if __name__=='__main__':main()
