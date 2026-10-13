"""Offline regression controls for retrieval, resumability and verification gates."""
import copy, hashlib, json, os, pathlib, subprocess, sys, tempfile, unittest
from research_relevance import assess, identity, discovery_queries
from review_validation import candidate_digest, digest
TOOLS=pathlib.Path(__file__).resolve().parent

class Reliability(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name)
        self.req={'target':'Milos','aliases':['Μήλος','Melos','Milo'],'date_range':'1660-1680','purpose':'History of the island','target_context':{'type':'place','region_terms':['Aegean','Archipelago']}}
        self.write('request.json',self.req)
        self.env={**os.environ,'PCT_REQUEST_FILE':str(self.root/'request.json'),'PCT_TARGET':'','PCT_RESEARCH_LANE':'travellers'}
    def tearDown(self):self.tmp.cleanup()
    def write(self,path,data):
        p=self.root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data));return p
    def run_tool(self,name,*args,ok=True):
        p=subprocess.run([sys.executable,str(TOOLS/name),*args],cwd=self.root,env=self.env,capture_output=True,text=True)
        if ok:self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        else:self.assertNotEqual(p.returncode,0,p.stdout+p.stderr)
        return p
    def read(self,p):return json.loads((self.root/p).read_text())
    def test_place_collision_and_second_island(self):
        ident=identity(self.req,self.req)
        self.assertEqual(assess({'title':'Melos Zeitschrift für Musik'},ident)['status'],'EXCLUDE_FROM_ACQUISITION')
        self.assertNotEqual(assess({'title':'Biography of Miloš'},ident)['status'],'PRIORITY')
        self.assertNotEqual(assess({'title':'Unknown','url':'https://x/Milos/island/history'},ident)['status'],'PRIORITY')
        self.assertEqual(assess({'title':'Voyage to the island of Milo','year':'1675'},ident)['status'],'PRIORITY')
        self.assertEqual(assess({'title':'Voyage through the Archipelago','year':'1701'},ident)['status'],'PRIORITY')
        second={**self.req,'target':'Naxos','aliases':['Nasso']};other=identity(second,second)
        self.assertEqual(assess({'title':'Voyage to Nasso island'},other)['status'],'PRIORITY')
        self.assertTrue(any('Nasso' in q for q in discovery_queries(other)))
        self.assertFalse(any('Milos' in q for q in discovery_queries(other)))
    def test_queue_resumes_without_silent_truncation(self):
        rows=[{'repository':'Offline catalogue','identifier':str(i),'title':'History of Milos island'} for i in range(5)]
        rows.append({'repository':'Offline catalogue','identifier':'noise','title':'Melos Zeitschrift für Musik'})
        self.write('citation_chase_candidates/repository_candidates.json',{'selected':rows})
        self.env.update(PCT_MAX_ACQUISITION_CANDIDATES='2',PCT_ACQUISITION_BATCHES='1')
        self.run_tool('acquire_library_candidate.py');r=self.read('library_acquisition/acquisition_report.json')
        self.assertEqual((len(r['results']),r['deferred_count'],r['held_count']),(2,3,1))
        self.run_tool('acquire_library_candidate.py');self.run_tool('acquire_library_candidate.py')
        r=self.read('library_acquisition/acquisition_report.json');self.assertEqual((len(r['results']),r['deferred_count']),(5,0))
        self.write('request.json',{**self.req,'target':'Naxos'})
        self.run_tool('acquire_library_candidate.py',ok=False)
    def fixture(self):
        (self.root/'scan.jpg').write_bytes(b'synthetic test image, not historical evidence')
        self.c={'candidate_id':'c1','lane':'travellers','context_excerpt':'Synthetic test passage','title':'Synthetic source','date':'1671'}
        self.write('structured_output/candidate_events.json',{'events':[self.c]})
        self.review={'candidate_id':'c1','decision':'ACCEPT','reviewer':'Synthetic reviewer','original_inspected':True,'source_quality_score':0.8,'source_says':'Synthetic test passage','exact_locator':{'source_id':'synthetic','printed_page':'5','leaf':7},'evidence_examined':[{'path':'scan.jpg','sha256':hashlib.sha256((self.root/'scan.jpg').read_bytes()).hexdigest()}],'candidate_evidence_sha256':candidate_digest(self.c)}
    def test_invalid_review_inputs_rejected_without_writes(self):
        self.fixture()
        for change in ({'original_inspected':'false'},{'source_quality_score':-999},{'source_quality_score':float('nan')},{'source_quality_score':True},{'exact_locator':{'foo':'bar'}},{'evidence_examined':[{'path':'absent','sha256':'0'*64}]},{'candidate_evidence_sha256':'0'*64}):
            self.write('review.json',{**self.review,**change})
            self.run_tool('apply_human_review.py','--lane','travellers','--review-file','review.json',ok=False)
            self.assertFalse((self.root/'human_review/decisions.json').exists())
    def test_valid_human_path_and_stale_claim_rejection(self):
        self.fixture();self.write('review.json',self.review)
        self.run_tool('apply_human_review.py','--lane','travellers','--review-file','review.json')
        self.assertFalse(self.read('structured_output/candidate_events.json')['events'][0]['verified'])
        claim={'candidate_id':'c1','claim_text':'Synthetic test passage','claim_scope':'presence','uncertainties':[],'contradiction_search_status':'SEARCHED_NONE_FOUND','assessment_reviewer':'Synthetic reviewer','assessment_utc':'2026-10-13T00:00:00Z','falsification_targets':['Check synthetic source']}
        self.write('claim_evidence_matrix/claims.json',{'claims':[claim]})
        v={'candidate_id':'c1','decision':'VERIFY','verifier':'Synthetic verifier','claim_text':claim['claim_text'],'claim_scope':claim['claim_scope'],'claim_matrix_sha256':digest(claim),'limitations':[],'source_genealogy_assessment':{'assessment':'Synthetic','evidence_refs':['scan.jpg']},'corroboration_assessment':{'assessment':'Synthetic','evidence_refs':['scan.jpg']}}
        for change in ({'claim_text':'Unrelated assertion'},{'source_genealogy_assessment':'yes'},{'claim_matrix_sha256':'0'*64}):
            self.write('verification.json',{**v,**change});self.run_tool('finalize_verification.py','--lane','travellers','--verification-file','verification.json',ok=False)
        self.write('verification.json',v);self.run_tool('finalize_verification.py','--lane','travellers','--verification-file','verification.json')
        self.assertTrue(self.read('structured_output/candidate_events.json')['events'][0]['verified'])
        (self.root/'scan.jpg').write_bytes(b'modified')
        self.run_tool('finalize_verification.py','--lane','travellers','--verification-file','verification.json',ok=False)
    def test_benchmark_url_year_does_not_count(self):
        self.write('benchmark.json',{'cases':[{'id':'case','label':True,'expected_year':1671,'expected_place':'Milos','expected_event_family':'CAPTURE'}]})
        ep='evidence/runs/test/travellers/structured_output/candidate_events.json'
        self.write(ep,{'events':[{'context_excerpt':'A capture at Milos in 1900','url':'https://example/1671'}]})
        self.run_tool('evaluate_live_benchmark.py','--run-id','test','--case-id','case','--benchmark','benchmark.json')
        r=self.read('benchmarks/results/test-case.json');self.assertEqual(r['true_positive'],0);self.assertIsNone(r['precision']);self.assertIsNone(r['unsupported_claim_rate'])
        self.write(ep,{'events':[{'context_excerpt':'A capture at Milos in 1671'}]+[{'context_excerpt':'irrelevant'}]*99})
        self.run_tool('evaluate_live_benchmark.py','--run-id','test','--case-id','case','--benchmark','benchmark.json')
        r=self.read('benchmarks/results/test-case.json');self.assertEqual(r['true_positive'],1);self.assertEqual(r['unmatched_candidate_count'],99);self.assertIsNone(r['precision'])
    def test_specialist_records_feed_common_candidates(self):
        self.write('lane_discovery/travellers.json',{'results':[],'attempts':[]})
        self.write('specialist_sources/test/result.json',{'agent_id':'test','search_runs':[{'repository':'Offline','status':'EXECUTED','records':[{'identifier':'x','title':'History of Milos island'}]}]})
        self.run_tool('merge_specialist_candidates.py');self.run_tool('merge_repository_candidates.py')
        row=self.read('citation_chase_candidates/repository_candidates.json')['selected'][0]
        self.assertEqual(row['specialist_agent'],'test');self.assertEqual(row['relevance_assessment']['status'],'PRIORITY')

if __name__=='__main__':unittest.main()
