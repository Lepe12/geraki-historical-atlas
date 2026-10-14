import unittest
from jarvis_dispatch import validate, fingerprint

class JarvisDispatchTests(unittest.TestCase):
    def setUp(self):
        self.policy={
            "mode":"controlled_dispatch",
            "dispatch":{"dispatch_enabled":True,"kill_switch":False,"max_parallel":3,"allowed_agents":["travellers","venetian","french","italian_states"],"require_explicit_target":True,"require_explicit_selected_agents":True},
            "runtime_guard":{
                "version":1,"enabled":True,"allow_arbitrary_code":False,"allow_shell":False,"allow_subprocess":False,
                "allow_direct_secret_values":False,"require_planner_authority":True,"audit_required":True,
                "allowed_operations":["search"],"allowed_route_types":["registered_connector","repository_dispatch"],
                "max_sources_per_assignment":8,"max_queries_per_assignment":12,"max_search_budget":48,
                "forbidden_assignment_keys":["command","shell","script","code","python","subprocess","secret","credentials","token","api_key"]
            }
        }
    def test_valid_bounded_dispatch(self):
        out=validate({"target":"Petros Lantzas","selected_agents":["venetian","french"]},self.policy)
        self.assertEqual(out["selected_agents"],["venetian","french"])
        self.assertEqual(len(fingerprint(out)),64)
    def test_kill_switch_blocks(self):
        self.policy["dispatch"]["kill_switch"]=True
        with self.assertRaisesRegex(ValueError,"KILL_SWITCH_ACTIVE"):
            validate({"target":"x","selected_agents":["travellers"]},self.policy)
    def test_unknown_agent_blocks(self):
        with self.assertRaisesRegex(ValueError,"AGENT_NOT_ALLOWED"):
            validate({"target":"x","selected_agents":["ottoman"]},self.policy)
    def test_insecure_runtime_policy_blocks_dispatch(self):
        self.policy["runtime_guard"]["allow_shell"]=True
        with self.assertRaisesRegex(ValueError,"RUNTIME_POLICY_REJECTED"):
            validate({"target":"x","selected_agents":["travellers"]},self.policy)

    def test_parallel_limit_blocks(self):
        with self.assertRaisesRegex(ValueError,"TOO_MANY_SELECTED_AGENTS"):
            validate({"target":"x","selected_agents":["travellers","venetian","french","italian_states"]},self.policy)

if __name__=="__main__":
    unittest.main()
