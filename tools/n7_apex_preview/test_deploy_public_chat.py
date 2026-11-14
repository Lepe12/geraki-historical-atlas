import unittest
from unittest.mock import patch as mockpatch
import os,pathlib
import deploy_public_chat as deployment
from deploy_public_chat import patch,syntax,install
BASE=b"const API_KEY='fixture';const MODEL='model';const BASE='https://example.invalid';const http=require('http');const n7Relay={handle:async()=>false};const server=http.createServer(async(req,res)=>{try{if(await n7Relay.handle(req,res)) return;}catch{}});"
class FTP:
 def __init__(self):self.files={'server.js':b'old'}
 def retrbinary(self,c,cb):
  name=c[5:]
  if name not in self.files:raise RuntimeError('550 missing')
  cb(self.files[name])
 def storbinary(self,c,f):self.files[c[5:]]=f.read()
 def sendcmd(self,c):pass
 def rename(self,a,b):self.files[b]=self.files.pop(a)
class Tests(unittest.TestCase):
 def test_patch_is_additive_idempotent_and_valid(self):
  new=patch(BASE);syntax(new);self.assertIn(b'if(await n7Relay.handle(req,res)) return;',new);self.assertEqual(patch(new),new);self.assertNotIn(b'session(req)',new)
 def test_unknown_private_source_aborts(self):
  with self.assertRaises(RuntimeError):patch(b'unknown server')
 def test_concurrent_server_change_aborts(self):
  ftp=FTP();done=[]
  with self.assertRaises(RuntimeError):install(ftp,"server.js",b"new",done,expected=b"different")
  self.assertEqual(ftp.files["server.js"],b"old");self.assertEqual(done,[])
 def test_already_installed_route_has_no_writes_or_restart(self):
  ftp=FTP();ftp.cwd=lambda path:None;ftp.quit=lambda:None
  ftp.files['server.js']=patch(BASE)
  ftp.files['n7-apex-public-chat.cjs']=pathlib.Path(deployment.__file__).with_name('n7-apex-public-chat.cjs').read_bytes()
  before=dict(ftp.files)
  with mockpatch.object(deployment,'connect',return_value=ftp),mockpatch.object(deployment,'verify') as verify,mockpatch.dict(os.environ,{'N7_DRY_RUN':'0'}):
   deployment.main()
  verify.assert_called_once_with(real_model=False);self.assertEqual(ftp.files,before)
 def test_install_retains_exact_original_for_rollback(self):
  ftp=FTP();done=[];install(ftp,'server.js',b'new',done);self.assertEqual(ftp.files['server.js'],b'new');self.assertEqual(ftp.files[done[0][1]],b'old')
if __name__=='__main__':unittest.main()
