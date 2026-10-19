import unittest,json,tempfile,subprocess,sys
from pathlib import Path
from jarvis_dispatch import validate, fingerprint,build_audit,duplicate_submission


class JarvisDispatchTests(unittest.TestCase):
    def test_new_submission_can_repeat_question_but_replay_is_blocked(self):
        payload={'agent_selection':{},'selected_agents':[],'workflow_selected_agents':'',
                 'target':'Same historical question','date_range':'','purpose':'research'}
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            first=build_audit(Path('request.json'),payload,'1','ui-first')
            (root/'1.json').write_text(json.dumps(first))
            second=build_audit(Path('request.json'),payload,'2','ui-second')
            self.assertEqual(first['request_fingerprint'],second['request_fingerprint'])
            self.assertFalse(duplicate_submission(second,root))
            self.assertTrue(duplicate_submission(first,root))
            legacy=build_audit(Path('request.json'),payload,'3')
            self.assertTrue(duplicate_submission(legacy,root))
        with self.assertRaisesRegex(ValueError,'INVALID_REQUEST_ID'):
            build_audit(Path('request.json'),payload,'4','invalid request id')

    def test_explicit_file_submission_id_is_preserved_and_replay_blocked(self):
        repo=Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);request=root/'request.json';output=root/'outputs';audit=root/'audit.json'
            request.write_text(json.dumps({'request_id':'explicit-retest','target':'William Rook','purpose':'Find sources'}))
            args=[sys.executable,str(repo/'tools/orchestrator/jarvis_dispatch.py'),'--request',str(request),
                  '--run-id','123','--audit-root',str(root/'history'),'--github-output',str(output),'--write-audit',str(audit)]
            first=subprocess.run(args,cwd=repo,capture_output=True,text=True)
            self.assertEqual(first.returncode,0,first.stderr)
            self.assertEqual(json.loads(audit.read_text())['request_id'],'explicit-retest')
            self.assertIn('request_id=explicit-retest',output.read_text())
            (root/'history').mkdir();(root/'history/123.json').write_text(audit.read_text())
            second=subprocess.run(args,cwd=repo,capture_output=True,text=True)
            self.assertNotEqual(second.returncode,0)
            self.assertIn('DUPLICATE_DISPATCH_REQUEST',second.stderr)

    def setUp(self):
        self.policy={
            "mode":"controlled_dispatch",
            "dispatch":{
                "dispatch_enabled":True,
                "kill_switch":False,
                "max_parallel":11,
                "allowed_agents":[
                    "greek","travellers","spanish_simancas","venetian","french","british",
                    "dutch","german","italian_states","ottoman","north_african"
                ],
                "require_explicit_target":True,
                "require_explicit_selected_agents":False,
                "auto_select_agents":True,
                "auto_select_min_agents":3,
                "auto_select_max_agents":6,
                "manual_override_allowed":True,
            },
            "runtime_guard":{
                "version":1,"enabled":True,"allow_arbitrary_code":False,"allow_shell":False,"allow_subprocess":False,
                "allow_direct_secret_values":False,"require_planner_authority":True,"audit_required":True,
                "allowed_operations":["search"],"allowed_route_types":["registered_connector","repository_dispatch"],
                "max_sources_per_assignment":8,"max_queries_per_assignment":12,"max_search_budget":48,
                "forbidden_assignment_keys":["command","shell","script","code","python","subprocess","secret","credentials","token","api_key"]
            }
        }

    def test_manual_override_remains_possible(self):
        out=validate({"target":"Petros Lantzas","selected_agents":["venetian","french"]},self.policy)
        self.assertEqual(out["selected_agents"],["venetian","french"])
        self.assertEqual(out["agent_selection"]["authority"],"HUMAN_OVERRIDE")
        self.assertEqual(len(fingerprint(out)),64)

    def test_jarvis_selects_agents_when_not_supplied(self):
        out=validate({
            "target":"Milos",
            "aliases":["Μήλος","Melos"],
            "date_range":"1660-1680",
            "purpose":"Piracy and corsair activity in the Aegean",
        },self.policy)
        self.assertEqual(out["agent_selection"]["authority"],"JARVIS")
        self.assertIn("greek",out["selected_agents"])
        self.assertIn("venetian",out["selected_agents"])
        self.assertIn("ottoman",out["selected_agents"])
        self.assertIn("travellers",out["selected_agents"])
        self.assertGreaterEqual(len(out["selected_agents"]),3)

    def test_weak_context_widens_to_all_lanes(self):
        out=validate({"target":"Petros Lantzas","purpose":"Find archival sources"},self.policy)
        self.assertEqual(out["agent_selection"]["strategy"],"uncertain_context_broad_coverage")
        self.assertEqual(len(out["selected_agents"]),11)
        self.assertEqual(out["workflow_selected_agents"],"")

    def test_kill_switch_blocks(self):
        self.policy["dispatch"]["kill_switch"]=True
        with self.assertRaisesRegex(ValueError,"KILL_SWITCH_ACTIVE"):
            validate({"target":"x","purpose":"research"},self.policy)

    def test_unknown_manual_agent_blocks(self):
        with self.assertRaisesRegex(ValueError,"AGENT_NOT_ALLOWED"):
            validate({"target":"x","purpose":"research","selected_agents":["unknown_lane"]},self.policy)

    def test_insecure_runtime_policy_blocks_dispatch(self):
        self.policy["runtime_guard"]["allow_shell"]=True
        with self.assertRaisesRegex(ValueError,"RUNTIME_POLICY_REJECTED"):
            validate({"target":"x","purpose":"research"},self.policy)

    def test_manual_parallel_limit_blocks(self):
        self.policy["dispatch"]["max_parallel"]=3
        with self.assertRaisesRegex(ValueError,"TOO_MANY_SELECTED_AGENTS"):
            validate({
                "target":"x",
                "purpose":"research",
                "selected_agents":["travellers","venetian","french","italian_states"]
            },self.policy)


if __name__=="__main__":
    unittest.main()
