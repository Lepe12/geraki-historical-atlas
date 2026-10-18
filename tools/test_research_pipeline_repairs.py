"""Regression cases from interrupted discovery and source-acquisition audit."""
import json,os,pathlib,runpy,shutil,subprocess,sys,tempfile,unittest
from unittest.mock import patch
from web_acquisition import acquire,public_url,bibliographic_queries
from research_relevance import identity
from orchestrator.jarvis_state_board import lane_state
from orchestrator.build_command_center_snapshot import build
TOOLS=pathlib.Path(__file__).parent.resolve()

class PipelineRepairs(unittest.TestCase):
    def test_citation_search_requires_matching_work_not_just_a_pdf(self):
        from web_acquisition import citation_title_match
        query='Los contactos de la Chimarra con el reino de Nápoles durante el siglo XVI'
        self.assertTrue(citation_title_match(query,{'title':query}))
        self.assertFalse(citation_title_match(query,{'title':'Codice Etico Gruppo Havant','digital_url':'https://example.org/file.pdf'}))
        self.assertFalse(citation_title_match(query,{'title':'Pietro Lanza company history'}))

    def test_reference_sections_include_unquoted_academic_titles(self):
        text='Παραπομπές\n↑ «Από τη Γαληνοτάτη στον Καθολικότατο: Οι φουρτούνες του Καπετάν-Πέτρου Λάντζα»\nΠηγές[Επεξεργασία]\nGürkan, Emrah Safa (2012). Espionage in the 16th Century Mediterranean: Secret Diplomacy and Rivalry. Washington: University.\n'
        queries=bibliographic_queries(text)
        self.assertTrue(any('Γαληνοτάτη' in q for q in queries))
        self.assertIn('Espionage in the 16th Century Mediterranean: Secret Diplomacy and Rivalry',queries)
        self.assertEqual(bibliographic_queries('References: «With the outbreak of the war, ... within the Greek territory»'),[])
        self.assertEqual(bibliographic_queries('He said "This is just an unrelated narrative quotation".'),[])

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
    def write(self,path,obj):
        p=self.root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(obj));return p
    def tool(self,name,target='Synthetic Person'):
        env={**os.environ,'PCT_TARGET':target,'PCT_ALIASES':'','PCT_DATE_RANGE':'1577-1583','PCT_PURPOSE':'source research','PCT_RESEARCH_LANE':'travellers'}
        r=subprocess.run([sys.executable,str(TOOLS/name)],cwd=self.root,env=env,capture_output=True,text=True)
        self.assertEqual(r.returncode,0,r.stdout+r.stderr)
    def test_rounds_visit_every_repository_and_resume_without_duplicate_calls(self):
        req={'target':'Synthetic Person','aliases':[]}
        plan={**req,'target_identity':identity(req,req),'repositories':[{'name':str(i),'base_url':'https://example.org'} for i in range(7)]}
        self.write('repository_plans/travellers.json',plan);calls=[]
        def query(name,q,lane):
            calls.append((name,q));return 'EXECUTED',[{'identifier':name+q,'discovery_repository':name,'title':'Synthetic Person'}],'fixture'
        previous=os.getcwd()
        try:
            os.chdir(self.root)
            with patch.dict(os.environ,{'PCT_RESEARCH_LANE':'travellers','PCT_DISCOVERY_ROUNDS_PER_PASS':'1'}),patch('connectors.repository_connectors.dispatch',side_effect=query):
                runpy.run_path(str(TOOLS/'lane_repository_discovery.py'))
                first=json.loads(pathlib.Path('lane_discovery/travellers.json').read_text())
                self.assertEqual({n for n,q in calls},{str(i) for i in range(7)})
                self.assertTrue(first['partial'])
                runpy.run_path(str(TOOLS/'lane_repository_discovery.py'))
        finally:os.chdir(previous)
        self.assertEqual(len(calls),len(set(calls)))
        self.assertGreater(len(calls),7)
    def test_failed_or_partial_lane_is_not_published_as_completed(self):
        base=self.root/'evidence/runs/123/travellers'
        self.write('evidence/runs/123/travellers/system_health/workflow_execution.json',{'execution_status':'failure'})
        self.write('evidence/runs/123/travellers/research_lanes/travellers.json',{'normalized_request':{'target':'Synthetic Person'}})
        state=lane_state(base.parent,'travellers')
        self.assertEqual(state['execution_status'],'FAILED')
        self.write('evidence/runs/123/JARVIS_STATE_BOARD.json',{'lanes':[state]})
        snapshot=build(self.root,'123')
        self.assertEqual(snapshot['mission']['status'],'FAILED')
        self.assertEqual(snapshot['agents'][0]['status'],'FAILED')
        self.assertEqual(snapshot['events'][-1]['event_type'],'agent_failed')
    def test_social_post_is_retained_but_not_an_event(self):
        self.write('lane_discovery/travellers.json',{'results':[{'title':'Synthetic Person corsair in 1578','description':'Synthetic Person pirate attacked the harbour in 1578.','url':'https://www.instagram.com/p/test/','discovery_repository':'Web'}]})
        self.tool('event_first_search.py')
        report=json.loads((self.root/'event_first_hits/event_hits.json').read_text())
        self.assertTrue(report['catalogue_leads'])
        self.assertTrue(all(x['status']=='SOCIAL_POST_DISCOVERY_ONLY' for x in report['catalogue_leads']))
        self.tool('verification_pipeline.py')
        self.assertEqual(json.loads((self.root/'structured_output/candidate_events.json').read_text())['events'],[])
    def test_person_is_not_a_place(self):
        self.write('event_first_hits/event_hits.json',{'hits':[],'catalogue_leads':[{'status':'CATALOGUE_METADATA_LEAD','place_match':'Synthetic Person','years_in_scope':[1578],'event_terms':['pirate'],'context_excerpt':'Synthetic Person pirate in 1578'}]})
        self.tool('verification_pipeline.py')
        candidate=json.loads((self.root/'structured_output/candidate_events.json').read_text())['events'][0]
        self.assertIsNone(candidate['place'])
        self.assertEqual(candidate['target_entity']['kind'],'person')
        self.assertFalse(candidate['verified'])
    def test_public_url_and_social_guards(self):
        for url in ['http://127.0.0.1/x','http://169.254.169.254/x','file:///etc/passwd','https://user:pass@example.org/x']:
            with self.assertRaises(ValueError):public_url(url,resolve=False)
        with self.assertRaises(ValueError):acquire('https://instagram.com/p/x',self.root,fetcher=lambda u:None)
    def test_linked_document_and_citation_title_provenance(self):
        source=b'<html><p>A publication &lt;&lt;A historical bibliography of maritime correspondence&gt;&gt;</p><a href="/bitstream/document.txt">PDF</a><p>'+b'source text '*20+b'</p></html>'
        def remote(url):
            if url.endswith('.txt'):return b'plain linked archival text '*10,'text/plain',url
            return source,'text/html',url
        result=acquire('https://archive.example/source',self.root,fetcher=remote)
        self.assertEqual(result['status'],'TEXT_ACQUIRED')
        self.assertEqual(result['linked_documents'][0]['url'],'https://archive.example/bitstream/document.txt')
        self.assertEqual(result['bibliographic_queries'],['A historical bibliography of maritime correspondence'])
        self.assertFalse(result['original_inspected'])
        self.assertTrue(all(pathlib.Path(f).exists() for f in result['files']))
    def test_pdf_redirect_to_html_is_not_reported_as_acquired_pdf(self):
        with self.assertRaisesRegex(ValueError,'EXPECTED_PDF_NOT_RETURNED'):
            acquire('https://archive.example/paper.pdf',self.root,fetcher=lambda u:(b'<html>unrelated redirected page</html>','text/html','https://other.example/'))
    def test_greek_person_inflections_are_search_hypotheses(self):
        from candidate_context import variants,assess
        terms=variants('Ανδρέα Νικολάου',[])
        self.assertIn('Ανδρέας Νικολάου',terms)
        hits=assess('Ανδρέας Νικολάου pirate 1578.',terms,1577,1583,target_kind='person')
        self.assertTrue(any(h['decision']=='RETAIN_CANDIDATE' for h in hits))
    def test_mixed_citation_quote_marks(self):
        self.assertEqual(bibliographic_queries('Η δημοσίευση << Α historical correspondence study of maritime sources»'),['Α historical correspondence study of maritime sources'])
    @unittest.skipUnless(shutil.which('pdftotext'),'poppler required')
    def test_real_pdf_extraction_keeps_scan_indexes_not_invented_printed_pages(self):
        # A minimal two-page PDF, generated offline without package dependencies.
        objs=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
              b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
              b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
        for line in [b'First source page',b'Second source page']:
            stream=b'BT /F1 12 Tf 72 720 Td ('+line+b') Tj ET'
            objs.append(b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream')
        data=b'%PDF-1.4\n';offsets=[0]
        for i,obj in enumerate(objs,1):offsets.append(len(data));data+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
        xref=len(data);data+=b'xref\n0 8\n0000000000 65535 f \n'+b''.join(f'{o:010d} 00000 n \n'.encode() for o in offsets[1:])+b'trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF'
        result=acquire('https://archive.example/paper.pdf',self.root,fetcher=lambda u:(data,'application/pdf',u))
        self.assertEqual([p['scan_index_0_based'] for p in result['pages']],[0,1])
        self.assertTrue(all(p['printed_page'] is None for p in result['pages']))
        text=pathlib.Path(next(f for f in result['files'] if f.endswith('.txt'))).read_text()
        self.assertIn('Second source page',text)
        self.assertFalse(result['original_inspected'])

if __name__=='__main__':unittest.main()
