import unittest
from research_topics import topic_focus, topic_queries, strong_region_matches
from research_priority import order

class ExplicitPlaceTests(unittest.TestCase):
    def test_paros_query_retains_the_explicit_compound(self):
        focus = topic_focus('Πειρατικά ορμητήρια στη Νάουσα Πάρου, 1600–1700')
        self.assertEqual(focus['places'], ['Νάουσα Πάρου'])
        self.assertIn('Νάουσα Πάρου', topic_queries(focus, 'greek')[0])
        self.assertTrue(strong_region_matches('Πειρατές στη Νάουσα Πάρου', focus))
        self.assertTrue(strong_region_matches('Πειρατές στη Νάουσα της Πάρου', focus))
        self.assertFalse(strong_region_matches('Πειρατές στη Νάουσα της Μακεδονίας', focus))
        self.assertFalse(strong_region_matches('Pirates in Newfoundland and Patmos', focus))

    def test_general_mediterranean_scope_remains_unchanged(self):
        focus = topic_focus('Πειρατικά ορμητήρια στην Ανατολική Μεσόγειο')
        self.assertEqual(focus['places'], [])
        self.assertIn('mediterranean', focus['region_concepts'])
        self.assertTrue(strong_region_matches('corsairs in the Aegean', focus))

    def test_lowercase_prose_does_not_become_a_place(self):
        focus = topic_focus('Πειρατικά ορμητήρια σε άγνωστες περιοχές της θάλασσας')
        self.assertEqual(focus['places'], [])

    def test_explicit_location_prioritizes_relevant_passage(self):
        focus = topic_focus('Πειρατικά ορμητήρια στη Νάουσα Πάρου, 1600–1700')
        texts = ['Pirates attacked near Newfoundland in 1612.',
                 'Πειρατές βρήκαν καταφύγιο στη Νάουσα Πάρου το 1670.']
        rows = [{'evidence_id': str(i), 'text': text + ' ' * 1 + ' '.join(['κείμενο'] * 24),
                 'years_in_scope': [1670], 'date_basis': 'YEAR_HEADING',
                 'sampling_features': {'strong_region_match': bool(strong_region_matches(text, focus)),
                                       'event_and_use_match': True, 'direct_use_vocabulary': True,
                                       'in_scope_year_fraction': 1}, 'occurrences': []}
                for i, text in enumerate(texts)]
        self.assertEqual(order(rows, lambda row: (row['evidence_id'],), topic=True)[0]['evidence_id'], '1')

if __name__ == '__main__':
    unittest.main()
