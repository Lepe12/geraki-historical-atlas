"""Regression tests for person queries with operator instructions."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from research_focus import decompose, focused_queries, topical_match


class PersonIntentTests(unittest.TestCase):
    def test_person_role_place_and_command(self):
        focus = decompose("Βρες πληροφορίες για τον Ιωάννη Καψή βασιλιά της Μήλου")
        self.assertEqual(focus["kind"], "person")
        self.assertEqual(focus["entity"], "Ιωάννη Καψή")
        self.assertIn("Μήλου", focus["places"])
        self.assertEqual(focus["roles"], ["βασιλιά"])
        qs = focused_queries(focus)
        self.assertTrue(any("Ιωάννη Καψή" in q for q in qs))
        self.assertTrue(all("Βρες" not in q for q in qs))

    def test_bare_person_preserves_original(self):
        focus = decompose("Ιωάννης Καψής βασιλιάς της Μήλου")
        self.assertEqual(focus["entity"], "Ιωάννης Καψής")
        self.assertEqual(focus["kind"], "person")

    def test_source_without_name_not_promoted(self):
        focus = decompose("Βρες πληροφορίες για τον Ιωάννη Καψή βασιλιά της Μήλου")
        r = topical_match({"title": "Ιστορία της Μήλου"}, focus)
        self.assertNotEqual(r["category"], "TARGET_MATCH")


if __name__ == "__main__":
    unittest.main()
