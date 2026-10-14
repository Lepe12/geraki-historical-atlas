import unittest
from jarvis_dispatch import validate, fingerprint


class JarvisDispatchTests(unittest.TestCase):
    def setUp(self):
        self.policy={
            "mode":"controlled_dispatch",
            "dispatch":{
                "dispatch_enabled":True,
                "kill_switch":False,
                "max_parallel":10,
                "allowed_agents":[
                    "travellers","spanish_simancas","venetian","french","british",
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
        self.assertIn("venetian",out["selected_agents"])
        self.assertIn("ottoman",out["selected_agents"])
        self.assertIn("travellers",out["selected_agents"])
        self.assertGreaterEqual(len(out["selected_agents"]),3)

    def test_weak_context_widens_to_all_ten(self):
        out=validate({"target":"Petros Lantzas","purpose":"Find archival sources"},self.policy)
        self.assertEqual(out["agent_selection"]["strategy"],"uncertain_context_broad_coverage")
        self.assertEqual(len(out["selected_agents"]),10)
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
