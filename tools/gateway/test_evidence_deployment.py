"""Deployment package/rollback tests on isolated files; no remote host or DB access."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

REPO=Path(__file__).resolve().parents[2]
SCRIPT=REPO/'tools/gateway/deploy_nabou_evidence_plesk.sh'

class DeploymentTests(unittest.TestCase):
    def exercise(self,fail=False,tamper=False):
        with tempfile.TemporaryDirectory(prefix='nabou-deploy-check-') as tmp:
            root=Path(tmp);repo=root/'repo';app=repo/'server/command-center-live';app.mkdir(parents=True)
            (app/'app.js').write_text('old backend sentinel');(app/'package.json').write_text('{}')
            (app/'.env').write_text('ISOLATED_FIXTURE=1\n')
            staging=root/'release';staging.mkdir();bins=root/'bin';bins.mkdir()
            script=SCRIPT.read_text();pin=script.split('COMMIT=')[1].splitlines()[0]
            table=script.split("<<'HASHES'\n")[1].split('\nHASHES')[0]
            for line in table.splitlines():
                _,name=line.split();p=staging/name;p.parent.mkdir(parents=True,exist_ok=True)
                p.write_bytes(subprocess.check_output(['git','show',pin+':'+name],cwd=REPO))
            if tamper:(staging/'server/command-center-live/pdf-evidence.js').write_text('tampered')
            (bins/'curl').write_text('''#!/usr/bin/env python3
import os,pathlib,shutil,sys
args=sys.argv[1:];target=args[args.index('--output')+1]
url=next(x for x in args if x.startswith('https://'))
name=url.split(os.environ['FIXTURE_PIN']+'/',1)[1]
shutil.copyfile(pathlib.Path(os.environ['FIXTURE_RELEASE'])/name,target)
''')
            (bins/'php').write_text('''#!/bin/sh
# Database side effects are simulated; real backup/restore is tested separately.
printf '%s\\n' '{"status":"PASS","fixture":"SIMULATED_DATABASE_ONLY"}'
''')
            (bins/'node').write_text('''#!/usr/bin/env python3
import os,sys
if os.getenv('FIXTURE_FAIL')=='1' and sys.argv[1]==os.environ['PCT_APP_ROOT']+'/self-test.js':sys.exit(9)
os.execv(os.environ['FIXTURE_NODE'],[os.environ['FIXTURE_NODE'],*sys.argv[1:]])
''')
            for p in bins.iterdir():p.chmod(0o755)
            env={**os.environ,'PATH':str(bins)+os.pathsep+os.environ['PATH'],
                 'PCT_APP_ROOT':str(app),'PCT_NODE_BIN':str(bins/'node'),'PCT_PHP_BIN':str(bins/'php'),
                 'FIXTURE_RELEASE':str(staging),'FIXTURE_PIN':pin,'FIXTURE_NODE':shutil.which('node'),'FIXTURE_FAIL':'1' if fail else '0'}
            result=subprocess.run(['sh',str(SCRIPT)],env=env,capture_output=True,text=True,timeout=45)
            self.assertEqual((app/'.env').read_text(),'ISOLATED_FIXTURE=1\n')
            self.assertFalse((app/'.nabou-evidence-deploy.lock').exists())
            if fail or tamper:
                self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
                self.assertEqual((app/'app.js').read_text(),'old backend sentinel')
                self.assertFalse((app/'pdf-evidence.js').exists())
            else:
                self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                self.assertEqual((app/'app.js').read_bytes(),(staging/'server/command-center-live/app.js').read_bytes())
                self.assertTrue((app/'tmp/restart.txt').exists())
                self.assertIn('PRODUCTION_HTTP_ACCEPTANCE_NOT_YET_VERIFIED',result.stdout)
            if not tamper:
                backups=list((app/'.deployment-backups').iterdir());self.assertEqual(len(backups),1)
                self.assertTrue((backups[0]/'backend.env').is_file())

    def test_install_complete_pinned_package(self):self.exercise()
    def test_failed_post_install_restores_old_backend_and_removes_new_modules(self):self.exercise(fail=True)
    def test_tampered_package_rejected_before_mutation(self):self.exercise(tamper=True)

if __name__=='__main__':unittest.main()
