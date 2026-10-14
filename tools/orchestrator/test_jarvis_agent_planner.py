import unittest

from jarvis_agent_planner import plan_agents


class AgentPlannerTests(unittest.TestCase):
    def policy(self):
        return {
            "dispatch":{
                "allowed_agents":[
                    "greek","travellers","spanish_simancas","venetian","french","british",
                    "dutch","german","italian_states","ottoman","north_african"
                ],
                "auto_select_min_agents":3,
                "auto_select_max_agents":6,
            }
        }

    def test_aegean_focus_prioritizes_relevant_lanes(self):
        plan=plan_agents({
            "target":"Milos",
            "aliases":["Μήλος","Melos"],
            "date_range":"1660-1680",
            "purpose":"Piracy and corsair activity in the Aegean",
        },self.policy())
        self.assertEqual(plan["authority"],"JARVIS")
        self.assertEqual(plan["strategy"],"context_ranked")
        self.assertEqual(plan["selected_agents"][:3],["greek","venetian","ottoman"])

    def test_caribbean_focus_is_cross_archive(self):
        plan=plan_agents({
            "target":"Henry Morgan",
            "date_range":"1660-1688",
            "purpose":"Biographical research on a Caribbean privateer",
        },self.policy())
        chosen=set(plan["selected_agents"])
        self.assertGreaterEqual(len(chosen),5)
        self.assertTrue({"british","spanish_simancas","french","dutch"}.issubset(chosen))

    def test_unknown_context_expands_to_all_agents(self):
        plan=plan_agents({
            "target":"Petros Lantzas",
            "purpose":"Find archival sources",
        },self.policy())
        self.assertEqual(plan["strategy"],"uncertain_context_broad_coverage")
        self.assertEqual(len(plan["selected_agents"]),11)
        self.assertEqual(plan["confidence"],"LOW")

    def test_explicit_comprehensive_request_expands_to_all_agents(self):
        plan=plan_agents({
            "target":"Petros Lantzas",
            "purpose":"Comprehensive research across all archives and all sources",
        },self.policy())
        self.assertEqual(plan["strategy"],"explicit_broad_coverage")
        self.assertEqual(len(plan["selected_agents"]),10)
        self.assertEqual(plan["confidence"],"HIGH")


if __name__=="__main__":
    unittest.main()
