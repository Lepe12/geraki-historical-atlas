import json
import os
import unittest
import urllib.error
from unittest.mock import patch
import web_search as web


class WebSearchTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{'SERPAPI_API_KEY':'google-test-secret',
                                     'BRAVE_SEARCH_API_KEY':'brave-test-secret'})
        self.env.start();self.addCleanup(self.env.stop)

    @patch.object(web,'_request_json')
    def test_two_providers_preserve_snippets_pdf_and_duplicate_provenance(self,request):
        url='https://university.example/paper.pdf'
        def response(endpoint,headers):
            if 'serpapi.com' in endpoint:
                return {'organic_results':[{'title':'Historical study','link':url,'snippet':'Pedro Lanza in correspondence'}],
                        'serpapi_pagination':{'next':'https://serpapi.com/search.json?start=10'}}
            self.assertEqual(headers['X-Subscription-Token'],'brave-test-secret')
            return {'web':{'results':[{'title':'Historical study','url':url+'#page=2','description':'A citation'}]},
                    'query':{'more_results_available':True}}
        request.side_effect=response
        status,rows,detail=web.search('"Pedro Lanza"','travellers','Public Web Source Discovery')
        self.assertEqual(status,'EXECUTED');self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['search_providers'],['google','brave'])
        self.assertEqual(rows[0]['digital_url'],url)
        self.assertIn('Pedro Lanza',rows[0]['description'])
        self.assertEqual(rows[0]['verification_status'],'UNVERIFIED_DISCOVERY')
        self.assertEqual(request.call_count,2)
        self.assertTrue(all(a['pagination']=='FIRST_PAGE_ONLY' for a in json.loads(detail)['providers']))
        self.assertNotIn('google-test-secret',detail)
        self.assertNotIn('brave-test-secret',json.dumps(rows))

    @patch.object(web,'_request_json')
    def test_failed_google_does_not_block_brave_or_leak_error_url(self,request):
        def response(url,headers):
            if 'serpapi.com' in url:raise urllib.error.HTTPError(url,429,'secret',{},None)
            return {'web':{'results':[{'title':'Archive document','url':'https://archive.example/item'}]}}
        request.side_effect=response
        status,rows,detail=web.search('name','travellers','Public Web Source Discovery')
        self.assertEqual(status,'EXECUTED');self.assertEqual(len(rows),1)
        self.assertEqual(json.loads(detail)['providers'][0]['status'],'REMOTE_RATE_LIMITED')
        self.assertNotIn('google-test-secret',detail)

    @patch.object(web,'_request_json')
    def test_missing_credentials_are_not_a_completed_empty_search(self,request):
        with patch.dict(os.environ,{'SERPAPI_API_KEY':'','BRAVE_SEARCH_API_KEY':''}):
            status,rows,detail=web.search('name','greek','Academia.edu Public Research','academia.edu')
        self.assertEqual(status,'API_KEY_REQUIRED');self.assertEqual(rows,[])
        self.assertTrue(all(not a['request_performed'] for a in json.loads(detail)['providers']))
        request.assert_not_called()

    @patch.object(web,'_request_json')
    def test_only_one_key_still_searches_and_reports_missing_second_provider(self,request):
        request.return_value={'web':{'results':[]},'query':{'more_results_available':False}}
        with patch.dict(os.environ,{'SERPAPI_API_KEY':''}):
            status,rows,detail=web.search('name','travellers','Public Web Source Discovery')
        self.assertEqual(status,'EXECUTED');self.assertEqual(rows,[])
        self.assertEqual(json.loads(detail)['providers'][0]['status'],'API_KEY_REQUIRED')
        request.assert_called_once()

    @patch.object(web,'_request_json')
    def test_unrecognized_responses_and_provider_errors_are_not_empty_success(self,request):
        for payload in ({}, {'error':'error with google-test-secret'}, {'organic_results':{}},[] ):
            with self.subTest(payload=payload):
                request.return_value=payload
                status,rows,detail=web.search('name','travellers','Public Web Source Discovery')
                self.assertNotEqual(status,'EXECUTED');self.assertEqual(rows,[])
                self.assertNotIn('google-test-secret',detail)

    @patch.object(web,'_request_json')
    def test_site_scope_is_enforced_and_queries_do_not_become_source_evidence(self,request):
        request.return_value={'organic_results':[
            {'title':'Valid','link':'https://scholar.academia.edu/paper','snippet':'Source snippet'},
            {'title':'Wrong host','link':'https://academia.edu.evil.example/paper'},
            {'title':'Script','link':'javascript:alert(1)'}]}
        with patch.dict(os.environ,{'BRAVE_SEARCH_API_KEY':''}):
            status,rows,detail=web.search('target','greek','Academia.edu Public Research','academia.edu')
        self.assertEqual(status,'EXECUTED');self.assertEqual(len(rows),1)
        self.assertIn('site:academia.edu',rows[0]['search_query'])
        self.assertEqual(rows[0]['description'],'Source snippet')


if __name__=='__main__':unittest.main()
