import json
import tempfile
import subprocess
import sys
import unittest
from pathlib import Path
from orchestrator.build_research_history import build_history

class HistoryTests(unittest.TestCase):
    def test_index_uses_only_valid_durable_runs_and_preserves_metadata(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'runs').mkdir()
            for run in ['9','10','11']:
                data={'schema':'pct-command-center-live-v1','run_id':run,'mission':{'target':'Μήλος','status':'COMPLETED'},'safety':{'automatic_verified':run=='11'}}
                (root/'runs'/f'{run}.json').write_text(json.dumps(data))
            result=build_history(root)
            self.assertEqual([r['run_id'] for r in result['runs']],['10','9'])
            self.assertEqual(result['runs'][0]['target'],'Μήλος')
            self.assertEqual(result['runs'][0]['generated_utc'],'')
            self.assertEqual(build_history(root),result)

    def test_snapshot_cli_refreshes_catalogue(self):
        script=Path(__file__).parent/'orchestrator'/'build_command_center_snapshot.py'
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            (root/'evidence/runs/123').mkdir(parents=True)
            result=subprocess.run([sys.executable,'-B',str(script),'--repo',str(root),
                            '--run-id','123','--output','command-center/live/runs/123.json',
                            '--latest','command-center/live/latest.json'],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            data=json.loads((root/'command-center/live/index.json').read_text())
            self.assertEqual([r['run_id'] for r in data['runs']],['123'])

    def test_corrupt_snapshot_is_reported_not_silently_indexed(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'runs').mkdir();(root/'runs'/'1.json').write_text('{')
            with self.assertRaises(json.JSONDecodeError):build_history(root)

if __name__=='__main__':unittest.main()
