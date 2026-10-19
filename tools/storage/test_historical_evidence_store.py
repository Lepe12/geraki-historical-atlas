import unittest
from unittest.mock import Mock
from tools.historical_attestations import Attestation, Citation, MatchCandidate, freeze_candidate_set
from tools.storage.historical_evidence_store import store_attestation, store_candidate_set, review_attestation


class HistoricalEvidenceStoreTests(unittest.TestCase):
    def test_persist_attestation_and_exact_citation(self):
        cur = Mock()
        att = Attestation("place:milos", "has_name", "Milo",
                          (Citation("ASVe:x", "folio 3v", "Milo"),))
        self.assertEqual(store_attestation(cur, att), att.id)
        self.assertEqual(cur.execute.call_count, 2)
        self.assertIn("UNREVIEWED", cur.execute.call_args_list[0].args[1])
        self.assertIn("folio 3v", cur.execute.call_args_list[1].args[1])

    def test_store_immutable_candidate_set(self):
        cur = Mock()
        snapshot = freeze_candidate_set([MatchCandidate("Milo", "place:milos", .9, "name-v1")],
                                        "research-12", {"threshold": .8})
        checksum = store_candidate_set(cur, snapshot)
        self.assertEqual(len(checksum), 64)
        self.assertEqual(cur.execute.call_count, 2)

    def test_cannot_store_unfrozen_candidates(self):
        with self.assertRaises(ValueError):
            store_candidate_set(Mock(), {"schema": "nabou-candidate-set-v1", "frozen": False})

    def test_operator_review_requires_real_transition(self):
        cur = Mock()
        cur.rowcount = 1
        review_attestation(cur, "att_x", "historian", "OPERATOR_ACCEPTED")
        self.assertIn("status='UNREVIEWED'", cur.execute.call_args[0][0])
        cur.rowcount = 0
        with self.assertRaises(ValueError):
            review_attestation(cur, "att_x", "historian", "OPERATOR_ACCEPTED")

    def test_no_automatic_approval(self):
        with self.assertRaises(ValueError):
            review_attestation(Mock(), "att_x", "robot", "VERIFIED")


if __name__ == "__main__":
    unittest.main()
