"""Identity precision controls: first-name collisions must never become answers."""
import json, os, runpy, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from research_focus import decompose, focused_queries, topical_match
from research_relevance import identity, assess, rank
from orchestrator.jarvis_specialist_plan import build

TOOLS=Path(__file__).resolve().parent


class ResearchFocusTests(unittest.TestCase):
    def setUp(self):
        self.target='Ιωάννη Καψή βασιλιά της Μήλου'
        self.focus=decompose(self.target)

    def test_request_facets_are_preserved_without_historical_inference(self):
        self.assertEqual(self.focus['entity'],'Ιωάννη Καψή')
        self.assertEqual(self.focus['roles'],['βασιλιά'])
        self.assertEqual(self.focus['places'],['Μήλου'])
        self.assertNotIn('Capsi',str(self.focus))
        other=decompose('Henry Morgan governor of Jamaica')
        self.assertEqual(other['entity'],'Henry Morgan')
        self.assertEqual(other['places'],['Jamaica'])
        self.assertEqual(decompose('New York',kind='place')['kind'],'place')

    def test_inflection_recall_and_no_first_name_only_or_surname_prefix(self):
        for title in ['Ιωάννης Καψής, βασιλιάς της Μήλου','Ιωάννη Καψή και η δράση του στη Μήλο']:
            self.assertEqual(topical_match({'title':title},self.focus)['category'],'TARGET_MATCH',title)
        for title in ['Ιωάννης Παπαδόπουλος: πειρατεία στη Μήλο',
                      'Ιωάννης Καποδίστριας, βασιλιάς της Μήλου',
                      'Ιωάννης Καψήτας ιστορία','Πειρατές στο Αιγαίο']:
            self.assertNotIn(topical_match({'title':title},self.focus)['category'],('TARGET_MATCH','POSSIBLE_TARGET'),title)
        # Real-run failure: names of different authors in a long contents list.
        self.assertEqual(topical_match({'title':'Ιωάννης Σχολαστικός. '+('Άλλο άρθρο. '*30)+'του Γιάννη Καψή'},decompose('Ιωάννη Καψή'))['category'],'UNMATCHED')
        distant='Ιωάννης Καψής, δημοσιογράφος. '+('Άσχετη παράγραφος. '*30)+'Μήλου, βασιλιάς.'
        self.assertEqual(topical_match({'title':distant},self.focus)['category'],'POSSIBLE_TARGET')
        self.assertEqual(topical_match({'title':distant},self.focus)['reason'],'NAME_WITHOUT_REQUEST_CONTEXT')
        self.assertEqual(topical_match({'title':'Καψής της Μήλου'},self.focus)['category'],'POSSIBLE_TARGET')
        self.assertEqual(topical_match({'title':'Καψής, σύγχρονος δημοσιογράφος'},self.focus)['category'],'UNMATCHED')

    def test_catalogue_surname_first_requires_explicit_name_not_unrelated_authors(self):
        focus=decompose('Pietro Lanza')
        self.assertEqual(topical_match({'title':'Lanza, Pietro: diplomatic letters'},focus)['category'],'TARGET_MATCH')
        self.assertEqual(topical_match({'title':'Lanza wrote a book. Pietro edited another.'},focus)['category'],'UNMATCHED')
        self.assertIn('"Lanza, Pietro"',focused_queries(focus,('history',)))

    def test_generic_role_does_not_override_requested_place(self):
        focus=decompose('Henry Morgan governor of Jamaica')
        result=topical_match({'title':'Henry Morgan governor of Canada'},focus)
        self.assertEqual(result['category'],'POSSIBLE_TARGET')
        self.assertEqual(result['reason'],'NAME_WITHOUT_REQUEST_CONTEXT')

    def test_author_namesake_is_not_subject_evidence(self):
        focus=decompose('Πέτρος Λάντζας',['Pietro Lanza'])
        row={'title':'Considerazioni sulla storia di Sicilia, di Pietro Lanza',
             'creator':'Lanza, Pietro, principe di Scordia','year':1836}
        result=topical_match(row,focus)
        self.assertEqual(result['category'],'POSSIBLE_TARGET')
        self.assertEqual(result['reason'],'AUTHORSHIP_NOT_SUBJECT_EVIDENCE')
        req={'target':'Πέτρος Λάντζας','aliases':['Pietro Lanza']}
        self.assertNotEqual(assess(row,identity(req,req))['status'],'PRIORITY')
        row['description']='Letters concerning Pietro Lanza, the corsair.'
        self.assertEqual(topical_match(row,focus)['category'],'TARGET_MATCH')

    def test_biographical_subject_without_generic_history_keyword_is_acquired(self):
        req={'target':'Πέτρος Λάντζας','aliases':['Pietro Lanza']}
        for title in ['Από τη Γαληνοτάτη στον Καθολικότατο: Οι φουρτούνες του Καπετάν-Πέτρου Λάντζα',
                      'ΛΑΣΚΑΡΙΣ ΜΙΧΑΗΛ, Πέτρος Λάντζας: διοικητής της Πάργας']:
            result=assess({'title':title},identity(req,req))
            self.assertEqual(result['status'],'PRIORITY')
            self.assertFalse(result['verified'])
        self.assertEqual(assess({'title':'Pietro Lanza di Scalea'},identity(req,req))['status'],'REVIEW_REQUIRED')
        self.assertEqual(assess({'title':'Pietro Lanza e Stella'},identity(req,req))['status'],'REVIEW_REQUIRED')
        self.assertEqual(assess({'title':'Pietro Lanza e la sua storia'},identity(req,req))['status'],'PRIORITY')
        other={'target':'William Rook','aliases':[]}
        self.assertEqual(assess({'title':'Letters of William Rook'},identity(other,other))['status'],'PRIORITY')

    def test_query_or_flag_is_not_source_content(self):
        row={'title':'Γενική ναυτική ιστορία','query':self.target,'source_lead':True,'url':'https://example/Ιωάννη-Καψή'}
        self.assertEqual(topical_match(row,self.focus)['category'],'UNMATCHED')

    def test_bilingual_slash_name_is_two_supplied_spellings_not_one_phrase(self):
        focus=decompose('Pedro Lanza / Πέτρος Λάντζας')
        self.assertEqual(focus['kind'],'person')
        self.assertEqual(focus['entity'],'Pedro Lanza')
        self.assertEqual(focus['names'][:2],['Pedro Lanza','Πέτρος Λάντζας'])
        self.assertNotIn('/',focus['entity'])
        for title in ['Pedro Lanza corsair','Πέτρος Λάντζας διοικητής της Πάργας','Lanza, Pedro correspondence']:
            self.assertIn(topical_match({'title':title},focus)['category'],('TARGET_MATCH','POSSIBLE_TARGET'),title)
        queries=focused_queries(focus,include_hypotheses=True)
        self.assertEqual(queries[:2],['"Pedro Lanza"','"Πέτρος Λάντζας"'])
        self.assertTrue(any('Pietro Lanza' in q for q in queries))
        self.assertNotIn('Pietro Lanza',focus['names'])

    def test_nominative_kapsis_keeps_role_and_does_not_attest_foreign_spellings(self):
        focus=decompose('Ιωάννης Καψής, βασιλιάς της Μήλου')
        self.assertEqual(focus['entity'],'Ιωάννης Καψής')
        self.assertEqual(focus['roles'],['βασιλιάς'])
        self.assertEqual(focus['places'],['Μήλου'])
        self.assertNotIn('Capsi',str(focus))
        self.assertEqual(topical_match({'title':'Giovanni Capsi, re di Milo'},focus)['reason'],'TRANSLITERATION_REQUIRES_IDENTITY_REVIEW')
        self.assertEqual(topical_match({'title':'Ιωάννης Καψής, βασιλιάς της Μήλου'},focus)['category'],'TARGET_MATCH')

    def test_later_latin_namesake_is_not_acquired_as_the_greek_person(self):
        req={'target':'Pedro Lanza / Πέτρος Λάντζας','aliases':[],'purpose':'history'}
        ident=identity(req,req)
        namesake=assess({'title':'Il risorgimento italiano','description':'Pietro Lanza a Palermo nel 1837 durante il colera.','year':1860},ident)
        self.assertEqual(namesake['status'],'REVIEW_REQUIRED')
        self.assertIn('LATER_NAMESAKE_REQUIRES_IDENTITY_REVIEW',namesake['reasons'])
        letter=assess({'title':'Letters of Pedro Lanza','description':'Pedro Lanza, corsair, 1580.','year':1580,'source_type':'PRIMARY'},ident)
        self.assertEqual(letter['status'],'PRIORITY')
        self.assertEqual(letter['evidence_class']['class'],'PRIMARY_SOURCE')
        study=assess({'title':'Πέτρος Λάντζας: διοικητής της Πάργας','description':'Βιογραφική μελέτη.','year':1990},ident)
        self.assertEqual(study['status'],'PRIORITY')
        self.assertEqual(study['evidence_class']['class'],'SECONDARY_STUDY')
        self.assertFalse(letter['verified'])

    def test_small_query_budgets_cover_aliases_before_qualifiers(self):
        focus=decompose('Πέτρος λαντζας',['Pedro Lanza','Pietro Lanza'])
        queries=focused_queries(focus,('corsario','galera'),include_hypotheses=True)
        self.assertEqual(queries[:3],['"Πέτρος λαντζας"','"Pedro Lanza"','"Pietro Lanza"'])
        self.assertIn('"petros lantzas"',queries[:4])
        self.assertNotIn('petros lantzas',focus['names'])
        mechanical=topical_match({'title':'Petros Lantzas in historical correspondence'},decompose('Πέτρος λαντζας'))
        self.assertEqual(mechanical['category'],'POSSIBLE_TARGET')
        self.assertTrue(mechanical['query_hypothesis'])
        self.assertEqual(topical_match({'title':'Petros somebody else'},focus)['category'],'UNMATCHED')

    def test_open_web_requires_configured_provider_without_network_calls(self):
        from connectors.repository_connectors import dispatch
        with patch('connectors.repository_connectors._get') as remote:
            status,rows,detail=dispatch('Public Web Source Discovery','"Pedro Lanza"','travellers')
        self.assertEqual(status,'API_KEY_REQUIRED')
        self.assertEqual(rows,[])
        self.assertIn('WEB_SEARCH_PROVIDER_NOT_CONFIGURED',detail)
        remote.assert_not_called()

    def test_ranking_and_retention(self):
        req={'target':self.target,'aliases':[],'purpose':'historical research'}
        ident=identity(req,req)
        rows=[{'title':'Πειρατές και αιχμαλωσία στο Αιγαίο','year':1675},
              {'title':'Ιωάννης Παπαδόπουλος history of Greece'},
              {'title':'Ιωάννης Καψής στη Μήλο'}, {'title':'Καψής της Μήλου'}]
        out=rank(rows,ident)
        self.assertEqual(out[0]['title'],'Ιωάννης Καψής στη Μήλο')
        for row in out[2:]:
            a=row['relevance_assessment']
            self.assertNotEqual(a['status'],'PRIORITY')
            self.assertLessEqual(a['research_value']['score'],20)
            self.assertTrue(a['retention']['visible_in_research_discovery'])
            self.assertFalse(a['retention']['discard_allowed'])

    def test_bounded_specialist_plan_contains_only_anchored_queries(self):
        plan=build(self.target,'Research this person')
        self.assertEqual(plan['target_type'],'person')
        self.assertEqual(plan['research_focus']['entity'],'Ιωάννη Καψή')
        for agent in plan['agents']:
            self.assertLessEqual(agent['query_budget']['total'],20)
            for q in agent['assigned_queries']:
                self.assertNotEqual(q.strip('"'),'Ιωάννη')
                self.assertNotIn('variant spelling',q)
            self.assertTrue(any('Καψ' in q for q in agent['assigned_queries']),agent['assigned_queries'])
            self.assertTrue(any('kaps' in q.casefold() for q in agent['assigned_queries']),agent['assigned_queries'])
        self.assertTrue(any('Ιωάννης Καψής' in q for q in focused_queries(self.focus)))
        first=focused_queries(self.focus)[:3]
        self.assertIn('"Ιωάννη Καψή"',first)
        self.assertIn('"Ιωάννης Καψής"',first)
        self.assertIn('"Καψή" "Μήλου"',first)

    def test_actual_searchculture_execution_has_no_generic_fallback(self):
        req={'target':self.target,'aliases':[],'purpose':'Research this person'}
        plan={**req,'target_identity':identity(req,req),'repositories':[{'name':'SearchCulture.gr / EKT','base_url':'https://www.searchculture.gr'}]}
        calls=[]
        def execute(name,q,lane):
            calls.append(q)
            return 'EXECUTED',[], 'offline test connector'
        with tempfile.TemporaryDirectory() as td:
            previous=os.getcwd()
            try:
                os.chdir(td);Path('repository_plans').mkdir()
                Path('repository_plans/greek.json').write_text(json.dumps(plan))
                with patch.dict(os.environ,{'PCT_RESEARCH_LANE':'greek'}),patch('connectors.repository_connectors.dispatch',side_effect=execute):
                    runpy.run_path(str(TOOLS/'lane_repository_discovery.py'))
            finally:os.chdir(previous)
        self.assertTrue(calls)
        self.assertTrue(all('Καψ' in q for q in calls),calls)
        self.assertNotIn('πειρατές',calls)
        self.assertNotIn('αιχμαλωσία',calls)

    def test_interrupted_repository_preserves_hits_and_unexecuted_coverage(self):
        req={'target':'Pedro Lanza','aliases':[],'purpose':'Research this person'}
        plan={**req,'target_identity':identity(req,req),'repositories':[
            {'name':'First archive','base_url':'https://example.org'},
            {'name':'Later archive','base_url':'https://later.example.org'}]}
        calls=[]
        def execute(name,q,lane):
            calls.append(q)
            if len(calls)>1:raise SystemExit('simulated runner interruption')
            return 'EXECUTED',[{'identifier':'lead-1','title':'Pedro Lanza correspondence'}],'source result'
        with tempfile.TemporaryDirectory() as td:
            previous=os.getcwd()
            try:
                os.chdir(td);Path('repository_plans').mkdir()
                Path('repository_plans/travellers.json').write_text(json.dumps(plan))
                with patch.dict(os.environ,{'PCT_RESEARCH_LANE':'travellers'}),patch('connectors.repository_connectors.dispatch',side_effect=execute):
                    with self.assertRaisesRegex(SystemExit,'simulated runner interruption'):
                        runpy.run_path(str(TOOLS/'lane_repository_discovery.py'))
                saved=json.loads(Path('lane_discovery/travellers.json').read_text())
            finally:os.chdir(previous)
        self.assertTrue(saved['partial'])
        self.assertEqual(saved['results'][0]['identifier'],'lead-1')
        self.assertEqual(saved['attempts'][0]['queries'][0]['status'],'EXECUTED')
        self.assertEqual(saved['attempts'][0]['status'],'IN_PROGRESS')
        self.assertEqual(saved['attempts'][1]['status'],'UNEXECUTED')

    def test_unconfigured_site_search_is_not_an_executed_empty_search(self):
        from connectors.repository_connectors import _public_site_index
        with patch('connectors.repository_connectors._get') as remote:
            status,rows,detail=_public_site_index('name','greek','Repository','example.org')
        self.assertEqual(status,'API_KEY_REQUIRED')
        self.assertEqual(rows,[])
        self.assertIn('WEB_SEARCH_PROVIDER_NOT_CONFIGURED',detail)
        remote.assert_not_called()

if __name__=='__main__':unittest.main()

