import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from connectors import repository_connectors as rc
from connectors.http_audit import safe_url,trace,fetch

class HttpAuditTests(unittest.TestCase):
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

    def test_pares_accepts_english_results_not_only_spanish(self):
        with patch.object(rc,'_get',return_value=b'<title>PARES</title>Search results with text: corsairs'):
            status,rows,detail=rc.pares_simancas('corsairs','spanish_simancas')
        self.assertEqual(status,'ARCHIVE_NOT_CONFIRMED')
        self.assertNotEqual(status,'SEARCH_NOT_CONFIRMED')
