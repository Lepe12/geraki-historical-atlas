"""Protocol/scoring tests use synthetic records, never claim archival coverage."""
import copy
import unittest
from historical_authority_resolver import compare, resolve
from historical_research_graph import export_jsonld, export_gazetteer, cited_routes, bundle_graph
from persistent_evidence_bundle import build


class ContextTests(unittest.TestCase):
    def setUp(self):
        self.mention={'id':'mention','entity_type':'Person','names':['Pietro Lanza'],'historical_interval':{'start':1600,'end':1610},'people':['person:a']}
        self.authority={'id':'candidate','entity_type':'Person','names':['Pedro Lantzas','Pietro Lanza'],'historical_interval':{'start':1590,'end':1620},'people':['person:a'],'citation_ids':['c:1']}

    def test_identical_names_cannot_overcome_disjoint_lifetimes(self):
        wrong={**self.authority,'id':'namesake','historical_interval':{'start':1837,'end':1850}}
        correct=compare(self.mention,self.authority);bad=compare(self.mention,wrong)
        self.assertGreater(correct['score'],bad['score'])
        self.assertIn('DISJOINT_HISTORICAL_INTERVALS',bad['conflicts'])
        self.assertFalse(correct['automatic_merge']);self.assertFalse(bad['automatic_merge'])

    def test_missing_context_is_not_positive_evidence_and_snapshots_keep_reasons(self):
        score=compare({'id':'x','entity_type':'Person','names':['Exact']},{'id':'y','entity_type':'Person','names':['Exact'],'citation_ids':['c']})
        self.assertEqual(score['score'],.35);self.assertIn('chronology',score['missing_context'])
        snap=resolve([self.mention],[self.authority],'run1')
        changed=copy.deepcopy(self.authority);changed['people']=['person:b']
        next_snap=resolve([self.mention],[changed],'run2')
        self.assertNotEqual(snap['candidates'][0]['id'],next_snap['candidates'][0]['id'])
        self.assertIn('components',snap['candidates'][0]['explanation'])

    def test_source_less_authority_is_flagged(self):
        row=compare(self.mention,{**self.authority,'citation_ids':[]})
        self.assertIn('UNSOURCED_AUTHORITY',row['conflicts'])

    def test_dates_aliases_and_coordinates_are_not_invented(self):
        place={'id':'p','label':'Historical place','citation_ids':['c'],'start_year':1660,'end_year':1680,
               'aliases':[{'name':'Old name','start_year':1600,'end_year':1700,'citation_ids':['c']}]}
        result=export_gazetteer([place],1670,1675)
        self.assertIsNone(result['features'][0]['geometry'])
        self.assertEqual(export_gazetteer([place],1800,1900)['features'],[])
        with self.assertRaises(ValueError):export_gazetteer([{**place,'location':{'latitude':95,'longitude':25}}],1660,1680)
        with self.assertRaises(ValueError):cited_routes([{'id':'r','place_ids':['p','p'],'citation_ids':['c']}],[place])

    def test_graph_has_no_unbacked_historical_relationships(self):
        nodes=[{'id':'p','entity_type':'Place','label':'Place'},{'id':'e','entity_type':'Event','label':'Event'}]
        with self.assertRaises(ValueError):export_jsonld(nodes,[{'id':'r','subject_id':'p','object_id':'e','predicate':'base','citation_ids':[]}])

    def test_replayed_claim_exports_to_same_evidence_bundle_and_graph(self):
        answer={'claims':[{'claim_id':'c','statement':'The consulted fixture reports an anchorage.','kind':'source_statement','quote':'Ships anchored at Milo.',
                          'source_occurrences':[{'url':'https://example.org/fixture','title':'Synthetic fixture','acquired_text_path':'lane/library_acquisition/a.txt',
                          'source_text_sha256':'a'*64,'locator':{'scan_indexes_0_based':[0]}}]}]}
        bundle=build(answer);self.assertEqual(bundle['attestations'][0]['status'],'UNREVIEWED')
        graph=bundle_graph(bundle);self.assertEqual(len(graph['relations']),1)
        self.assertTrue(graph['jsonld']['@graph'])
        self.assertFalse(bundle['attestations'][0]['historically_verified'])


if __name__=='__main__':unittest.main()
