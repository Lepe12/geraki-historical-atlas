"""Offline security and historical evidence tests; no external HTTP."""
import unittest
from jarvis_source_inspection import allowed,read,inspect
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

    def test_pdf_not_misrepresented_as_read(self):
        class Resp:
            headers={'Content-Type':'application/pdf'}
            def __enter__(self):return self
            def __exit__(self,*a):pass
            def geturl(self):return 'https://gallica.bnf.fr/test.pdf'
            def read(self,n):raise AssertionError('must not parse PDF as HTML')
        class Opener:
            def open(self,req,timeout):return Resp()
        self.assertEqual(read('https://gallica.bnf.fr/test.pdf',opener=Opener())['status'],
                         'NON_HTML_REQUIRES_DOCUMENT_READER')

if __name__=='__main__':unittest.main()
