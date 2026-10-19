"""Full-text retrieval controls independent of catalogue name metadata."""
import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from fulltext_discovery import decompose,ia_search,ia_queries,iiif_search,manifest_pool,search_terms,context_terms,text_match,merge_findings,run
from research_relevance import identity,assess


class FulltextTests(unittest.TestCase):
    def setUp(self):self.focus=decompose('Ιωάννη Καψή βασιλιά της Μήλου')

    def test_query_hypotheses_are_mechanical_and_unverified(self):
        self.assertIn('capsi',search_terms(self.focus))
        self.assertIn('milo',context_terms(self.focus))
        self.assertNotIn('Jean',search_terms(self.focus))
        nominative=decompose('Ιωάννης Καψής, βασιλιάς της Μήλου')
        self.assertIn('capsi',search_terms(nominative))
        hit=text_match({'context_excerpt':'Giovanni Capsi, re di Milo.'},nominative)
        self.assertEqual(hit['reason'],'FULLTEXT_COMPLETE_NAME_REQUIRES_REVIEW')
        self.assertIn('Μήλου',hit['places'])
        self.assertFalse(hit['identity_verified'])
        self.assertNotIn('capsi',search_terms(decompose('Henry Morgan governor of Jamaica')))

    def test_bare_person_queries_search_full_name_before_surname(self):
        focus=decompose('Pedro Lanza')
        self.assertEqual(ia_queries(focus)[:2],['"Pedro Lanza"','"lanza"'])
        hit=text_match({'context_excerpt':'Correspondence concerning Pedro Lanza, 1580.'},focus)
        self.assertEqual(hit['category'],'POSSIBLE_TARGET')
        self.assertFalse(hit['identity_verified'])
        self.assertIsNone(text_match({'fulltext_contexts':['Pedro wrote a letter.','Lanza appears on another page.']},focus))
        self.assertIsNone(text_match({'context_excerpt':'Pedro Lanzares wrote a letter.'},focus))

    def test_surname_first_ocr_and_queries(self):
        focus=decompose('Pietro Lanza')
        self.assertIn('"Lanza, Pietro"',ia_queries(focus))
        self.assertEqual(text_match({'context_excerpt':'Lanza, Pietro, letter of 1580.'},focus)['category'],'POSSIBLE_TARGET')
        self.assertIsNone(text_match({'context_excerpt':'Lanza mentioned a different author called Pietro.'},focus))

    def test_generic_role_in_wrong_place_does_not_prioritize_namesake(self):
        req={'target':'Henry Morgan governor of Jamaica','aliases':[],'purpose':'history'}
        result=assess({'title':'Historical biographies','fulltext_hit':True,
                       'context_excerpt':'Henry Morgan was governor of Canada.'},identity(req,req))
        self.assertEqual(result['status'],'REVIEW_REQUIRED')
        self.assertEqual(result['topical_match']['reason'],'FULLTEXT_NAME_WITHOUT_REQUEST_CONTEXT')

    def test_non_travellers_lane_searches_its_own_manifest_without_duplicate_ia(self):
        req={'target':'Pietro Lanza','aliases':[],'purpose':'history'}
        manifest_url='https://example.org/book/manifest'
        canvas='https://example.org/canvas/9'
        manifest={'label':'Letters','service':{'@id':'https://example.org/search','profile':'http://iiif.io/api/search/1/search'},
                  'items':[{'id':canvas,'label':'9'}]}
        reply={'resources':[{'@id':'a','on':canvas}],
               'hits':[{'annotations':['a'],'match':'Lanza, Pietro, letter.'}]}
        with tempfile.TemporaryDirectory() as td,patch('fulltext_discovery.ia_search') as ia,patch('fulltext_discovery.get_json',side_effect=lambda url:manifest if url==manifest_url else reply):
            root=Path(td);(root/'lane_discovery').mkdir()
            (root/'lane_discovery/venetian.json').write_text(json.dumps({'results':[{'iiif_manifest_candidates':[manifest_url]}]}))
            rows,attempts=run(root,req,req,'venetian',ia_enabled=False)
            self.assertEqual(rows[0]['discovery_lane'],'venetian')
            self.assertEqual(rows[0]['printed_page'],9)
            ia.assert_not_called()
            self.assertTrue(all(a['status']=='EXECUTED' for a in attempts))

    def test_missing_manifest_reports_unavailable_coverage(self):
        req={'target':'Pietro Lanza','aliases':[]}
        with tempfile.TemporaryDirectory() as td:
            rows,attempts=run(Path(td),req,req,'greek',ia_enabled=False)
        self.assertEqual(rows,[])
        self.assertEqual(attempts[0]['status'],'FULLTEXT_TARGETS_UNAVAILABLE')

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

    def test_complete_name_without_requested_context_is_not_prioritized(self):
        req={'target':'Henry Morgan governor of Jamaica','aliases':[],'purpose':'historical research'}
        row={'title':'History of modern medicine','fulltext_hit':True,
             'context_excerpt':'Henry Morgan, a physician in London.'}
        result=assess(row,identity(req,req))
        self.assertEqual(result['status'],'REVIEW_REQUIRED')
        self.assertLessEqual(result['research_value']['score'],65)
        self.assertEqual(result['topical_match']['reason'],'FULLTEXT_NAME_WITHOUT_REQUEST_CONTEXT')
        self.assertFalse(result['verified'])

    def test_later_contextual_passage_beats_earlier_namesake(self):
        focus=decompose('Henry Morgan governor of Jamaica')
        row={'fulltext_contexts':['Henry Morgan, physician in London.',
                                  'Henry Morgan was governor of Jamaica.']}
        hit=text_match(row,focus)
        self.assertIn('Jamaica',hit['matched_excerpt'])
        self.assertIn('Jamaica',hit['places'])

    def test_inflected_greek_full_name_is_retained_from_ocr(self):
        req={'target':'Πέτρος Λάντζας','aliases':[],'purpose':'history'}
        result=assess({'title':'Ιστορική αλληλογραφία','fulltext_hit':True,
                       'context_excerpt':'Επιστολή του Πέτρου Λάντζα το 1580.'},identity(req,req))
        self.assertEqual(result['topical_match']['category'],'POSSIBLE_TARGET')
        self.assertEqual(result['status'],'PRIORITY')
        self.assertFalse(result['verified'])

    def test_fulltext_highlights_cannot_manufacture_a_catalogue_match(self):
        req={'target':'Pedro Lanza','aliases':[],'purpose':'history'}
        result=assess({'title':'History of correspondence','fulltext_hit':True,
                       'context_excerpt':'Pedro … Lanza',
                       'fulltext_contexts':['Pedro','Lanza']},identity(req,req))
        self.assertEqual(result['topical_match']['category'],'UNMATCHED')
        self.assertNotEqual(result['status'],'PRIORITY')

    def test_later_occurrence_in_same_page_can_supply_context(self):
        focus=decompose('Henry Morgan governor of Jamaica')
        passage='Henry Morgan, physician. '+('Other unrelated text. '*40)+'Henry Morgan, governor of Jamaica.'
        hit=text_match({'context_excerpt':passage},focus)
        self.assertIn('Jamaica',hit['matched_excerpt'])

    def test_fulltext_does_not_downgrade_independent_metadata_match(self):
        req={'target':'Pedro Lanza','aliases':[],'purpose':'history'}
        result=assess({'title':'History of Pedro Lanza','fulltext_hit':True,
                       'context_excerpt':'Pedro Lanza appears in this letter.'},identity(req,req))
        self.assertEqual(result['topical_match']['category'],'TARGET_MATCH')

    def test_iiif_preserves_later_passages_on_same_page(self):
        canvas='https://example.org/canvas/42'
        manifest={'label':'Book','service':{'@id':'https://example.org/search','profile':'http://iiif.io/api/search/1/search'},
                  'items':[{'id':canvas,'label':'42'}]}
        result={'resources':[{'@id':'a','on':canvas}], 'hits':[
            {'annotations':['a'],'match':'Unrelated passage.'},
            {'annotations':['a'],'match':'King Capsi of Milo.'}]}
        with tempfile.TemporaryDirectory() as td,patch('fulltext_discovery.get_json',side_effect=[manifest,result]):
            rows,_=iiif_search({'url':'https://example.org/manifest','provenance':'test'},['Capsi'],Path(td))
        self.assertEqual(len(rows),1)
        self.assertEqual(len(rows[0]['fulltext_contexts']),2)
        self.assertIsNotNone(text_match(rows[0],self.focus))

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

    def test_native_bsb_bare_annotation_list_is_zero_but_error_json_is_not(self):
        manifest={'service':{'@id':'https://example.org/search','profile':'http://iiif.io/api/search/1/search'}}
        for response,status in [({'@type':'sc:AnnotationList'},'EXECUTED'),({'error':'unavailable'},'REMOTE_ERROR')]:
            with tempfile.TemporaryDirectory() as td,patch('fulltext_discovery.get_json',side_effect=[manifest,response]):
                rows,attempts=iiif_search({'url':'https://example.org/manifest','provenance':'test'},['name'],Path(td))
            self.assertEqual(rows,[])
            self.assertEqual(attempts[0]['status'],status)

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

    def test_repeated_bibliographic_record_preserves_all_lanes_once(self):
        from orchestrator.build_command_center_snapshot import discovery_results
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            for lane,repo in [('travellers','Biblioteca Digital Hispánica'),('spanish_simancas','Biblioteca Nacional de España SRU')]:
                folder=root/lane/'lane_discovery';folder.mkdir(parents=True)
                (folder/(lane+'.json')).write_text(json.dumps({'results':[{'identifier':'(OCoLC)123456','title':'A source','discovery_repository':repo}]}))
            rows,_=discovery_results(root)
        self.assertEqual(len(rows),1)
        self.assertEqual(set(rows[0]['contributing_lanes']),{'travellers','spanish_simancas'})
        self.assertEqual(len(rows[0]['repositories']),2)


if __name__=='__main__':unittest.main()
