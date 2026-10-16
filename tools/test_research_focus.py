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

    def test_query_or_flag_is_not_source_content(self):
        row={'title':'Γενική ναυτική ιστορία','query':self.target,'source_lead':True,'url':'https://example/Ιωάννη-Καψή'}
        self.assertEqual(topical_match(row,self.focus)['category'],'UNMATCHED')

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
                self.assertIn('Καψ',q)
                self.assertNotEqual(q.strip('"'),'Ιωάννη')
                self.assertNotIn('variant spelling',q)
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

    def test_public_search_challenge_is_not_a_zero_result_search(self):
        from connectors.repository_connectors import _public_site_index
        for body in [b'<form id="challenge-form" action="/anomaly.js">',b'<html>unexpected upstream page</html>']:
            with patch('connectors.repository_connectors._get',return_value=body):
                status,rows,detail=_public_site_index('name','greek','Repository','example.org')
            self.assertEqual(status,'REMOTE_ACCESS_BLOCKED')
            self.assertEqual(rows,[])
            self.assertIn('PUBLIC_WEB_INDEX_',detail)
        with patch('connectors.repository_connectors._get',return_value=b'<div class="no-results">No results found</div>'):
            self.assertEqual(_public_site_index('name','greek','Repository','example.org')[0],'EXECUTED')


if __name__=='__main__':unittest.main()
