import json,unittest
from unittest.mock import patch
from connectors.citation_search import search
class CitationFallback(unittest.TestCase):
    def test_blocked_web_uses_public_catalogues_and_preserves_actual_failure(self):
        def public(q,lane):return 'EXECUTED',[{'title':'A history','url':'https://example.org/book'}],'safe'
        with patch('connectors.citation_search.web_search.search',return_value=('REMOTE_ACCESS_BLOCKED',[],json.dumps({'providers':[{'provider':'exa','code':'HTTP_402'}]}))),patch('connectors.citation_search.PUBLIC_CATALOGUES',(('Test public',public),)):
            status,rows,detail=search('"A history"','greek')
            self.assertEqual(status,'EXECUTED');self.assertEqual(len(rows),1)
            self.assertEqual(json.loads(detail)['providers'][0]['code'],'HTTP_402')
            self.assertEqual(rows[0]['verification_status'],'NEEDS_EVIDENCE')
    def test_all_failures_are_not_a_successful_empty_search(self):
        def blocked(*args):raise TimeoutError('No secret-bearing exception messages in diagnostics')
        with patch('connectors.citation_search.web_search.search',return_value=('REMOTE_ACCESS_BLOCKED',[],'{}')),patch('connectors.citation_search.PUBLIC_CATALOGUES',(('Public',blocked),)):
            status,rows,detail=search('title','greek');self.assertEqual(status,'REMOTE_ACCESS_BLOCKED');self.assertEqual(rows,[])
            self.assertNotIn('secret-bearing',detail)
    def test_existing_web_results_do_not_trigger_extra_calls(self):
        with patch('connectors.citation_search.web_search.search',return_value=('EXECUTED',[{'url':'https://example.org'}],'{}')),patch('connectors.citation_search._lookup') as lookup:
            search('title','greek');lookup.assert_not_called()
