"""Exercise real concurrent Git writers without network or credentials."""
import os,subprocess,tempfile,unittest
from pathlib import Path

HELPER=Path(__file__).resolve().parent/"push_with_retry.sh"

class PushRetryTests(unittest.TestCase):
    def git(self, repo, *args):
        return subprocess.check_output(["git","-C",str(repo),*args],stderr=subprocess.STDOUT,text=True).strip()

    def init_writer(self, remote, dest):
        subprocess.run(["git","clone",str(remote),str(dest)],check=True,capture_output=True)
        self.git(dest,"config","user.name","Test")
        self.git(dest,"config","user.email","test@example.invalid")

    def commit(self, repo, file, content):
        (repo/file).write_text(content)
        self.git(repo,"add",file)
        self.git(repo,"commit","-m",file)

    def test_remote_advances_between_pull_and_push(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);remote=root/"remote.git";a=root/"a";b=root/"b"
            subprocess.run(["git","init","--bare","--initial-branch=main",str(remote)],check=True,capture_output=True)
            self.init_writer(remote,a);self.commit(a,"initial","initial")
            self.git(a,"push","origin","HEAD:main")
            self.init_writer(remote,b);self.commit(b,"other-job","independent evidence")
            self.commit(a,"our-job","our evidence")
            # Introduce the competing update after the helper's first pull.
            hook=a/".git/hooks/pre-push"
            hook.write_text('#!/bin/sh\nif [ ! -f "$0.done" ]; then\n touch "$0.done"\n git -C "'+str(b)+'" push origin HEAD:main || exit 1\nfi\n')
            hook.chmod(0o755)
            result=subprocess.run(["bash",str(HELPER)],cwd=a,capture_output=True,text=True,env={**os.environ,"GIT_TERMINAL_PROMPT":"0"},timeout=30)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            self.assertEqual(self.git(remote,"show","main:other-job"),"independent evidence")
            self.assertEqual(self.git(remote,"show","main:our-job"),"our evidence")

    def test_real_conflict_stops_without_overwriting_remote(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);remote=root/"remote.git";a=root/"a";b=root/"b"
            subprocess.run(["git","init","--bare","--initial-branch=main",str(remote)],check=True,capture_output=True)
            self.init_writer(remote,a);self.commit(a,"shared","initial\n")
            self.git(a,"push","origin","HEAD:main")
            self.init_writer(remote,b);self.commit(a,"shared","ours\n")
            ours=self.git(a,"rev-parse","HEAD")
            self.commit(b,"shared","theirs\n");self.git(b,"push","origin","HEAD:main")
            result=subprocess.run(["bash",str(HELPER)],cwd=a,capture_output=True,text=True,timeout=30)
            self.assertNotEqual(result.returncode,0)
            self.assertEqual(self.git(remote,"show","main:shared"),"theirs")
            self.assertEqual(self.git(a,"rev-parse","HEAD"),ours)

if __name__=="__main__":unittest.main()
