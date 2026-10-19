import unittest
from research_focus import decompose,topical_match
from research_topics import topic_queries
from section_extraction import extract_document
from research_relevance import identity,assess

class TopicResearchTests(unittest.TestCase):
    def test_topic_is_not_a_quoted_person(self):
        focus=decompose('Τοπωνύμια πειρατικών και κουρσάρικων ορμητηρίων στην Ανατολική Μεσόγειο')
        self.assertEqual(focus['kind'],'topic')
        self.assertEqual(focus['names'],[])
        self.assertTrue(all('Τοπωνύμια' not in q for q in topic_queries(focus,'venetian')))
        self.assertIn('corsari Mediterraneo',topic_queries(focus,'venetian'))

    def test_person_and_other_geography_preserved(self):
        self.assertEqual(decompose('Πέτρος Λάντζας')['kind'],'person')
        focus=decompose('Pirate bases and anchorages in the Caribbean')
        self.assertTrue(all('Mediterranean' not in q for q in topic_queries(focus)))

    def test_source_genre_is_acquired_but_no_base_invented(self):
        target='Pirate bases and anchorages in the Mediterranean'
        ident=identity({},dict(target=target,aliases=[],purpose=target,date_range='1600-1700'))
        self.assertEqual(assess({'title':'Voyage au Levant et dans l’Archipel','date':['1698']},ident)['status'],'PRIORITY')
        source={'title':'Voyage','url':'https://example.org/voyage'}
        quote='In 1670 the corsairs anchored in the harbour. The location is unnamed.'
        findings=extract_document(quote,source,'voyage.txt',dict(target=target,date_range='1600-1700'))
        self.assertEqual(len(findings),1)
        self.assertEqual(findings[0]['evidence_excerpt'],quote)
        self.assertFalse(findings[0]['verified'])
        self.assertEqual(findings[0]['matched_names'],[])

    def test_modern_topic_collision_has_no_match(self):
        focus=decompose('Pirate bases and anchorages in the Mediterranean')
        self.assertEqual(topical_match({'title':'Software piracy in modern corporations'},focus)['category'],'POSSIBLE_TARGET')
        findings=extract_document('Software piracy in 2024.',{'url':'https://example.org'},'a.txt',dict(target=focus['entity'],date_range='1600-1700'))
        self.assertEqual(findings[0]['decision'],'REVIEW_CONTEXT')
        self.assertIn('DATE_OUTSIDE_SCOPE',findings[0]['uncertainties'])
