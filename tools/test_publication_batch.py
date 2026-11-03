"""Actual git-remote integration: batching retains every file and write guard."""
import contextlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import publish_research_outputs as publisher


class BatchPublicationTests(unittest.TestCase):
    def run_git(self,*args,cwd=None):
        return subprocess.check_output(['git',*args],cwd=cwd,stderr=subprocess.PIPE).decode().strip()

    @contextlib.contextmanager
    def repository(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);remote=root/'remote.git';worker=root/'worker'
            self.run_git('init','--bare',str(remote))
            self.run_git('init','-b','main',str(worker))
            self.run_git('config','user.name','isolated-test',cwd=worker)
            self.run_git('config','user.email','test@example.invalid',cwd=worker)
            (worker/'README.md').write_text('base\n')
            self.run_git('add','.',cwd=worker);self.run_git('commit','-m','base',cwd=worker)
            self.run_git('remote','add','origin',str(remote),cwd=worker)
            self.run_git('push','origin','main',cwd=worker)
            previous=os.getcwd();os.chdir(worker)
            try:
                with patch.dict(os.environ,{'GITHUB_REF':'refs/heads/main','PCT_SOURCE_SHA':'','GITHUB_SHA':'','PCT_PERSISTENCE_MODE':'auto'}):
                    yield worker,remote
            finally:os.chdir(previous)

    def test_300_outputs_one_index_update_one_tree_readback_and_unrelated_writer_preserved(self):
        with self.repository() as (worker,remote):
            dest=worker/'evidence/runs/123';dest.mkdir(parents=True)
            names=['file-'+str(i)+'.json' for i in range(298)]+['tab\tname.txt','greek-νερό.txt']
            for name in names:(dest/name).write_text(name+'\n')
            self.run_git('add','evidence');self.run_git('commit','-m','outputs')
            # Another writer moves remote main after this worker's checkout.
            other=worker.parent/'other';self.run_git('clone','--branch','main',str(remote),str(other))
            self.run_git('config','user.name','other',cwd=other);self.run_git('config','user.email','other@example.invalid',cwd=other)
            (other/'unrelated.txt').write_text('must survive\n')
            self.run_git('add','.',cwd=other);self.run_git('commit','-m','concurrent writer',cwd=other);self.run_git('push','origin','main',cwd=other)
            original=publisher.git
            with patch.object(publisher,'git',wraps=original) as calls:
                receipt=publisher.publish()
            self.assertEqual(receipt['files'],300)
            self.assertEqual(sum(c.args[0]=='update-index' for c in calls.call_args_list),1)
            self.assertEqual(sum(c.args[0]=='ls-tree' for c in calls.call_args_list),1)
            for name in names:
                self.assertEqual(self.run_git('show',receipt['commit']+':evidence/runs/123/'+name),name.strip())
            self.assertEqual(self.run_git('show',receipt['commit']+':unrelated.txt'),'must survive')

    def test_code_change_is_rejected_before_push(self):
        with self.repository() as (worker,remote):
            (worker/'engine.py').write_text('unauthorized code delta\n')
            self.run_git('add','.');self.run_git('commit','-m','not output')
            before=self.run_git('--git-dir='+str(remote),'rev-parse','main')
            with self.assertRaisesRegex(ValueError,'NON_OUTPUT_CHANGE_FORBIDDEN'):
                publisher.publish()
            self.assertEqual(self.run_git('--git-dir='+str(remote),'rev-parse','main'),before)

    def test_symlink_is_rejected_before_push(self):
        with self.repository() as (worker,remote):
            dest=worker/'evidence';dest.mkdir();(dest/'link').symlink_to('../README.md')
            self.run_git('add','.');self.run_git('commit','-m','symlink')
            with self.assertRaisesRegex(ValueError,'REGULAR_OUTPUT_FILES_ONLY'):
                publisher.publish()

    def test_missing_readback_file_is_not_success(self):
        with self.repository() as (worker,remote):
            dest=worker/'evidence';dest.mkdir();(dest/'x').write_text('evidence')
            self.run_git('add','.');self.run_git('commit','-m','output')
            original=publisher.git
            def missing(*args,**kwargs):
                return b'' if args[0]=='ls-tree' else original(*args,**kwargs)
            with patch.object(publisher,'git',side_effect=missing):
                with self.assertRaisesRegex(ValueError,'PUBLICATION_READBACK_MISSING'):
                    publisher.publish()
            self.assertFalse((worker/'publication_receipt.json').exists())


if __name__=='__main__':unittest.main()
