"""Full-text retrieval controls independent of catalogue name metadata."""
import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from fulltext_discovery import decompose,ia_search,iiif_search,manifest_pool,search_terms,context_terms,text_match,merge_findings
from research_relevance import identity,assess


class FulltextTests(unittest.TestCase):
    def setUp(self):self.focus=decompose('Ιωάννη Καψή βασιλιά της Μήλου')

    def test_query_hypotheses_are_mechanical_and_unverified(self):
        self.assertIn('capsi',search_terms(self.focus))
        self.assertIn('milo',context_terms(self.focus))
        self.assertNotIn('Jean',search_terms(self.focus))
        self.assertNotIn('capsi',search_terms(decompose('Henry Morgan governor of Jamaica')))

    def test_same_passage_required_and_hypothesis_never_verifies_identity(self):
        positive={'fulltext_hit':True,'context_excerpt':'Jean Capſi, Grec de Milo. Son règne dura trois ans.'}
        hit=text_match(positive,self.focus)
        self.assertEqual(hit['category'],'POSSIBLE_TARGET')
        self.assertFalse(hit['identity_verified'])
        for row in [{'context_excerpt':'Capsi, modern journalist'},
                    {'context_excerpt':'v kapsi a milo, ordinary unrelated words'},
                    {'context_excerpt':'Hotel Capsis; resorts near Milo.'},
                    {'context_excerpt':'Capsi '+('unrelated '*100)+'Milo'},
                    {'fulltext_contexts':['Capsi king of an island','Milo, a different passage']}]:
            self.assertIsNone(text_match(row,self.focus))
        req={'target':self.focus['entity']+' βασιλιά της Μήλου','aliases':[],'purpose':'history'}
        a=assess({'title':'Histoire de l’Archipel',**positive},identity(req,req))
        self.assertEqual(a['status'],'PRIORITY')
        self.assertFalse(a['verified'])
        self.assertEqual(a['topical_match']['category'],'POSSIBLE_TARGET')

    def test_native_ia_fulltext_fields_and_highlights_are_preserved(self):
        response={'hits':{'hits':[{'fields':{'identifier':['book-with-no-name-in-title'],'meta_title':['Voyage'],'meta_year':[1690],'page_num':[[47]]},'highlight':{'text':['Story of {{{Capsi}}} of {{{Milo}}}.']}}]}}
        with patch('fulltext_discovery.get_json',return_value=response) as fetch:rows=ia_search('"Capsi" AND "Milo"')
        self.assertEqual(fetch.call_args.args[1]['q'],'!L "Capsi" AND "Milo"')
        self.assertEqual(rows[0]['context_excerpt'],'Story of Capsi of Milo.')
        self.assertEqual(rows[0]['reported_page_numbers'],[[47]])
        self.assertNotIn('printed_page',rows[0])
        self.assertFalse(rows[0]['verified'])

    def test_later_query_cannot_erase_an_earlier_relevant_passage(self):
        base={'identifier':'book','discovery_repository':'Internet Archive Full Text'}
        good={**base,'fulltext_query':'first','fulltext_contexts':['King Capsi of Milo.']}
        other={**base,'fulltext_query':'second','fulltext_contexts':['Another unrelated passage.']}
        rows=merge_findings([good,other],self.focus)
        self.assertEqual(len(rows),1)
        self.assertEqual(len(rows[0]['fulltext_contexts']),2)
        self.assertIn('King Capsi',rows[0]['context_excerpt'])
        self.assertEqual(rows[0]['query_provenance'],['first','second'])

    def test_iiif_search_uses_manifest_service_and_actual_page_label(self):
        manifest_url='https://example.org/book/manifest';service='https://example.org/search/book'
        canvas='https://example.org/canvas/42'
        manifest={'label':'Unrelated catalogue title','service':{'@id':service,'profile':'http://iiif.io/api/search/1/search'},'sequences':[{'canvases':[{'@id':canvas,'label':'71 (0042)','images':[{'resource':{'@id':'https://example.org/image/42.jpg'}}]}]}]}
        result={'resources':[{'@id':'a','on':canvas+'#xywh=1,2,3,4'}],'hits':[{'annotations':['a'],'before':'Jean ','match':'Capſi','after':', Grec de Milo.'}]}
        with tempfile.TemporaryDirectory() as td,patch('fulltext_discovery.get_json',side_effect=[manifest,result]) as fetch:
            rows,attempts=iiif_search({'url':manifest_url,'provenance':'Existing source'},['Capsi'],Path(td))
        self.assertEqual(fetch.call_args.args[0],service+'?q=Capsi')
        self.assertEqual(rows[0]['printed_page'],71)
        self.assertEqual(rows[0]['scan_index_0_based'],0)
        self.assertEqual(rows[0]['canvas_id'],canvas)
        self.assertEqual(rows[0]['evidence_state'],'EXACT_PAGE_MAPPED')
        self.assertFalse(rows[0]['original_inspected'])

    def test_any_registered_book_can_be_searched_without_catalogue_name_match(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);(root/'acquisition_requests').mkdir()
            url='https://example.org/arbitrary-book/manifest'
            (root/'acquisition_requests/another-source.json').write_text(json.dumps({'manifest':url}))
            pool=manifest_pool(root,{}, {'results':[]})
            self.assertEqual(pool,[{'url':url,'provenance':'acquisition_requests/another-source.json'}])

    def test_missing_fulltext_service_is_a_blocker_not_no_results(self):
        with tempfile.TemporaryDirectory() as td,patch('fulltext_discovery.get_json',return_value={'label':'Book'}):
            rows,attempts=iiif_search({'url':'https://example.org/manifest','provenance':'test'},['name'],Path(td))
        self.assertEqual(rows,[])
        self.assertEqual(attempts[0]['status'],'FULLTEXT_SERVICE_UNAVAILABLE')

    def test_iiif_empty_annotation_list_can_omit_optional_hits(self):
        manifest={'service':{'@id':'https://example.org/search','profile':'http://iiif.io/api/search/1/search'}}
        with tempfile.TemporaryDirectory() as td,patch('fulltext_discovery.get_json',side_effect=[manifest,{'resources':[]}]):
            rows,attempts=iiif_search({'url':'https://example.org/manifest','provenance':'test'},['absent'],Path(td))
        self.assertEqual(rows,[])
        self.assertEqual(attempts[0]['status'],'EXECUTED')

    def test_snapshot_preserves_fulltext_page_and_identity_uncertainty(self):
        from orchestrator.build_command_center_snapshot import discovery_results
        row={'identifier':'book/canvas/42','title':'Unrelated catalogue title','discovery_repository':'IIIF Full Text',
             'fulltext_hit':True,'context_excerpt':'Jean Capſi of Milo, his reign.','printed_page':71,
             'canvas_id':'book/canvas/42','evidence_state':'EXACT_PAGE_MAPPED'}
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);folder=root/'travellers/lane_discovery';folder.mkdir(parents=True)
            (folder/'travellers.json').write_text(json.dumps({'results':[row]}))
            req={'target':'Ιωάννη Καψή βασιλιά της Μήλου','aliases':[],'purpose':'history'}
            rows,_=discovery_results(root,req)
        self.assertEqual(rows[0]['printed_page'],71)
        self.assertEqual(rows[0]['evidence_state'],'EXACT_PAGE_MAPPED')
        self.assertEqual(rows[0]['topical_match']['category'],'POSSIBLE_TARGET')
        self.assertFalse(rows[0]['verified'])


if __name__=='__main__':unittest.main()
