import json,os,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from research_execution_policy import resolve
from research_preflight import validate_question,prepare
from research_stage import execute
from publish_research_outputs import publish

class SafetyTests(unittest.TestCase):
    def test_policy_fails_closed(self):
        self.assertFalse(resolve('refs/heads/experiment/test')['production_writes_allowed'])
        with self.assertRaises(ValueError):resolve('refs/heads/experiment/test','production')
        with self.assertRaises(ValueError):resolve('refs/heads/main','production','a'*40,'b'*40)
    def test_instruction_is_not_name(self):
        with self.assertRaises(ValueError):validate_question({'target':'Investigate a historical person and establish identity','purpose':'test'})
        validate_question({'target':'Πέτρος Λάντζας','purpose':'Βιογραφία'})
    def test_real_exit_receipt(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(execute(d,'greek','discovery',['python','-c','raise SystemExit(7)']),7)
            self.assertEqual(json.loads((Path(d)/'greek/discovery.json').read_text())['status'],'FAILED')
    def test_missing_models_block_before_source_calls(self):
        with tempfile.TemporaryDirectory() as d,patch.dict(os.environ,{'GITHUB_REF':'refs/heads/main','PCT_TARGET':'Πέτρος Λάντζας','PCT_PURPOSE':'Βιογραφία','PCT_LLM_BASE_URL':'','PCT_LLM_API_KEY':''},clear=False):
            old=os.getcwd();os.chdir(d)
            try:
                with self.assertRaisesRegex(ValueError,'BLOCKED_CONFIGURATION'):prepare(True)
                self.assertEqual(json.loads(Path('execution_receipts/prepare/semantic_configuration.json').read_text())['status'],'BLOCKED')
            finally:os.chdir(old)
    def test_source_collection_continues_with_model_blocker_visible(self):
        with tempfile.TemporaryDirectory() as d,patch.dict(os.environ,{'GITHUB_REF':'refs/heads/main','PCT_TARGET':'Πέτρος Λάντζας','PCT_PURPOSE':'Βιογραφία','PCT_LLM_BASE_URL':'','PCT_LLM_API_KEY':'','GITHUB_OUTPUT':''},clear=False):
            old=os.getcwd();os.chdir(d)
            try:
                result=prepare(False)
                self.assertEqual(result['target'],'Πέτρος Λάντζας')
                self.assertEqual(json.loads(Path('execution_receipts/prepare/input.json').read_text())['status'],'SUCCEEDED')
                self.assertEqual(json.loads(Path('execution_receipts/prepare/semantic_configuration.json').read_text())['status'],'BLOCKED')
            finally:os.chdir(old)
    def test_experiment_event_never_calls_network(self):
        from orchestrator.jarvis_event_bus import _publish_remote
        with patch.dict(os.environ,{'GITHUB_ACTIONS':'true','GITHUB_REF':'refs/heads/experiment/test','PCT_COMMAND_CENTER_URL':'https://example.test'}),patch('orchestrator.jarvis_event_bus.urlopen') as request:
            _publish_remote({});request.assert_not_called()
    def test_overlapping_runs_preserve_all_history_and_newest_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary:
            def run(where,*args):return subprocess.check_output(['git',*args],cwd=where,stderr=subprocess.DEVNULL)
            root=Path(temporary);remote=root/'remote';first=root/'first';second=root/'second'
            run(root,'init','--bare',str(remote));run(root,'clone',str(remote),str(first))
            run(first,'config','user.name','Test');run(first,'config','user.email','test@example.test');run(first,'checkout','-b','main')
            folder=first/'command-center/live';folder.mkdir(parents=True)
            def snapshot(repo,number):
                f=repo/'command-center/live'
                (f/'latest.json').write_text(json.dumps({'run_id':str(number)}))
                (f/'index.json').write_text(json.dumps({'schema':'nabou-research-history-v1','runs':[{'run_id':str(number),'generated_utc':str(number)}]}))
            snapshot(first,100);run(first,'add','.');run(first,'commit','-m','initial');run(first,'push','origin','main')
            run(root,'clone','-b','main',str(remote),str(second));run(second,'config','user.name','Test');run(second,'config','user.email','test@example.test')
            snapshot(first,200);run(first,'add','.');run(first,'commit','-m','older output')
            snapshot(second,300);run(second,'add','.');run(second,'commit','-m','newer output')
            previous=os.getcwd();os.chdir(second)
            try:
                with patch.dict(os.environ,{'GITHUB_REF':'refs/heads/main','PCT_PERSISTENCE_MODE':'auto','PCT_SOURCE_SHA':''}):publish()
            finally:os.chdir(previous)
            previous=os.getcwd();os.chdir(first)
            try:
                with patch.dict(os.environ,{'GITHUB_REF':'refs/heads/main','PCT_PERSISTENCE_MODE':'auto','PCT_SOURCE_SHA':''}):
                    receipt=publish()
                    latest=json.loads(run(first,'show',receipt['commit']+':command-center/live/latest.json'))
                    history=json.loads(run(first,'show',receipt['commit']+':command-center/live/index.json'))
                    self.assertEqual(latest['run_id'],'300')
                    self.assertEqual({r['run_id'] for r in history['runs']},{'100','200','300'})
                    self.assertEqual(receipt['retained_newer_shared_outputs'],1)
            finally:os.chdir(previous)

    def test_output_writer_preserves_concurrent_main_and_rejects_code(self):
        with tempfile.TemporaryDirectory() as d:
            def run(where,*args):return subprocess.check_output(['git',*args],cwd=where,stderr=subprocess.DEVNULL)
            remote=Path(d)/'remote';a=Path(d)/'a';b=Path(d)/'b'
            run(d,'init','--bare',str(remote));run(d,'clone',str(remote),str(a))
            for repo in [a]:
                run(repo,'config','user.name','Test');run(repo,'config','user.email','test@example.test')
            run(a,'checkout','-b','main');(a/'engine.py').write_text('original')
            run(a,'add','.');run(a,'commit','-m','initial');run(a,'push','origin','main')
            run(d,'clone','-b','main',str(remote),str(b));run(b,'config','user.name','Test');run(b,'config','user.email','test@example.test')
            (a/'evidence').mkdir();(a/'evidence/a.json').write_text('A');run(a,'add','.');run(a,'commit','-m','output a')
            (b/'evidence').mkdir();(b/'evidence/b.json').write_text('B');run(b,'add','.');run(b,'commit','-m','output b');run(b,'push','origin','main')
            old=os.getcwd();os.chdir(a)
            try:
                with patch.dict(os.environ,{'GITHUB_REF':'refs/heads/main','PCT_PERSISTENCE_MODE':'auto','PCT_SOURCE_SHA':''}):
                    receipt=publish()
                    self.assertEqual(run(a,'show',receipt['commit']+':evidence/b.json'),b'B')
                    self.assertEqual(run(a,'show',receipt['commit']+':engine.py'),b'original')
                    (a/'engine.py').write_text('unsafe');run(a,'add','.');run(a,'commit','-m','code')
                    with self.assertRaisesRegex(ValueError,'NON_OUTPUT'):publish()
                with patch.dict(os.environ,{'GITHUB_REF':'refs/heads/experiment/test'}):
                    with self.assertRaisesRegex(ValueError,'EXPERIMENT'):publish()
            finally:os.chdir(old)

if __name__=='__main__':unittest.main()
