"""Surname-only mention anchored by the full name earlier in the same work,
glued-year tokenization, and DIFFERENT_PERSON passages read last.

Uses the actual acquired Saulger (1698, BSB bsb10447069) pages 336-340 and the
namesake-guard DIFFERENT_PERSON passage of the Kapsis run 39902909088.
No model or network calls.
"""
import copy
import json
from pathlib import Path
import unittest

from semantic_research_answer import (validate_items, passages, plan_batches, select_groups,
                                      demote_different_person, section_surname_anchor)
from research_relevance import contextual_years

FIX = json.loads((Path(__file__).parent / 'fixtures/kapsis_saulger_336_340.json').read_text(encoding='utf-8'))
NAMES = [FIX['normalized_request']['target'], *FIX['normalized_request']['aliases']]
PAGES = FIX['saulger_pages']
P340 = PAGES[-1]
STATEMENT = 'The consulted source reports that Jean Capfi was hanged before the gate of the Grand Bagne in 1680.'


def proposal(row, ids, actors=('Jean Capfi',), dates=('1680',), statement=STATEMENT):
    return {'passage_kind': 'NARRATIVE_EVIDENCE', 'statement': statement, 'evidence_id': row['evidence_id'],
            'passage_ids': ids, 'kind': 'source_statement', 'source_type': 'UNVERIFIED',
            'actors': list(actors), 'places': [], 'dates': list(dates), 'usage_type': 'UNRESOLVED', 'uncertainty': []}


def ids_covering(row, *needles):
    parts = passages(row['text'])
    hit = [i for i, p in enumerate(parts) if any(n in p['text'] for n in needles)]
    return list(range(min(hit), max(hit) + 1))


def check(row, ids, pages, **kw):
    return validate_items({'items': [proposal(row, ids, **kw)]}, [row], 'person', (1600, 1700), NAMES,
                          section_records=pages)


class GluedYear(unittest.TestCase):
    def test_glued_year_after_temporal_word(self):
        self.assertEqual(contextual_years("devant la porte du Grand Bagne l’an1680. Depuis"), [1680])
        self.assertEqual(contextual_years("anno1675"), [1675])
        self.assertEqual(contextual_years("Capfi1680 bsb10447069 p.1680"), [])
        self.assertIn(1680, P340['years_in_scope'])


class SurnameSectionAnchor(unittest.TestCase):
    def setUp(self):
        self.ids = ids_covering(P340, "l’an1680", 'Capfiles')

    def test_stored_saulger_340_hanging_claim_passes_with_section_anchor(self):
        quote = ''.join(passages(P340['text'])[i]['text'] for i in self.ids)
        self.assertIn('Capfiles', quote)
        self.assertNotIn('Jean', quote)
        accepted, rejected = check(P340, self.ids, PAGES)
        self.assertEqual(rejected, [])
        claim = accepted[0]
        self.assertEqual(claim['actors'], ['Capfi'])
        self.assertEqual(claim['dates'], ['1680'])
        self.assertEqual(claim['identity_anchor'], 'SURNAME_WITH_SECTION_ANCHOR')
        anchor = claim['identity_anchors'][0]
        self.assertEqual(anchor['anchor_quote'], 'JEAN CAPSI')
        self.assertEqual(anchor['anchor_scan_index_0_based'], 336)
        self.assertEqual(anchor['span_scan_indexes_0_based'], [336, 337, 338, 339, 340])
        self.assertEqual(anchor['run_together_suffix'], 'les')
        self.assertIn('IDENTITY_FROM_SURNAME_WITH_SECTION_ANCHOR', claim['uncertainty'])
        self.assertIn('OCR_LONG_S_NAME_VARIANT', claim['uncertainty'])
        self.assertEqual(claim['quote'][anchor['surname_offset_in_quote']:][:5], 'Capfi')

    def test_surname_only_quote_without_anchor_fails(self):
        # Only page 340 is available: the full name is nowhere before the quote.
        accepted, rejected = check(P340, self.ids, [P340])
        self.assertEqual(accepted, [])
        self.assertEqual(rejected[0]['reason'], 'ENTITY_OR_DATE_NOT_IN_CITED_EVIDENCE')
        # A gap in the page sequence also breaks the span.
        accepted, rejected = check(P340, self.ids, [p for p in PAGES if p is not PAGES[2]])
        self.assertEqual(accepted, [])

    def test_two_people_with_the_surname_in_span_fails(self):
        pages = copy.deepcopy(PAGES)
        mid = pages[2]
        mid['text'] = mid['text'][:200] + ' Nicolas Capfi ' + mid['text'][215:]
        accepted, rejected = check(pages[-1], self.ids, pages)
        self.assertEqual(accepted, [])
        self.assertEqual(rejected[0]['reason'], 'ENTITY_OR_DATE_NOT_IN_CITED_EVIDENCE')

    def test_date_must_still_be_in_quote(self):
        ids = ids_covering(P340, 'Capfiles')
        quote = ''.join(passages(P340['text'])[i]['text'] for i in ids)
        self.assertNotIn('1680', quote)
        accepted, rejected = check(P340, ids, PAGES)
        self.assertEqual(accepted, [])

    def test_unlisted_run_together_and_other_names_are_not_anchored(self):
        row = P340
        self.assertIsNone(section_surname_anchor('Jean Capfi', row, 0, 'il fut pendu par Capfiano et les Turcs.', PAGES, NAMES))
        self.assertIsNone(section_surname_anchor('Marc Baffo', row, 0, 'Depuis la mort de Capfi les Turcs.', PAGES, NAMES))


class DifferentPersonReadLast(unittest.TestCase):
    def test_chiefs_of_state_passage_takes_no_reading_slot(self):
        from namesake_guard import classify
        chiefs = FIX['different_person'][0]
        self.assertIn('Kapsis, Ioannis', chiefs['text'])
        records = [chiefs, *PAGES]
        linkage, _ = classify(records, FIX['normalized_request'])
        self.assertEqual(linkage[chiefs['evidence_id']]['status'], 'DIFFERENT_PERSON')
        namesakes = demote_different_person(records, linkage)
        self.assertEqual(namesakes, {chiefs['evidence_id']})
        ordered = [r for r in records if r['evidence_id'] not in namesakes] + [r for r in records if r['evidence_id'] in namesakes]
        groups, deferred, namesake_groups = plan_batches(ordered, namesakes, 2500)
        self.assertEqual([r['evidence_id'] for r in groups[-1]], [chiefs['evidence_id']])
        self.assertTrue(all(chiefs not in g for g in groups[:-1]))
        read, skipped = select_groups(groups, namesake_groups, len(groups) - 1, lambda g: False)
        self.assertNotIn(chiefs['evidence_id'], [r['evidence_id'] for g in read for r in g])
        self.assertEqual(skipped, [{'evidence_id': chiefs['evidence_id'], 'reason': 'NAMESAKE_DIFFERENT_PERSON_SKIPPED_FOR_BUDGET'}])
        # Never deleted: with spare budget it is still read, last.
        read, skipped = select_groups(groups, namesake_groups, len(groups), lambda g: False)
        self.assertEqual(skipped, [])
        self.assertEqual(read[-1][0]['evidence_id'], chiefs['evidence_id'])


if __name__ == '__main__':
    unittest.main()
