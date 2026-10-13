import unittest
from jarvis_dispatch import validate, fingerprint

class JarvisDispatchTests(unittest.TestCase):
    def setUp(self):
        self.policy={"mode":"controlled_dispatch","dispatch":{"dispatch_enabled":True,"kill_switch":False,"max_parallel":3,"allowed_agents":["travellers","venetian","french","italian_states"],"require_explicit_target":True,"require_explicit_selected_agents":True}}
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
    def test_parallel_limit_blocks(self):
        with self.assertRaisesRegex(ValueError,"TOO_MANY_SELECTED_AGENTS"):
            validate({"target":"x","selected_agents":["travellers","venetian","french","italian_states"]},self.policy)

if __name__=="__main__":
    unittest.main()
