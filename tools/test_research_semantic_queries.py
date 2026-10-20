import json
import unittest
from research_semantic_queries import expand

class QueryLanguageTests(unittest.TestCase):
    def test_wrong_script_does_not_displace_native_queries_and_raw_leads_are_retained(self):
        proposals=[{'lane':'venetian','query':'πειρατικές αγκυροβόλια Οθωνείας 1600-1700'},
                   {'lane':'venetian','query':'corsari porti Arcipelago'},
                   {'lane':'french','query':'Αστυπάλαια corsaires'},
                   {'lane':'greek','query':'πειρατεία Αιγαίο'}]
        def caller(role,prompt):return {'status':'COMPLETED','content':json.dumps({'queries':proposals})}
        result=expand({'target':'Pirate bases and anchorages in the Mediterranean'},caller)
        self.assertEqual([r['query'] for r in result['accepted_queries']],[r['query'] for r in proposals[1:]])
        self.assertEqual(result['proposed_queries'],proposals)
        self.assertEqual(result['rejected_queries'][0]['reason'],'GREEK_THEMATIC_PROSE_IN_FOREIGN_LANGUAGE_LANE')
        self.assertFalse(result['lane_coverage']['complete'])
        self.assertIn('german',result['lane_coverage']['missing_lanes'])

    def test_personal_name_search_is_preserved_and_duplicate_lane_is_bounded(self):
        rows=[{'lane':'venetian','query':'Πέτρος Λάντζας'},{'lane':'venetian','query':'Pietro Lanza'}]
        def caller(role,prompt):return {'status':'COMPLETED','content':json.dumps({'queries':rows})}
        result=expand({'target':'Petros Lantzas'},caller)
        self.assertEqual(result['accepted_queries'][0]['query'],'Πέτρος Λάντζας')
        self.assertEqual(result['rejected_queries'][0]['reason'],'DUPLICATE_LANE_QUERY')
