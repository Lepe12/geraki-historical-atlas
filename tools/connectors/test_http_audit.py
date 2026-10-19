import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from connectors import repository_connectors as rc
from connectors.http_audit import safe_url,trace,fetch

class HttpAuditTests(unittest.TestCase):
    def test_anemi_keeps_empty_metadata_icon_and_reads_its_own_result_row(self):
        raw=b'''<table><tr><td>Title: A real catalogue title</td><td>Creator: A. Author</td>
        <td><a href="?offset=1&amp;srfile=/metadata/0/a/metadata-123.tkl"><img src="icon.png"/></a></td></tr>
        <tr><td>Title: Another catalogue title</td><td><a href="?offset=2&amp;srfile=/metadata/0/b/metadata-456.tkl"></a></td></tr></table>'''
        with patch('connectors.http_audit.anemi_search',return_value=raw):
            status,rows,_=rc.anemi_public('corsair','greek')
        self.assertEqual(status,'EXECUTED')
        self.assertEqual([r['title'] for r in rows],['A real catalogue title','Another catalogue title'])
        self.assertTrue(rows[0]['url'].startswith('https://anemi.lib.uoc.gr/search/?'))
        self.assertEqual(rows[0]['evidence_level'],'CATALOGUE_METADATA_ONLY')

    def test_pares_http_429_is_rate_limited_not_an_empty_or_blocked_search(self):
        with patch.object(rc,'_get',side_effect=HTTPError('https://pares.cultura.gob.es/search',429,'wait',{'Retry-After':'120'},None)):
            status,rows,detail=rc.audited_dispatch('PARES / Archivo General de Simancas','corsarios','spanish_simancas')
        self.assertEqual(status,'REMOTE_RATE_LIMITED')
        self.assertEqual(rows,[])
        self.assertIn('HTTP_429',detail)

    def test_anemi_form_response_is_not_evidence_of_an_executed_search(self):
        with patch('connectors.http_audit.anemi_search',return_value=b'<html><h1>Simple Search</h1><form></form></html>'):
            status,rows,_=rc.anemi_public('Crete','greek')
        self.assertEqual(status,'SEARCH_NOT_CONFIRMED')
        self.assertEqual(rows,[])

    def test_moreveneto_searches_descriptive_fields_and_keeps_metadata_unverified(self):
        config={'communication':{'providers':{'apollo':{'baseUrl':'https://asve.arianna4.cloud//apollo/'}}}}
        response={'data':{'search':{'totalCount':1,'results':{'items':[{'id':'fixture-1','label':'Fixture catalogue record','text':'Corsari in a description'}]}}}}
        with patch.object(rc,'_json',return_value=config),patch('connectors.http_audit.fetch',return_value=json.dumps(response).encode()) as fetcher:
            status,rows,detail=rc.moreveneto_public('corsari','venetian')
        self.assertEqual(status,'EXECUTED')
        self.assertIn('fields.*',json.loads(fetcher.call_args.kwargs['data'])['query'])
        self.assertEqual(rows[0]['evidence_level'],'CATALOGUE_METADATA_ONLY')
        self.assertIsNone(rows[0]['url'])

    def test_credentials_never_in_url_receipts(self):
        self.assertNotIn('private',safe_url('https://example.org/search?apiKey=private&query=corsairs'))

    def test_http_failure_retains_actual_status_without_exception_url(self):
        with patch('urllib.request.urlopen',side_effect=HTTPError('https://example.org/?apiKey=private',403,'denied',{},None)):
            with trace() as rows:
                with self.assertRaises(HTTPError):fetch('https://example.org/?apiKey=private')
        self.assertEqual(rows[0]['http_status'],403)
        self.assertNotIn('private',json.dumps(rows))

    def test_nlg_uses_native_form_and_only_document_links(self):
        raw=b'<a href="/nlg-repo/dl/el/search.html">Navigation</a><a href="/nlg-repo/dl/el/browse/123">A manuscript</a>'
        with patch.object(rc,'_get',return_value=raw) as get:
            status,rows,detail=rc.nlg_public('corsairs','greek')
        self.assertEqual(len(rows),1)
        self.assertIn('p.text=corsairs',get.call_args.args[0])

    def test_relative_record_urls_resolve_against_the_actual_search_path(self):
        with patch.object(rc,'_get',return_value=b'<a href="pagina.pl?TipoPag=comparc&Chiave=42">A real archival record</a>'):
            rows=rc._html_search('https://example.org/cgi-bin/pagina.pl?q=corsari','SIAS','italian_states','https://example.org')
        self.assertEqual(rows[0]['url'],'https://example.org/cgi-bin/pagina.pl?TipoPag=comparc&Chiave=42')

    def test_pares_accepts_english_results_not_only_spanish(self):
        with patch.object(rc,'_get',return_value=b'<title>PARES</title>Search results with text: corsairs'):
            status,rows,detail=rc.pares_simancas('corsairs','spanish_simancas')
        self.assertEqual(status,'ARCHIVE_NOT_CONFIRMED')
        self.assertNotEqual(status,'SEARCH_NOT_CONFIRMED')

    def test_simancas_mention_in_another_archives_record_does_not_pass(self):
        raw=b'''<div id="nombre_archivo">Archivo Historico Nacional</div>
        Reference code: ES.28079.AHN. Scope: a letter mentions Archivo General de Simancas.'''
        with patch.object(rc,'_get',return_value=raw):
            status,rows,_=rc.pares_simancas('1234','spanish_simancas')
        self.assertEqual(status,'RECORD_NOT_CONFIRMED');self.assertEqual(rows,[])

    def test_simancas_header_and_source_title_are_parsed(self):
        raw=b'''<meta property="og:title" content="Letter from d'Amico in 1670"/>
        <div class="archive" id = "nombre_archivo"><a>Archivo General de Simancas</a></div>
        Reference code: ES.47161.AGS/1. Context. Date of formation: 1670 Level of description: Letter'''
        with patch.object(rc,'_get',return_value=raw):
            status,rows,_=rc.pares_simancas('1234','spanish_simancas')
        self.assertEqual(status,'EXECUTED')
        self.assertIn("d'Amico",rows[0]['title']);self.assertEqual(rows[0]['date'],['1670'])
