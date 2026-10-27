import json
import tempfile
import unittest
from pathlib import Path
from tools.agent_skills.registry import load, save, propose, evaluate, query_variants

CASES = [
    {"input": "Greek name", "expected_aliases": ["Πέτρος Λάντζας"]},
    {"input": "Spanish record", "expected_aliases": ["Pedro Lanza"]},
    {"input": "Italian record", "expected_aliases": ["Pietro Lanza"],
     "forbidden_aliases": ["Completely unrelated person"]}
]

class SkillTests(unittest.TestCase):
    def test_promotion_and_persistence(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "registry.json"
            data = load(p)
            propose(data, "lantzas-aliases", "spanish_simancas",
                    ["Πέτρος Λάντζας", "Pedro Lanza", "Pietro Lanza"], "Control fixture only")
            with self.assertRaises(ValueError):
                query_variants(data, "lantzas-aliases")
            result = evaluate(data, "lantzas-aliases", CASES)
            self.assertTrue(result["passed"])
            self.assertEqual(result["scope"], "query-expansion-only")
            save(p, data)
            self.assertIn("Pedro Lanza", query_variants(load(p), "lantzas-aliases"))
            self.assertEqual(len(load(p)["events"]), 2)

    def test_rejection_is_permanent(self):
        data = load("/path/that/does/not/exist/registry.json")
        propose(data, "bad", "spanish_simancas", ["Unrelated"], "test")
        self.assertFalse(evaluate(data, "bad", CASES)["passed"])
        with self.assertRaises(ValueError):
            query_variants(data, "bad")
        with self.assertRaises(ValueError):
            evaluate(data, "bad", CASES)

    def test_duplicate_and_bad_inputs(self):
        data = {"version": 1, "skills": {}, "events": []}
        with self.assertRaises(ValueError):
            propose(data, "../escape", "spanish_simancas", ["Pedro Lanza"], "bad")
        with self.assertRaises(ValueError):
            propose(data, "badlane", "invented", ["Pedro Lanza"], "bad")
        propose(data, "safe", "greek", ["A", "a", "B"], "test")
        self.assertEqual(len(data["skills"]["safe"]["aliases"]), 2)
        with self.assertRaises(ValueError):
            propose(data, "safe", "greek", ["A"], "duplicate")

if __name__ == "__main__":
    unittest.main()
