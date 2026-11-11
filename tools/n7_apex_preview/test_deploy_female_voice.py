import hashlib,json,os,pathlib,tempfile,unittest,posixpath
from unittest.mock import patch
import deploy_female_voice as d
class FTP:
 def __init__(self):self.here='/public';self.dirs={'/public'};self.files={};self.writes=0
 def cwd(self,n):
  p=pathlib.PurePosixPath(self.here)/n if not n.startswith('/') else pathlib.PurePosixPath(n)
  p=posixpath.normpath(str(p))
  if p not in self.dirs:raise RuntimeError('550 missing')
  self.here=p
 def mkd(self,n):self.dirs.add(self.here+'/'+n);self.writes+=1
 def storbinary(self,c,f):self.files[self.here+'/'+c[5:]]=f.read();self.writes+=1
 def retrbinary(self,c,cb):
  try:cb(self.files[self.here+'/'+c[5:]])
  except KeyError:raise RuntimeError('550 missing')
 def sendcmd(self,c):pass
 def rename(self,a,b):
  old,new=self.here+'/'+a,self.here+'/'+b;self.dirs.remove(old);self.dirs.add(new)
  for p in list(self.files):
   if p.startswith(old+'/'):self.files[new+p[len(old):]]=self.files.pop(p)
 def quit(self):pass
class Tests(unittest.TestCase):
 def run_deploy(self,dry=False,ftp=None,tamper=False):
  ftp=ftp or FTP()
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory);data=b'public model fixture';sha=hashlib.sha256(data).hexdigest();manifest={'version':d.ASSET_VERSION,'files':{'model.onnx':sha}}
   (root/'model.onnx').write_bytes(b'bad' if tamper else data);(root/'manifest.json').write_text(json.dumps(manifest))
   with patch.object(d,'connect',return_value=ftp),patch.object(d,'FILES',{'model.onnx':sha}),patch.dict(os.environ,{'N7_FEMALE_VOICE_ASSETS':directory,'N7_DRY_RUN':'1' if dry else '0'}):d.main()
  ftp.here='/public';return ftp
 def test_dry_run_does_not_create_folder(self):self.assertEqual(self.run_deploy(dry=True).writes,0)
 def test_publishes_verified_bundle_once(self):
  ftp=self.run_deploy();writes=ftp.writes;self.run_deploy(ftp=ftp);self.assertEqual(ftp.writes,writes)
 def test_tampered_model_aborts_before_upload(self):
  with self.assertRaises(RuntimeError):self.run_deploy(tamper=True)
 def test_existing_unknown_version_is_not_overwritten(self):
  ftp=self.run_deploy();name='/public/n7-apex-voice/'+d.ASSET_VERSION+'/manifest.json';ftp.files[name]=b'{}';before=dict(ftp.files)
  with self.assertRaises(RuntimeError):self.run_deploy(ftp=ftp)
  self.assertEqual(ftp.files,before)
if __name__=='__main__':unittest.main()
