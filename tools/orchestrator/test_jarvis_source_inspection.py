"""Offline security and historical evidence tests; no external HTTP."""
import unittest
import sys
import types
from unittest.mock import patch
from jarvis_source_inspection import allowed,document_candidate,read,inspect
from jarvis_specialist_plan import event_queries

class N7SourceInspectionTests(unittest.TestCase):
    def test_urls_are_strictly_public(self):
        for url in ('http://gallica.bnf.fr/a','https://127.0.0.1/a',
                    'https://localhost/','https://bnf.fr.attacker.test/a',
                    'https://user@bnf.fr/a','https://bnf.fr:8080/a','file:///etc/passwd'):
            self.assertFalse(allowed(url),url)
        self.assertTrue(allowed('https://gallica.bnf.fr/ark:/12148/a'))

    def test_real_historical_query_combines_person_place_year(self):
        q=event_queries('Ierapetra, Crete','Investigate the 1675 Creveuil raid',
                        '1665-1680',['Ιεράπετρα','Hugo de Creveuil','Hugues de Creveuil'])
        self.assertTrue(any('Hugo de Creveuil' in x and 'Ierapetra' in x and '1675' in x for x in q))

    def test_cooccurrence_is_never_verified(self):
        rows=[{'records':[{'url':'https://gallica.bnf.fr/ark:/test','title':'A catalogue'},
                          {'url':'https://localhost/private','title':'Unsafe'}]}]
        called=[]
        def reader(url):
            called.append(url)
            return {'status':'PAGE_READ','text':'Hugo de Creveuil and Ierapetra in 1675'}
        r=inspect(rows,target='Ierapetra, Crete',aliases=['Hugo de Creveuil'],reader=reader)
        self.assertEqual(len(called),1)
        self.assertEqual(r['inspected_pages'][0]['status'],'CO_OCCURRENCE_NEEDS_REVIEW')
        self.assertFalse(r['historically_verified'])
        self.assertFalse(r['inspected_pages'][0]['citation_verified'])

    def test_search_echo_is_not_historical_evidence(self):
        search_url='https://archivesdiplomatiques.diplomatie.gouv.fr/search/results?q=%22Hugo+de+Creveuil%22+%22Ierapetra%22+1675'
        self.assertFalse(document_candidate(search_url,'Recherche guidée'))
        self.assertFalse(document_candidate('https://www.internetculturale.it/it/1/home','Home'))
        rows=[{'records':[{'url':search_url,'title':'Recherche guidée'}]}]
        def forbidden(_):raise AssertionError('search result page must never be inspected')
        result=inspect(rows,target='Ierapetra, Crete',aliases=['Hugo de Creveuil'],reader=forbidden)
        self.assertEqual(result['inspected_count'],0)

    def test_pdf_not_misrepresented_as_read(self):
        class Resp:
            headers={'Content-Type':'application/pdf'}
            def __enter__(self):return self
            def __exit__(self,*a):pass
            def geturl(self):return 'https://gallica.bnf.fr/test.pdf'
            def read(self,n):return b'%PDF-1.5 test bytes'
        class Opener:
            def open(self,req,timeout):return Resp()
        class PDF:
            is_encrypted=False
            pages=[types.SimpleNamespace(extract_text=lambda:'Hugo de Creveuil in Ierapetra')]
            def __init__(self,*args,**kwargs):pass
        with patch.dict(sys.modules,{'pypdf':types.SimpleNamespace(PdfReader=PDF)}):
            result=read('https://gallica.bnf.fr/test.pdf',opener=Opener())
        self.assertEqual(result['status'],'DOCUMENT_READ')
        self.assertEqual(result['pages_read'],1)

if __name__=='__main__':unittest.main()
