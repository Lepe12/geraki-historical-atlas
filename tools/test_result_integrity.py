"""Regressions discovered during the 2026-10-17 end-to-end results audit."""
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch
from connectors import repository_connectors as rc
from research_focus import decompose, topical_match
from research_relevance import assess


class ResultIntegrityTests(unittest.TestCase):
    def setUp(self):self.focus=decompose('Pedro Lanza')

    def test_independent_fields_and_subject_entries_cannot_create_name(self):
        for row in ({'title':'Study by Pedro','description':'Lanza bibliography'},
                    {'subject':['Pedro','Lanza']},
                    {'title':'Pedro','metadata_text':'Lanza'}):
            self.assertEqual(topical_match(row,self.focus)['category'],'UNMATCHED',row)

    def test_later_complete_match_wins_over_earlier_surname(self):
        row={'title':'Lanza','description':'Historical correspondence of Pedro Lanza'}
        self.assertEqual(topical_match(row,self.focus)['category'],'TARGET_MATCH')
        self.assertEqual(topical_match(row,self.focus)['matched_field'],'description')

    @patch.object(rc,'_json')
    def test_openalex_abstract_only_name_and_oa_pdf_survive_discovery(self,remote):
        remote.return_value={'results':[{'id':'https://openalex.org/W1','title':'Mediterranean correspondence',
            'abstract_inverted_index':{'Pedro':[2],'Lanza':[3],'Historical':[0],'letters':[1]},
            'primary_location':{'landing_page_url':'https://doi.org/10.1/example','pdf_url':'https://publisher.example/closed.pdf','is_oa':False},
            'best_oa_location':{'pdf_url':'https://university.example/article.pdf','is_oa':True}}]}
        status,rows,_=rc.openalex_works('Pedro Lanza','greek')
        self.assertEqual(status,'EXECUTED')
        row=rows[0]
        self.assertEqual(row['description'],'Historical letters Pedro Lanza')
        self.assertEqual(row['digital_url'],'https://university.example/article.pdf')
        self.assertEqual(len(row['fulltext_links']),2)
        assessment=assess(row,{'target':'Pedro Lanza','focus':self.focus})
        self.assertEqual(assessment['topical_match']['category'],'TARGET_MATCH')
        self.assertFalse(assessment['verified'])
        self.assertEqual(row['verification_status'],'UNVERIFIED_DISCOVERY')

    def test_missing_or_malformed_word_positions_do_not_create_name(self):
        for index in ({'Pedro':[0],'Lanza':[2]}, {'Pedro':[False],'Lanza':['1']},None):
            text=rc._abstract_from_index(index)
            self.assertEqual(topical_match({'description':text},self.focus)['category'],'UNMATCHED')

    @patch.object(rc,'_json')
    def test_crossref_abstract_and_link_preserved_without_asserting_public_access(self,remote):
        remote.return_value={'message':{'items':[{'DOI':'10.1/example','title':['Letters'],
            'abstract':'<jats:p>Historical correspondence of <jats:italic>Pedro Lanza</jats:italic>.</jats:p>',
            'link':[{'URL':'https://publisher.example/article.pdf','content-type':'application/pdf'},
                    {'URL':'javascript:invalid'}]}]}}
        _,rows,_=rc.crossref_works('Pedro Lanza','greek')
        self.assertEqual(topical_match(rows[0],self.focus)['category'],'TARGET_MATCH')
        self.assertEqual(len(rows[0]['fulltext_links']),1)
        self.assertEqual(rows[0]['fulltext_links'][0]['access_status'],'UNVERIFIED')
        self.assertNotIn('digital_url',rows[0])

    def test_scholarly_context_and_links_survive_real_candidate_merge_and_inventory(self):
        script=Path(__file__).resolve().parent/'merge_repository_candidates.py'
        row={'identifier':'https://openalex.org/W1','title':'Historical letters',
             'description':'Historical correspondence of Pedro Lanza',
             'description_provenance':'OPENALEX_ABSTRACT_METADATA_NOT_INSPECTED_FULLTEXT',
             'search_providers':['google','brave'],
             'search_provider_attempts':[{'provider':'google','status':'EXECUTED'}],
             'fulltext_links':[{'url':'https://university.example/article.pdf','is_oa':True}],
             'digital_url':'https://university.example/article.pdf',
             'discovery_repository':'OpenAlex Scholarly Works'}
        with tempfile.TemporaryDirectory() as td:
            previous=Path.cwd()
            try:
                os.chdir(td);Path('lane_discovery').mkdir()
                Path('lane_discovery/greek.json').write_text(json.dumps({'results':[row]}))
                with patch.dict(os.environ,{'PCT_TARGET':'Pedro Lanza','PCT_RESEARCH_LANE':'greek','PCT_ALIASES':''}):
                    runpy.run_path(str(script),run_name='__main__')
                saved=json.loads(Path('citation_chase_candidates/repository_candidates.json').read_text())['selected'][0]
                inventory=json.loads(Path('research_discovery/all_findings.json').read_text())['findings'][0]
                for value in (saved,inventory):
                    self.assertEqual(value['description'],row['description'])
                    self.assertEqual(value['fulltext_links'],row['fulltext_links'])
                    self.assertEqual(value['description_provenance'],row['description_provenance'])
                    self.assertEqual(value['digital_url'],row['digital_url'])
                    self.assertEqual(value['search_providers'],row['search_providers'])
                    self.assertEqual(value['search_provider_attempts'],row['search_provider_attempts'])
                self.assertFalse(saved['relevance_assessment']['verified'])
            finally:os.chdir(previous)


if __name__=='__main__':unittest.main()
