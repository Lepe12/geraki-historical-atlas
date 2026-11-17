#!/usr/bin/env python3
import importlib.util
import io
import json
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('n7_guest_receipt',Path(__file__).with_name('n7-guest-canonical-receipt.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class FakeFTP:
    def __init__(self,manifest):
        self.data={module.ROOT+'/'+module.MANIFEST:manifest}
        self.events=[]
        self.locks=set()
    def retrbinary(self,cmd,callback):
        name=cmd.split(' ',1)[1]
        if name not in self.data:raise RuntimeError('missing '+name)
        callback(self.data[name])
    def storbinary(self,cmd,input):
        name=cmd.split(' ',1)[1]
        self.data[name]=input.read();self.events.append(('write',name))
    def rename(self,a,b):
        if a not in self.data or b in self.data:raise RuntimeError('unsafe rename')
        self.data[b]=self.data.pop(a);self.events.append(('rename',a,b))
    def delete(self,name):
        self.events.append(('delete',name))
        if name not in self.data:raise RuntimeError('not found')
        del self.data[name]
    def mkd(self,name):
        if name in self.locks:raise RuntimeError('locked')
        self.locks.add(name)
    def rmd(self,name):
        self.locks.remove(name)


class CanonicalReceiptTests(unittest.TestCase):
    def setUp(self):
        self.contract=module.contract()
        self.old={'schema':'n7-runtime-build/v1',
            'release_id':module.OLD_RELEASE,
            'canonical_commit':module.OLD_COMMIT,
            'source_lock_verified':True,
            'files':self.contract['previous_files'],
            'baseline_verified':False}
        self.raw=(json.dumps(self.old,indent=2)+'\n').encode()
        self.ftp=FakeFTP(self.raw)
        self.saved=(module.check_files,module.health,module.public_and_private_routes,module.restart)
        module.check_files=lambda ftp,data:None
        module.health=lambda *args,**kwargs:None
        module.public_and_private_routes=lambda:None
        module.restart=lambda ftp:ftp.events.append(('restart','tmp/restart.txt'))
    def tearDown(self):
        module.check_files,module.health,module.public_and_private_routes,module.restart=self.saved

    def test_live_hashed_release_has_no_extra_scope(self):
        c=self.contract
        self.assertEqual(len(c['previous_files']),69)
        self.assertEqual(len(c['files']),70)
        self.assertEqual(module.release_id(c['previous_files']),module.OLD_RELEASE)
        self.assertEqual(module.release_id(c['files']),c['release_id'])
        changed={k for k,v in c['files'].items() if c['previous_files'].get(k)!=v}
        self.assertEqual(changed,{'server.js','n7-apex-public-chat.cjs'})

    def test_success_only_changes_receipt_and_restart_marker(self):
        module.install(self.ftp,self.contract,self.raw)
        final=json.loads(self.ftp.data[module.ROOT+'/'+module.MANIFEST])
        self.assertEqual(final['files'],self.contract['files'])
        self.assertEqual(final['canonical_commit'],module.NEW_COMMIT)
        self.assertTrue(final['source_lock_verified'])
        self.assertEqual(len([k for k in self.ftp.data if '.n7-guest-canonical-receipt-backup-' in k]),1)
        self.assertFalse(self.ftp.locks)
        self.assertFalse(any('/data/' in '/'.join(map(str,event)) for event in self.ftp.events))
        self.assertFalse(any('server.js' in '/'.join(map(str,event)) for event in self.ftp.events))
        self.assertTrue(any(event[0]=='restart' for event in self.ftp.events))

    def test_post_install_failure_restores_exact_original_receipt(self):
        def denied():raise RuntimeError('simulated guest endpoint verification failure')
        module.public_and_private_routes=denied
        with self.assertRaisesRegex(RuntimeError,'simulated guest'):
            module.install(self.ftp,self.contract,self.raw)
        self.assertEqual(self.ftp.data[module.ROOT+'/'+module.MANIFEST],self.raw)
        self.assertFalse(self.ftp.locks)

    def test_unreviewed_manifest_aborts_before_staging(self):
        self.old['canonical_commit']='0'*40
        corrupted=(json.dumps(self.old)+'\n').encode()
        with self.assertRaisesRegex(RuntimeError,'RECEIPT_DRIFT'):
            module.install(self.ftp,self.contract,corrupted)
        self.assertEqual(self.ftp.events,[])
        self.assertEqual(self.ftp.data[module.ROOT+'/'+module.MANIFEST],self.raw)

if __name__=='__main__':unittest.main()
