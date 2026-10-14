import copy
import unittest

from jarvis_runtime_guard import validate_runtime_policy, validate_specialist_assignment


class RuntimeGuardTests(unittest.TestCase):
    def policy(self):
        return {
            "runtime_guard":{
                "version":1,
                "enabled":True,
                "allow_arbitrary_code":False,
                "allow_shell":False,
                "allow_subprocess":False,
                "allow_direct_secret_values":False,
                "require_planner_authority":True,
                "audit_required":True,
                "allowed_operations":["search"],
                "allowed_route_types":["registered_connector","repository_dispatch"],
                "max_sources_per_assignment":8,
                "max_queries_per_assignment":12,
                "max_search_budget":48,
                "forbidden_assignment_keys":["command","shell","script","code","python","subprocess","secret","credentials","token","api_key"],
            }
        }

    def plan(self):
        return {"routing_authority":"JARVIS_PLANNER"}

    def agent(self):
        return {
            "agent_id":"timeline",
            "assignment_id":"timeline:wave1",
            "assignment_wave":1,
            "assigned_sources":[
                {"route_id":"repo:Gallica/BnF","route_type":"repository_dispatch","repository":"Gallica/BnF","connector_id":None}
            ],
            "assigned_queries":["Petros Lantzas 1577 1583"],
            "query_budget":{"total":1,"max_total":20,"queries_per_source":1},
        }

    def test_safe_assignment_gets_search_only_permit(self):
        permit=validate_specialist_assignment(self.plan(),self.agent(),self.policy())
        self.assertEqual(permit["status"],"PERMITTED")
        self.assertEqual(permit["operation"],"search")
        self.assertFalse(permit["arbitrary_code_allowed"])
        self.assertFalse(permit["shell_allowed"])
        self.assertFalse(permit["subprocess_allowed"])

    def test_command_key_is_blocked(self):
        agent=self.agent()
        agent["command"]="python exploit.py"
        with self.assertRaisesRegex(RuntimeError,"FORBIDDEN_ASSIGNMENT_KEY"):
            validate_specialist_assignment(self.plan(),agent,self.policy())

    def test_unknown_route_type_is_blocked(self):
        agent=self.agent()
        agent["assigned_sources"][0]["route_type"]="shell"
        with self.assertRaisesRegex(RuntimeError,"RUNTIME_ROUTE_NOT_ALLOWED"):
            validate_specialist_assignment(self.plan(),agent,self.policy())

    def test_budget_is_fail_closed(self):
        agent=self.agent()
        agent["assigned_queries"]=[f"query {i}" for i in range(12)]
        agent["assigned_sources"]=[
            {"route_id":f"repo:r{i}","route_type":"repository_dispatch","repository":f"r{i}","connector_id":None}
            for i in range(5)
        ]
        agent["query_budget"]={"total":60,"max_total":60,"queries_per_source":12}
        with self.assertRaisesRegex(RuntimeError,"ASSIGNMENT_SEARCH_BUDGET_EXCEEDED"):
            validate_specialist_assignment(self.plan(),agent,self.policy())

    def test_weakened_policy_is_rejected(self):
        policy=copy.deepcopy(self.policy())
        policy["runtime_guard"]["allow_shell"]=True
        with self.assertRaisesRegex(RuntimeError,"UNSAFE_RUNTIME_POLICY"):
            validate_runtime_policy(policy)


if __name__=="__main__":
    unittest.main()
