#!/usr/bin/env python3
"""Offline transaction and rollback tests for the narrowly scoped PR84 installer."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('n7_persona',Path(__file__).with_name('n7-pr84-guarded-deploy.py'))
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class FakeFTP:
    def __init__(self,items):
        self.files=dict(items)
        self.dirs=set()
    def retrbinary(self,cmd,cb):
        name=cmd.split(' ',1)[1]
        if name not in self.files:raise RuntimeError('missing file '+name)
        cb(self.files[name])
    def storbinary(self,cmd,stream):
        self.files[cmd.split(' ',1)[1]]=stream.read()
    def rename(self,a,b):
        if a not in self.files or b in self.files:raise RuntimeError('unsafe rename')
        self.files[b]=self.files.pop(a)
    def delete(self,name):del self.files[name]
    def mkd(self,name):
        if name in self.dirs:raise RuntimeError('lock exists')
        self.dirs.add(name)
    def rmd(self,name):self.dirs.remove(name)

class TestGuardedDeployment(unittest.TestCase):
    def setUp(self):
        self.old=b'old-persona'
        self.new=b'new-persona'
        self.initial={'schema':'n7-runtime-build/v1','files':{m.HELPER:hashlib.sha256(self.old).hexdigest()},'release_id':'old-release','canonical_commit':'old'}
        self.oldraw=json.dumps(self.initial).encode()
        self.target={m.HELPER:hashlib.sha256(self.new).hexdigest()}
        self.release={'release_id':'new-release','files':self.target}
        self.ftp=FakeFTP({m.ROOT+'/'+m.HELPER:self.old,m.ROOT+'/'+m.MANIFEST:self.oldraw})
        self.saved=(m.OLD_HELPER,m.validate_postdeploy,m.restart)
        m.OLD_HELPER=hashlib.sha256(self.old).hexdigest()
        m.restart=lambda ftp,tag:None
    def tearDown(self):
        m.OLD_HELPER,m.validate_postdeploy,m.restart=self.saved
    def test_success_writes_only_two_files_with_backups(self):
        m.validate_postdeploy=lambda release:None
        m.activate(self.ftp,self.release,self.new,self.oldraw,self.initial)
        self.assertEqual(self.ftp.files[m.ROOT+'/'+m.HELPER],self.new)
        receipt=json.loads(self.ftp.files[m.ROOT+'/'+m.MANIFEST])
        self.assertEqual(receipt['release_id'],'new-release')
        backups=[n for n in self.ftp.files if 'n7-persona-backup' in n]
        self.assertEqual(len(backups),2)
        self.assertFalse(self.ftp.dirs)
    def test_failure_rolls_back_both_files(self):
        def fails(release):raise RuntimeError('simulated post-restart failure')
        m.validate_postdeploy=fails
        with self.assertRaisesRegex(RuntimeError,'simulated'):
            m.activate(self.ftp,self.release,self.new,self.oldraw,self.initial)
        self.assertEqual(self.ftp.files[m.ROOT+'/'+m.HELPER],self.old)
        self.assertEqual(self.ftp.files[m.ROOT+'/'+m.MANIFEST],self.oldraw)
        self.assertFalse(self.ftp.dirs)
    def test_drift_aborts_without_mutation(self):
        m.OLD_HELPER=hashlib.sha256(b'another-value').hexdigest()
        m.validate_postdeploy=lambda release:None
        with self.assertRaisesRegex(RuntimeError,'CONCURRENT_CHANGE'):
            m.activate(self.ftp,self.release,self.new,self.oldraw,self.initial)
        self.assertEqual(self.ftp.files[m.ROOT+'/'+m.HELPER],self.old)
        self.assertEqual(self.ftp.files[m.ROOT+'/'+m.MANIFEST],self.oldraw)
        self.assertFalse(self.ftp.dirs)

if __name__=='__main__':unittest.main()
