import hashlib,json,tempfile,unittest,subprocess
from pathlib import Path
from audit_research_system import audit_run

class SystemDiagnosis(unittest.TestCase):
    def test_failed_workflow_with_missing_git_does_not_prove_search_failed(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=audit_run(Path(tmp),'123',{'public_state':{'conclusion':'failure'}})
            self.assertEqual(r['workflow_execution']['conclusion'],'failure')
            self.assertEqual(r['git_persistence']['status'],'NOT_OBSERVED_NOT_PROOF_OF_NONEXECUTION')
            self.assertEqual(r['semantic_analysis']['status'],'NOT_OBSERVED')
            self.assertFalse(r['request_integrity']['all_eleven_manifests_present'])

    def test_persistence_integrity_and_search_access_are_independent(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Path(tmp);lane=repo/'evidence/runs/123/greek';lane.mkdir(parents=True)
            content=b'actual evidence';f=lane/'text.txt';f.write_bytes(content)
            (lane/'index.json').write_text(json.dumps({'objects':[{'path':'runs/123/greek/text.txt','sha256':hashlib.sha256(content).hexdigest()}]}))
            (lane/'lane_discovery').mkdir();(lane/'lane_discovery/greek.json').write_text(json.dumps({'attempts':[{'repository':'Search','status':'REMOTE_ACCESS_BLOCKED','queries':[{'detail':json.dumps({'schema':'pct-web-search-coverage-v1','providers':[{'provider':'exa','status':'FAILED','code':'HTTP_402'}]})}]}]}))
            r=audit_run(repo,'123')
            self.assertEqual(r['git_persistence']['checked_files'],1)
            self.assertEqual(r['git_persistence']['issues'],[])
            self.assertEqual(r['discovery']['provider_error_codes'],{'HTTP_402':1})
            f.write_bytes(b'changed')
            self.assertEqual(audit_run(repo,'123')['git_persistence']['status'],'PERSISTED_OBJECT_INTEGRITY_FAILURE')

    def test_import_intent_is_not_database_confirmation_and_path_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Path(tmp);lane=repo/'evidence/runs/123/greek';lane.mkdir(parents=True)
            (lane/'index.json').write_text(json.dumps({'objects':[{'path':'../../outside','sha256':'x'}]}))
            (lane.parent/'MARIADB_STORAGE_INTENT.json').write_text(json.dumps({'status':'QUEUED_HOST_LOCAL_IMPORT'}))
            r=audit_run(repo,'123')
            self.assertEqual(r['database_persistence']['confirmation'],'NOT_VERIFIED_WITH_HOST_LOCAL_IMPORT_RECEIPT')
            self.assertEqual(r['git_persistence']['issues'][0]['status'],'UNSAFE_INDEX_PATH')
            with self.assertRaises(ValueError):audit_run(repo,'../123')

class StorageReproduction(unittest.TestCase):
    def test_shallow_rebase_conflict_has_full_history_control(self):
        from reproduce_research_storage_conflict import reproduce
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            def git(*args):return subprocess.check_output(['git','-C',str(root),*args],stderr=subprocess.DEVNULL,text=True).strip()
            def commit(file,text):
                p=root/file;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
                git('add',file);git('commit','-m',file)
            git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid')
            commit('data/naboux_memory.json','original memory')
            git('checkout','-b','experiment');commit('README.md','one');commit('README.md','two')
            git('checkout','main');commit('data/naboux_memory.json','main updated memory')
            result=reproduce(root,'main','experiment')
            self.assertTrue(result['outcomes'][0]['memory_conflict_reproduced'])
            self.assertNotEqual(result['outcomes'][0]['exit_code'],0)
            self.assertEqual(result['outcomes'][1]['exit_code'],0)
            self.assertFalse(result['push_performed'])
            self.assertEqual(git('show','main:data/naboux_memory.json'),'main updated memory')

if __name__=='__main__':unittest.main()
