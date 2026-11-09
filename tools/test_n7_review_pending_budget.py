"""Regression tests: incomplete private quotation review is never reported as complete."""
import unittest
from semantic_research_answer import mark_unreviewed_claims_pending


class PendingQuotationReviewTests(unittest.TestCase):
    def test_budget_preserves_every_unreviewed_claim(self):
        answer={'claims':[{'claim_id':'a'},{'claim_id':'b'},{'claim_id':'c'}],
                'review':{'supported_claim_ids':['a'],
                          'flagged_claims':[{'claim_id':'b','decision':'UNCERTAIN','reason':'unresolved'}]},
                'coverage':{'claims_awaiting_review':[]},'status':'RESEARCH_COVERAGE_PENDING'}
        mark_unreviewed_claims_pending(answer)
        self.assertEqual(answer['coverage']['claims_awaiting_review'],['c'])
        self.assertEqual(answer['status'],'REVIEW_INCOMPLETE')
        self.assertIs(answer['historically_verified'],False)

    def test_idempotent_pending_and_no_promotion(self):
        answer={'claims':[{'claim_id':'a'},{'claim_id':'b'}],
                'review':{'supported_claim_ids':[],'flagged_claims':[]},
                'coverage':{'claims_awaiting_review':['a']}}
        mark_unreviewed_claims_pending(answer)
        mark_unreviewed_claims_pending(answer)
        self.assertEqual(answer['coverage']['claims_awaiting_review'],['a','b'])
        self.assertFalse(answer['verified'])
        self.assertFalse(answer['historically_verified'])

    def test_empty_claims_do_not_fabricate_pending(self):
        answer={'claims':[],'status':'RESEARCH_COVERAGE_PENDING'}
        self.assertIs(mark_unreviewed_claims_pending(answer),answer)
        self.assertNotIn('review',answer)


if __name__=='__main__':
    unittest.main()
