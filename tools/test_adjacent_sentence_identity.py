"""ADJACENT_SENTENCE identity rule and the place fidelity flag.

Uses the actual acquired Saulger (1698, BSB bsb10447069) scan 340 and the
model proposal stored by reanalysis 39939056018 (evidence e-46eb36cf1bf09be533d6,
passage_ids [2]). No model or network calls.
"""
import copy
import unittest

from semantic_research_answer import validate_items, passages
from claim_fidelity_guard import apply as fidelity_apply, place_check, PLACE_NOT_IN_QUOTE
from test_surname_section_anchor import FIX, NAMES, PAGES, P340

STORED = {'passage_kind': 'NARRATIVE_EVIDENCE',
          'statement': 'The source describes an event where Jean Capfi was captured by Turkish forces and later executed in Constantinople in 1680.',
          'evidence_id': 'e-46eb36cf1bf09be533d6', 'passage_ids': [2], 'kind': 'source_statement',
          'source_type': 'UNVERIFIED', 'actors': ['Jean Capfi'], 'places': [], 'dates': ['1680'],
          'usage_type': 'UNRESOLVED', 'uncertainty': ['ORIGINAL_NOT_INSPECTED', 'SOURCE_GENEALOGY_PENDING']}


def run(item, pages=PAGES):
    return validate_items({'items': [item]}, [P340], 'person', (1600, 1700), NAMES, section_records=pages)


class AdjacentSentence(unittest.TestCase):
    def test_fixture_is_the_stored_row(self):
        self.assertEqual(P340['evidence_id'], STORED['evidence_id'])
        parts = passages(P340['text'])
        self.assertIn('an1680', parts[2]['text'])
        self.assertNotIn('Capfi', parts[2]['text'])
        self.assertIn('Capfiles', parts[3]['text'])

    def test_stored_proposal_passes_via_following_sentence_and_section_anchor(self):
        accepted, rejected = run(copy.deepcopy(STORED))
        self.assertEqual(rejected, [])
        claim = accepted[0]
        parts = passages(P340['text'])
        self.assertEqual(claim['quote'], P340['text'][parts[2]['start_char']:parts[3]['end_char']])
        self.assertIn('Capfiles', claim['quote'])
        self.assertEqual(claim['actors'], ['Capfi'])
        self.assertEqual(claim['dates'], ['1680'])
        self.assertEqual(claim['identity_anchor'], 'SURNAME_WITH_SECTION_ANCHOR')
        self.assertEqual(claim['identity_anchor_detail'], 'ADJACENT_SENTENCE')
        adj = claim['identity_adjacent_sentence']
        self.assertEqual((adj['passage_id'], adj['position'], adj['cited_passage_ids'], adj['quote_passage_ids']),
                         (3, 'FOLLOWING', [2], [2, 3]))
        anchor = claim['identity_anchors'][0]
        self.assertEqual((anchor['anchor_quote'], anchor['anchor_scan_index_0_based']), ('JEAN CAPSI', 336))
        self.assertEqual(anchor['identity_anchor_detail'], 'ADJACENT_SENTENCE')
        for flag in ('IDENTITY_FROM_ADJACENT_SENTENCE', 'IDENTITY_FROM_SURNAME_WITH_SECTION_ANCHOR', 'OCR_LONG_S_NAME_VARIANT'):
            self.assertIn(flag, claim['uncertainty'])
        self.assertEqual(claim['source_occurrences'][0]['locator']['scan_indexes_0_based'], [340])
        # The statement names Constantinople; the OCR quote only has "Conftan- κο".
        report = fidelity_apply(accepted)
        self.assertEqual(claim['place_fidelity']['places_not_in_quote'], ['Constantinople'])
        self.assertIn(PLACE_NOT_IN_QUOTE, claim['uncertainty'])
        self.assertEqual(claim['fidelity_hold'], 'HELD_FROM_SYNTHESIS_NOT_A_VERIFIED_FACT')
        self.assertEqual(report['place_flagged_claim_ids'], [claim['claim_id']])

    def test_no_name_in_either_adjacent_sentence_fails(self):
        item = copy.deepcopy(STORED)
        item.update(passage_ids=[1], dates=[], statement='The source says Jean Capfi was put in irons.')
        accepted, rejected = run(item)
        self.assertEqual(accepted, [])
        self.assertEqual((rejected[0]['reason'], rejected[0]['field']), ('ENTITY_OR_DATE_NOT_IN_CITED_EVIDENCE', 'actors'))

    def test_date_only_in_adjacent_sentence_fails(self):
        item = copy.deepcopy(STORED)
        item.update(passage_ids=[3], statement='The source says the Turks became suspicious after the death of Jean Capfi in 1680.')
        accepted, rejected = run(item)
        self.assertEqual(accepted, [])
        self.assertTrue(any(r.get('reason') == 'UNSUPPORTED_DATE_ATTRIBUTE_REMOVED' for r in rejected))

    def test_never_widens_beyond_one_sentence(self):
        # Name two sentences away (cite [1]; [3] has Capfiles) is not used.
        item = copy.deepcopy(STORED)
        item.update(passage_ids=[1], dates=[], statement='The source says Jean Capfi did not get himself killed.')
        accepted, _ = run(item)
        self.assertEqual(accepted, [])

    def test_without_section_anchor_adjacent_surname_alone_fails(self):
        accepted, rejected = run(copy.deepcopy(STORED), pages=[P340])
        self.assertEqual(accepted, [])


class PlaceFidelity(unittest.TestCase):
    def test_place_in_statement_absent_from_quote_is_flagged(self):
        self.assertEqual(place_check('He was executed in Constantinople.', 'mena fon prifonnier à Conftan- κο')['status'],
                         PLACE_NOT_IN_QUOTE)

    def test_long_s_hyphenated_and_present_places_are_ok(self):
        self.assertEqual(place_check('He was taken to Constantinople.', 'à Conftan-\ntinople où')['status'], 'OK')
        self.assertEqual(place_check('A Greek from Milo.', "c'étoit un Grec de Milo")['status'], 'OK')
        self.assertEqual(place_check('No place here in 1680.', 'l’an1680')['status'], 'OK')

    def test_flag_is_not_deletion(self):
        claims = [{'claim_id': 'c-1', 'statement': 'Jean Capfi was hanged in Constantinople.',
                   'quote': 'il fut pendu à un arbre', 'uncertainty': []}]
        fidelity_apply(claims)
        self.assertEqual(len(claims), 1)
        self.assertEqual(claims[0]['statement'], 'Jean Capfi was hanged in Constantinople.')
        self.assertIn(PLACE_NOT_IN_QUOTE, claims[0]['uncertainty'])


if __name__ == '__main__':
    unittest.main()
