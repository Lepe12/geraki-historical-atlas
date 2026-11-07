"""Offline N7 mission contract tests: no live connectors or model needed."""
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from n7_mission import (PREFERRED, MAX_ATTEMPTS, create_plan, initialize, load_state,
                        mission_dir, run, summarize)


def policy(kill=False):
    return {"dispatch": {"dispatch_enabled": True, "kill_switch": kill},
            "runtime_guard": {"enabled": True}}


def planner(target, purpose, date_range, aliases, kind):
    assert kind == "place"
    agents = []
    for aid in PREFERRED:
        agents.append({"agent_id": aid, "assignment_id": aid + ":wave1",
                       "assigned_queries": ["Naxos pirates 1670"],
                       "assigned_sources": [{"route_id": "repo:Test", "route_type": "repository_dispatch",
                                             "repository": "Test", "connector_id": None}],
                       "query_budget": {"total": 1, "max_total": 20}})
    return {"routing_authority": "JARVIS_PLANNER", "agents": agents,
            "verified_promotion_allowed": False, "purpose": purpose, "target": target}


def result(agent, plan, *, run_id, event_root, history_path):
    return {"agent_id": agent["agent_id"], "verified_promotion_allowed": False,
            "search_runs": [{"connector_id": "repo:Test", "status": "EXECUTED",
                             "records": [{"title": "Candidate record", "url": "https://example.org/archive"}]}]}


class FakeGuard(types.ModuleType):
    def __init__(self):
        super().__init__("jarvis_runtime_guard")
        self.load_policy = lambda: policy()
        self.validate_runtime_policy = lambda p: (_ for _ in ()).throw(RuntimeError("UNSAFE")) if p["runtime_guard"].get("enabled") is False else p
        self.validate_specialist_assignment = self.validate_agent

    @staticmethod
    def validate_agent(plan, agent, config):
        if plan.get("routing_authority") != "JARVIS_PLANNER":
            raise RuntimeError("UNTRUSTED_PLANNER")
        if len(agent.get("assigned_sources", [])) < 1:
            raise RuntimeError("NO_SOURCES")
        return {"status": "PERMITTED"}


class N7MissionTests(unittest.TestCase):
    def setUp(self):
        self.guard_patch = patch.dict(sys.modules, {"jarvis_runtime_guard": FakeGuard()})
        self.guard_patch.start()
        self.addCleanup(self.guard_patch.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def init(self):
        return initialize(self.root, "naxos-1670", "Naxos", "piracy in 1600-1700", "1600-1700", planner=planner, policy=policy())

    def test_plan_guards_and_roles(self):
        p = create_plan("Naxos", "pirate base", planner=planner, policy=policy())
        self.assertEqual([x["agent_id"] for x in p["agents"]], list(PREFERRED))
        self.assertFalse(p["verified_promotion_allowed"])
        with self.assertRaisesRegex(RuntimeError, "JARVIS_DISPATCH_DISABLED"):
            create_plan("Naxos", "piracy", planner=planner, policy=policy(kill=True))
        with self.assertRaisesRegex(ValueError, "TARGET_AND_PURPOSE_REQUIRED"):
            create_plan("", "piracy", planner=planner, policy=policy())
        with self.assertRaisesRegex(RuntimeError, "REQUIRED_SPECIALIST_ROLES_UNAVAILABLE"):
            create_plan("Naxos", "piracy", planner=lambda *args: {**planner(*args), "agents": []}, policy=policy())

    def test_resume_and_private_checkpoint(self):
        self.init()
        first = run(self.root, "naxos-1670", worker=result, max_steps=2)
        self.assertEqual(first["status"], "IN_PROGRESS")
        self.assertFalse(first["historically_verified"])
        self.assertEqual(sum(x["attempts"] for x in first["agent_states"].values()), 2)
        second = run(self.root, "naxos-1670", worker=result)
        self.assertEqual(second["status"], "DISCOVERY_FINISHED")
        self.assertEqual(second["discovered_record_count"], 4)
        self.assertTrue(second["adversarial_search_completed"])
        third = run(self.root, "naxos-1670", worker=lambda *a, **k: self.fail("worker must not rerun"))
        self.assertEqual(third["agent_states"], second["agent_states"])
        self.assertTrue((self.root / "naxos-1670" / "report.json").exists())
        self.assertTrue((self.root / "naxos-1670" / "results" / "contradiction.json").exists())

    def test_failure_retry_cap_and_untrusted_worker_result(self):
        self.init()
        def bad_worker(*args, **kwargs):
            raise TimeoutError("temporary offline failure")
        first = run(self.root, "naxos-1670", worker=bad_worker, max_steps=1)
        self.assertEqual(first["status"], "INCOMPLETE")
        second = run(self.root, "naxos-1670", worker=bad_worker, max_steps=1)
        self.assertEqual(second["agent_states"][PREFERRED[0]]["attempts"], MAX_ATTEMPTS)
        third = run(self.root, "naxos-1670", worker=result)
        self.assertEqual(third["agent_states"][PREFERRED[0]]["status"], "FAILED")
        self.assertFalse(third["historically_verified"])
        self.assertEqual(third["status"], "INCOMPLETE")
        with self.assertRaises(ValueError):
            mission_dir(self.root, "../escape")
        with self.assertRaises(FileExistsError):
            self.init()

    def test_verified_escalation_is_rejected(self):
        self.init()
        def unsafe(agent, *args, **kwargs):
            return {"agent_id": agent["agent_id"], "verified_promotion_allowed": True, "search_runs": []}
        report = run(self.root, "naxos-1670", worker=unsafe, max_steps=1)
        self.assertEqual(report["status"], "INCOMPLETE")
        self.assertIn("UNTRUSTED_WORKER_RESULT", report["agent_states"][PREFERRED[0]]["last_error"])
        checkpoint = self.root / "naxos-1670" / "mission.json"
        data = json.loads(checkpoint.read_text())
        data["historically_verified"] = True
        checkpoint.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "UNSAFE_HISTORICAL_VERIFICATION_FLAG"):
            load_state(self.root, "naxos-1670")

    def test_all_failed_search_routes_do_not_count_as_completed(self):
        self.init()
        def failed_search(agent, *args, **kwargs):
            return {"agent_id": agent["agent_id"], "verified_promotion_allowed": False,
                    "search_runs": [{"status": "FAILED", "records": []}]}
        report = run(self.root, "naxos-1670", worker=failed_search, max_steps=1)
        self.assertEqual(report["status"], "INCOMPLETE")
        self.assertIn("NO_SUCCESSFUL_SEARCH_ROUTES", report["agent_states"][PREFERRED[0]]["last_error"])

    def test_stop_switch_on_resume(self):
        self.init()
        with patch("jarvis_runtime_guard.load_policy", return_value=policy(kill=True)):
            with self.assertRaisesRegex(RuntimeError, "JARVIS_DISPATCH_DISABLED"):
                run(self.root, "naxos-1670", worker=result)
        self.assertEqual(summarize(load_state(self.root, "naxos-1670"))["status"], "IN_PROGRESS")


if __name__ == "__main__":
    unittest.main()
