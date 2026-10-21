import copy
import unittest

from research_priority import claim_assessment, describe, order, selection_report


def row(eid, doc='A', text=None, **features):
    return {'evidence_id': eid, 'text': text or ('In 1677 Mediterranean corsairs used the harbour as a refuge. ' * 4),
            'years_in_scope': [1677], 'date_basis': 'EXPLICIT_PARAGRAPH',
            'sampling_features': {'strong_region_match': True, 'event_and_use_match': True,
                'direct_use_vocabulary': True, 'in_scope_year_fraction': 1, **features},
            'occurrences': [{'source_text_sha256': doc}], 'source_bibliography': {}}


class ReadingPriorityTests(unittest.TestCase):
    def test_diversity_cannot_displace_second_direct_passage_with_context(self):
        rows = [row('direct1'), row('context', 'B', event_and_use_match=False,
                                    direct_use_vocabulary=False, in_scope_year_fraction=.2), row('direct2')]
        result = order(rows, lambda r: (rows.index(r),))
        self.assertEqual([r['evidence_id'] for r in result], ['direct1', 'direct2', 'context'])

    def test_metadata_title_matches_are_read_after_narrative(self):
        meta = row('meta', 'B', 'Title: Mediterranean corsairs and harbours\nAuthors: Someone\nKeywords: 1677')
        body = row('body')
        self.assertEqual(order([meta, body], lambda r: (r['evidence_id'],))[0]['evidence_id'], 'body')

    def test_author_year_bibliography_remains_visible_but_not_direct_evidence(self):
        refs = row('refs', text='Smith, A. 2013. Mediterranean piracy.\nJones, B. 1998. Harbours.\nBrown, C. 2001. Refuges.')
        self.assertEqual(describe(refs)['genre'], 'REFERENCE_OR_METADATA')
        self.assertEqual(len(order([refs], lambda r: (0,))), 1)

    def test_mixed_period_paragraph_does_not_outrank_coherent_event_context(self):
        mixed = row('mixed', in_scope_year_fraction=.2)
        coherent = row('coherent', 'B', event_and_use_match=False, direct_use_vocabulary=False)
        self.assertLess(describe(coherent)['tier'], describe(mixed)['tier'])

    def test_negative_evidence_and_hypotheses_are_retained(self):
        denial = row('denial', text='In 1677 Mediterranean corsairs did not use the harbour as a refuge. ' * 3)
        conjecture = row('conjecture', 'B', conjecture_context=True)
        before = copy.deepcopy([denial, conjecture])
        result = order([denial, conjecture], lambda r: (r['evidence_id'],))
        self.assertEqual({r['evidence_id'] for r in result}, {'denial', 'conjecture'})
        self.assertEqual([denial, conjecture], before)
        self.assertEqual(describe(denial)['tier'], describe(conjecture)['tier'])

    def test_primary_metadata_does_not_override_relevance_or_prove_truth(self):
        context = row('primary', in_scope_year_fraction=.1)
        context['source_bibliography']['source_type'] = 'PRIMARY_SOURCE'
        direct = row('secondary', 'B')
        self.assertEqual(order([context, direct], lambda r: (0,))[0]['evidence_id'], 'secondary')
        self.assertFalse(selection_report([context, direct], [direct])['verification_implied'])

    def test_supported_claim_can_be_reported_with_pending_corpus_but_never_verified(self):
        report = claim_assessment({'claims': [{'claim_id': 'c1'}],
            'review': {'supported_claim_ids': ['c1']}, 'coverage': {'deferred': [{'evidence_id': 'e9'}]}})
        claim = report['claims'][0]
        self.assertEqual(claim['status'], 'QUOTATION_SUPPORTED_HISTORY_PENDING')
        self.assertFalse(claim['historical_verification'])
        self.assertIn('SOURCE_GENEALOGY_NOT_DOCUMENTED', claim['missing_historical_gates'])
        self.assertTrue(report['corpus_coverage_is_not_claim_sufficiency'])

    def test_review_rejection_is_not_invented_as_historical_contradiction(self):
        report = claim_assessment({'claims': [{'claim_id': 'c1'}], 'review': {
            'flagged_claims': [{'claim_id': 'c1', 'decision': 'UNSUPPORTED', 'reason': 'wrong quotation'}]}})
        self.assertEqual(report['claims'][0]['status'], 'QUOTATION_UNSUPPORTED')

    def test_document_repetition_cannot_establish_independence(self):
        r = claim_assessment({'claims': [{'claim_id': 'c1', 'kind': 'hypothesis'}],
                             'review': {'supported_claim_ids': ['c1']}})['claims'][0]
        self.assertEqual(r['status'], 'SOURCE_ATTRIBUTED_HYPOTHESIS')
        self.assertEqual(r['source_independence'], 'NOT_ESTABLISHED_BY_DOCUMENT_COUNT')


if __name__ == '__main__':
    unittest.main()
