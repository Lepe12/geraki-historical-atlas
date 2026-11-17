#!/usr/bin/env python3
"""Synthetic, offline tests for the exact public-asset upgrade and rollback."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('n7_pr86',Path(__file__).with_name('n7-pr86-dialogue-deploy.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class FakeFTP:
    def __init__(self,files):
        self.files=dict(files);self.directories=set()
    def retrbinary(self,command,callback):
        name=command.split(' ',1)[1]
        if name not in self.files:raise RuntimeError('missing '+name)
        callback(self.files[name])
    def storbinary(self,command,stream):
        self.files[command.split(' ',1)[1]]=stream.read()
    def rename(self,a,b):
        if a not in self.files or b in self.files:raise RuntimeError('unsafe rename')
        self.files[b]=self.files.pop(a)
    def delete(self,name):del self.files[name]
    def mkd(self,name):
        if name in self.directories:raise RuntimeError('deploy lock exists')
        self.directories.add(name)
    def rmd(self,name):self.directories.remove(name)

class UpgradeTests(unittest.TestCase):
    def test_assembles_exact_app_and_index_from_real_versioner(self):
        old_router=b'// old router unique\n',new_router=b'// new router unique\n'
        old_stage=b'/* old stage unique */',new_stage=b'/* new stage unique */'
        old_app=b'BEGIN\n'+old_router+b'\nMIDDLE\n'+old_stage+b'\nEND'
        old_index=b'<html><head><meta charset="utf-8"><link href="/style.css"></head><body><script src="/app.js"></script></body></html>'
        css=b'abc.css'
        built=old_app.replace(old_router,new_router).replace(old_stage,new_stage)
        asset_spec=importlib.util.spec_from_file_location('n7_assets','tools/n7/asset_version.py')
        av=importlib.util.module_from_spec(asset_spec);asset_spec.loader.exec_module(av)
        target_index=av.version_html(old_index,built,css)
        contract={'files':{'public/app.js':m.sha(built),'public/index.html':m.sha(target_index)}}
        app,index=m.assemble(old_app,old_index,css,(old_router,new_router,old_stage,new_stage),contract)
        self.assertEqual((app,index),(built,target_index))
    def test_missing_or_ambiguous_previous_source_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError,'ANCHOR_MISMATCH'):
            m.assemble(b'OLD only',b'',b'',(b'no-match',b'new',b'old-stage',b'new-stage'),{'files':{}})
    def setUp(self):
        self.names=[*m.CHANGED,m.MANIFEST]
        self.old={name:('old:'+name).encode() for name in self.names}
        self.new={name:('new:'+name).encode() for name in self.names}
        self.ftp=FakeFTP({m.ROOT+'/'+n:b for n,b in self.old.items()})
        self.release={'previous_files':{name:m.sha(self.old[name]) for name in m.CHANGED}}
        self.save=(m.restart,m.verify_new)
        m.restart=lambda ftp,tag:None
    def tearDown(self):
        m.restart,m.verify_new=self.save
    def test_installs_only_approved_files_and_retains_verified_backups(self):
        m.verify_new=lambda ftp,release,targets:None
        m.install(self.ftp,self.release,self.new,self.old)
        for name in self.names:self.assertEqual(self.ftp.files[m.ROOT+'/'+name],self.new[name])
        self.assertEqual(len([x for x in self.ftp.files if 'n7-pr86-backup' in x]),4)
        self.assertFalse(self.ftp.directories)
    def test_verifier_failure_restores_every_original_file(self):
        def fail(*args):raise RuntimeError('test verifier failure')
        m.verify_new=fail
        with self.assertRaisesRegex(RuntimeError,'test verifier failure'):
            m.install(self.ftp,self.release,self.new,self.old)
        for name in self.names:self.assertEqual(self.ftp.files[m.ROOT+'/'+name],self.old[name])
        self.assertFalse(self.ftp.directories)

if __name__=='__main__':unittest.main()
