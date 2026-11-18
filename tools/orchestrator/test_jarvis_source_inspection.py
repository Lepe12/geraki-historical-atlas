"""Offline security and historical evidence tests; no external HTTP."""
import unittest
import sys
import types
from unittest.mock import patch
from jarvis_source_inspection import allowed,document_candidate,archive_file_links,read,inspect
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

    def test_public_eie_pdf_is_inspectable_but_doi_catalogue_is_not_a_readable_work(self):
        self.assertTrue(allowed('https://helios.eie.gr/helios/bitstream/10442/18865/1/Koutzakiotis%202023.pdf'))
        self.assertFalse(document_candidate('https://doi.org/10.1234/catalogue'))
        row={'records':[{'url':'https://helios.eie.gr/helios/bitstream/10442/18865/1/Koutzakiotis%202023.pdf','title':'Historical research'}]}
        result=inspect([row],target='Ierapetra, Crete',aliases=['Hugues Creveliers'],
                       reader=lambda url:{'status':'DOCUMENT_READ','text':'A Creveliers expedition to Ierapetra',
                                         'pages_read':12,'total_pages':12,'partial':False,
                                         'page_excerpts':[{'pdf_page':11,'text':'Creveliers in Ierapetra'}]})
        self.assertEqual(result['inspected_count'],1)
        self.assertEqual(result['inspected_pages'][0]['pages_read'],12)
        self.assertEqual(result['inspected_pages'][0]['page_excerpts'][0]['pdf_page'],11)
        self.assertEqual(result['inspected_pages'][0]['status'],'CO_OCCURRENCE_NEEDS_REVIEW')
        self.assertFalse(result['historically_verified'])

    def test_pdf_reader_does_not_stop_at_first_six_pages(self):
        class Resp:
            headers={'Content-Type':'application/pdf'}
            def __enter__(self):return self
            def __exit__(self,*a):pass
            def geturl(self):return 'https://helios.eie.gr/public.pdf'
            def read(self,n):return b'%PDF-test'
        class Opener:
            def open(self,req,timeout):return Resp()
        class PDF:
            is_encrypted=False
            pages=[types.SimpleNamespace(extract_text=lambda i=i: 'Other page' if i!=7 else 'Creveliers Ierapetra') for i in range(11)]
            def __init__(self,*args,**kwargs):pass
        with patch.dict(sys.modules,{'pypdf':types.SimpleNamespace(PdfReader=PDF)}):
            result=read('https://helios.eie.gr/public.pdf',opener=Opener())
        self.assertEqual(result['status'],'DOCUMENT_READ')
        self.assertEqual(result['pages_read'],11)
        self.assertEqual(result['total_pages'],11)
        self.assertFalse(result['partial'])
        self.assertEqual(result['page_excerpts'][0]['pdf_page'],8)

    def test_planner_authorizes_fallback_only_for_source_genealogy(self):
        from jarvis_specialist_plan import build
        plan=build('Ierapetra, Crete','Investigate Hugues Creveliers raid on Ierapetra 1675',
                   '1665-1680',['Ierapetra','Hugues Creveliers','Crevellier'])
        route_by_agent={x['agent_id']:x.get('supplemental_inspection') for x in plan['agents']}
        self.assertIn('source_genealogy',route_by_agent)
        fallback=route_by_agent['source_genealogy']
        self.assertEqual(fallback['authority'],'JARVIS_PLANNER')
        self.assertEqual(fallback['route_type'],'public_web_read_only')
        self.assertIn('Creveliers',fallback['query'])
        self.assertTrue(all(v is None for k,v in route_by_agent.items() if k!='source_genealogy'))

    def test_public_web_fallback_is_planner_authorized_and_readonly(self):
        from jarvis_specialist_worker import _planned_public_inspection
        import json
        cfg={'authority':'JARVIS_PLANNER','route_type':'public_web_read_only',
             'query':'Ψάξε στο Internet ιστορικές πηγές για Creveliers Ierapetra','max_results':3}
        agent={'agent_id':'source_genealogy','supplemental_inspection':cfg}
        class Proc:
            stdout=json.dumps({'records':[{'url':'https://helios.eie.gr/research.pdf',
                                                 'title':'Research work'}]})
        with patch('jarvis_specialist_worker.subprocess.run',return_value=Proc()) as mocked:
            outcome=_planned_public_inspection(agent,{})
        self.assertEqual(outcome['status'],'EXECUTED')
        self.assertEqual(len(outcome['records']),1)
        self.assertEqual(mocked.call_args.args[0][0],'node')
        agent['supplemental_inspection']['authority']='UNTRUSTED'
        with self.assertRaisesRegex(RuntimeError,'UNAUTHORIZED'):
            _planned_public_inspection(agent,{})

    def test_archive_metadata_follows_only_original_item_and_pdf(self):
        aggregator='https://www.openarchives.gr/aggregator-openarchives/edm/helios/000024-10442_18865?language=en'
        landing='https://helios.eie.gr/helios/handle/10442/18865'
        pdf='https://helios.eie.gr/helios/bitstream/10442/18865/1/Koutzakiotis%202023.pdf'
        self.assertEqual(archive_file_links(aggregator,
          ('<a href="'+landing+'">see original item</a><a href="http://localhost/private">bad</a>').encode()),[landing])
        self.assertEqual(archive_file_links(landing,
          ('<a href="'+pdf+'">PDF</a><a href="https://attacker.test/file.pdf">bad</a>').encode()),[pdf])
        self.assertEqual(archive_file_links(pdf,b'<a href="'+pdf.encode()+b'">PDF</a>'),[])

    def test_catalogue_metadata_reads_original_pdf_in_bounded_two_hops(self):
        aggregator='https://www.openarchives.gr/aggregator-openarchives/edm/helios/000024-10442_18865'
        landing='https://helios.eie.gr/helios/handle/10442/18865'
        pdf='https://helios.eie.gr/helios/bitstream/10442/18865/1/paper.pdf'
        pages={aggregator:('<a href="'+landing+'">Original</a>').encode(),
               landing:('<a href="'+pdf+'">PDF file</a>').encode(),pdf:b'%PDF-test'}
        class Resp:
            def __init__(self,url):
                self.url=url;self.headers={'Content-Type':'application/pdf' if url==pdf else 'text/html'}
            def __enter__(self):return self
            def __exit__(self,*a):pass
            def geturl(self):return self.url
            def read(self,n):return pages[self.url]
        class Opener:
            def open(self,req,timeout):return Resp(req.full_url)
        class PDF:
            is_encrypted=False
            pages=[types.SimpleNamespace(extract_text=lambda:'Creveliers history') for _ in range(8)]
            def __init__(self,*args,**kwargs):pass
        with patch.dict(sys.modules,{'pypdf':types.SimpleNamespace(PdfReader=PDF)}):
            r=read(aggregator,opener=Opener())
        self.assertEqual(r['status'],'DOCUMENT_READ')
        self.assertEqual(r['pages_read'],8)
        self.assertEqual(r['document_url'],pdf)
        self.assertEqual(r['source_chain'],[aggregator,landing,pdf])

if __name__=='__main__':unittest.main()
