import unittest
from tools.historical_attestations import Citation, Attestation, MatchCandidate, freeze_candidate_set, render_attestation_jsonl


class TestHistoricalAttestations(unittest.TestCase):
    def setUp(self):
        self.c = Citation("ASVe/test", "f. 2r", "Milo")

    def test_source_locator_and_quote_required(self):
        with self.assertRaises(ValueError):
            Citation("ASVe/test", "", "Milo")

    def test_no_evidence_no_attestation(self):
        with self.assertRaises(ValueError):
            Attestation("place:milos", "name", "Milo", ())

    def test_no_automatic_verification(self):
        a = Attestation("place:milos", "name", "Milo", (self.c,))
        self.assertEqual(a.status, "UNREVIEWED")
        self.assertFalse(a.to_record()["historically_verified"])
        self.assertIn('"historically_verified": false', render_attestation_jsonl([a]))

    def test_explicit_operator_review(self):
        a = Attestation("place:milos", "name", "Milo", (self.c,))
        accepted = a.review("OPERATOR_ACCEPTED", "historian")
        self.assertEqual(accepted.status, "OPERATOR_ACCEPTED")
        self.assertEqual(a.status, "UNREVIEWED")
        self.assertFalse(accepted.to_record()["historically_verified"])

    def test_invalid_dates(self):
        with self.assertRaises(ValueError):
            Attestation("place:milos", "name", "Milo", (self.c,), 1700, 1600)

    def test_candidate_sets_are_snapshots(self):
        candidate = MatchCandidate("Milo", "place:milos", .9, "toponym-matcher-v1")
        s1 = freeze_candidate_set([candidate], "run-1", {"threshold": .8})
        s2 = freeze_candidate_set([candidate], "run-2", {"threshold": .8})
        self.assertNotEqual(s1["candidates"][0]["id"], s2["candidates"][0]["id"])
        self.assertTrue(s1["frozen"])
        self.assertNotIn("VERIFIED", str(s1))

    def test_invalid_score(self):
        with self.assertRaises(ValueError):
            MatchCandidate("Milo", "place:milos", 1.1, "matcher")


if __name__ == "__main__":
    unittest.main()
