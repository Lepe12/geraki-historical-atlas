"""Deterministic protocol tests with simulated model responses; no live API use."""
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from semantic_research_answer import collect,batches,execute,validate_items,configuration,render
from llm_client import call

TEXT='In 1677 the ships attacked the island. The account is uncertain.'

def fixture(root,lane='travellers',url='https://example.org/source'):
    base=Path(root)/lane
    (base/'structured_output').mkdir(parents=True)
    (base/'library_acquisition').mkdir()
    (base/'library_acquisition/doc.txt').write_text(TEXT)
    f={'finding_id':'fixture','file':'doc.txt','url':url,'title':'Synthetic source',
       'source_text_sha256':hashlib.sha256(TEXT.encode()).hexdigest(),
       'evidence_excerpt':TEXT,'years_in_scope':[1677],'date_basis':'EXPLICIT_PARAGRAPH',
       'uncertainties':['ORIGINAL_NOT_INSPECTED'],
       'locator':{'start_char':0,'end_char':len(TEXT),'start_line':1,'end_line':1}}
    (base/'structured_output/extracted_findings.json').write_text(json.dumps({'findings':[f]}))

def response(value):return {'status':'COMPLETED','provider':'simulated-test','model':'fixture','content':json.dumps(value)}

def item(eid,**changes):
    return {'statement':'Η πηγή περιγράφει επίθεση το 1677.','evidence_id':eid,'quote':TEXT,
            'kind':'source_statement','actors':[],'places':[],'dates':['1677'],'uncertainty':[],**changes}

class SemanticAnswer(unittest.TestCase):
    def test_missing_configuration_never_calls_model_or_claims_completion(self):
        with tempfile.TemporaryDirectory() as tmp,patch.dict(os.environ,{},clear=True):
            fixture(tmp)
            def no_call(*args):raise AssertionError('No network when unconfigured')
            out=execute(tmp,'question',caller=no_call)
            self.assertEqual(out['status'],'SOURCE_DOSSIER_AVAILABLE')
            self.assertFalse(out['model_used']);self.assertFalse(out['verified'])
            self.assertEqual(out['calls'],[])
            self.assertEqual(out['claims'][0]['quote'],TEXT)
            self.assertIn('χωρίς υπηρεσία μοντέλου',render(out))

    def test_documentary_dossier_groups_repetitions_and_does_not_infer_events(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);fixture(tmp,'greek','https://example.org/copy')
            out=execute(tmp,'question',config={'configured':False,'missing':[]})
            self.assertEqual(len(out['claims']),1)
            self.assertEqual(len(out['claims'][0]['source_occurrences']),2)
            self.assertEqual(out['claims'][0]['actors'],[])
            self.assertFalse(out['claims'][0]['model_analysis'])
            self.assertEqual(out['documentary_timeline'][0]['meaning'],'DATE_RECORDED_WITH_PASSAGE_NOT_VERIFIED_EVENT')

    def test_documentary_dossier_rejects_tampered_passages(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);(Path(tmp)/'travellers/library_acquisition/doc.txt').write_text('Changed')
            out=execute(tmp,'question',config={'configured':False,'missing':[]})
            self.assertEqual(out['status'],'INSUFFICIENT_ACQUIRED_EVIDENCE')
            self.assertEqual(out['claims'],[])

    def test_modern_latin_namesake_is_held_when_greek_identity_is_requested(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp)
            base=Path(tmp)/'travellers'
            p=base/'structured_output/extracted_findings.json';data=json.loads(p.read_text())
            data['findings'][0]['title']='Boletín Oficial 1971 Pedro Lanza'
            modern=TEXT.replace('1677','1925')
            (base/'library_acquisition/doc.txt').write_text(modern)
            data['findings'][0].update(evidence_excerpt=modern,source_text_sha256=hashlib.sha256(modern.encode()).hexdigest())
            p.write_text(json.dumps(data))
            (base/'run_manifest').mkdir()
            (base/'run_manifest/manifest.json').write_text(json.dumps({'normalized_request':{'target':'Pedro Lanza','aliases':['Πέτρος Λάντζας']}}))
            out=execute(tmp,'question',config={'configured':False,'missing':[]})
            self.assertEqual(out['claims'],[])
            self.assertTrue(any('NAMESAKE_REQUIRES_IDENTITY_REVIEW' in r['reason'] for r in out['coverage']['excluded']+out['coverage']['identity_held']))

    def test_existing_unflagged_namesake_export_is_rechecked_without_changing_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp)
            base=Path(tmp)/'travellers'
            text=TEXT.replace('1677','1837')
            (base/'library_acquisition/doc.txt').write_text(text)
            p=base/'structured_output/extracted_findings.json';data=json.loads(p.read_text())
            data['findings'][0].update(evidence_excerpt=text,source_text_sha256=hashlib.sha256(text.encode()).hexdigest())
            p.write_text(json.dumps(data))
            (base/'run_manifest').mkdir()
            (base/'run_manifest/manifest.json').write_text(json.dumps({'normalized_request':{'target':'Πέτρος Λάντζας','aliases':['Pietro Lanza']}}))
            before=p.read_bytes()
            out=execute(tmp,'question',config={'configured':False,'missing':[]})
            self.assertEqual(out['claims'],[])
            self.assertEqual(out['coverage']['excluded'][0]['reason'],'LATER_NAMESAKE_REQUIRES_IDENTITY_REVIEW')
            self.assertEqual(p.read_bytes(),before)

    def test_modern_publication_does_not_date_the_historical_person(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp)
            base=Path(tmp)/'travellers';p=base/'structured_output/extracted_findings.json'
            data=json.loads(p.read_text());data['findings'][0]['title']='A modern study published in 2014'
            p.write_text(json.dumps(data));(base/'run_manifest').mkdir()
            (base/'run_manifest/manifest.json').write_text(json.dumps({'normalized_request':{'target':'Πέτρος Λάντζας','aliases':['Pietro Lanza']}}))
            out=execute(tmp,'question',config={'configured':False,'missing':[]})
            self.assertEqual(len(out['claims']),1)
            self.assertEqual(out['coverage']['identity_held'],[])

    def test_configuration_does_not_leak_key(self):
        env={'PCT_LLM_PROVIDER':'openai_compatible','PCT_LLM_BASE_URL':'https://example.org/v1',
             'PCT_LLM_API_KEY':'secret-test-do-not-return','PCT_LLM_EXTRACTOR_MODEL':'m',
             'PCT_LLM_SYNTHESIS_MODEL':'m','PCT_LLM_ADVERSARIAL_MODEL':'m'}
        with patch.dict(os.environ,env,clear=True):
            self.assertTrue(configuration()['configured'])
            self.assertNotIn(env['PCT_LLM_API_KEY'],json.dumps(configuration()))

    def test_identical_passages_group_without_claiming_independence(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);fixture(tmp,'greek','https://example.org/copy')
            rows,excluded=collect(tmp)
            self.assertEqual(len(rows),1);self.assertEqual(len(rows[0]['occurrences']),2)
            self.assertEqual(rows[0]['source_independence'],'UNKNOWN_NOT_ESTABLISHED')
            self.assertEqual(excluded,[])

    def test_tampered_acquired_text_cannot_be_used(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);(Path(tmp)/'travellers/library_acquisition/doc.txt').write_text('Changed')
            rows,excluded=collect(tmp)
            self.assertEqual(rows,[]);self.assertEqual(excluded[0]['reason'],'ACQUIRED_TEXT_OR_LOCATOR_MISMATCH')

    def test_unsupported_quote_entity_date_and_verification_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);rows,_=collect(tmp);eid=rows[0]['evidence_id']
            for changes in ({'quote':'Invented passage which is not in the source.'},{'actors':['Someone Else']},{'dates':['1680']},{'verified':True},{'evidence_id':'invented'},{'evidence_id':[]}):
                ok,bad=validate_items({'items':[item(eid,**changes)]},rows)
                self.assertEqual(ok,[]);self.assertTrue(bad)

    def test_call_budget_retains_explicit_deferred_coverage(self):
        rows=[{'evidence_id':str(i),'text':'x'*90} for i in range(8)]
        groups,deferred=batches(rows,max_batches=2,budget=200)
        self.assertEqual(len(groups),2);self.assertEqual(len(deferred),6)

    def run_pipeline(self,root,bad_review=False,bad_synthesis=False,fail_role=None):
        rows,_=collect(root);eid=rows[0]['evidence_id'];state={}
        def caller(role,prompt):
            if role==fail_role:return {'status':'FALLBACK_REQUIRED','error':'NETWORK_UNAVAILABLE'}
            if role=='evidence_extractor':return response({'items':[item(eid)]})
            if role=='adversarial_reviewer':
                claims=json.loads(prompt.split('CLAIMS_JSON:\n')[1]);cid=claims[0]['claim_id'];state['cid']=cid
                return response({'supported_claim_ids':['fake' if bad_review else cid],'flagged_claims':[],
                    'contradictions':[],'limitations':['Synthetic review only']})
            if role=='synthesis':return response({'answer_sections':[{'text':'Σύμφωνα με την πηγή, καταγράφεται επίθεση το 1677.',
                'claim_ids':['fake' if bad_synthesis else state['cid']]}],'unknowns':['Actor not identified'],'limitations':[]})
            raise AssertionError(role)
        return execute(root,'Synthetic question',caller=caller,config={'configured':True,'missing':[]})

    def test_full_model_flow_keeps_valid_citations_and_verification_separate(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);out=self.run_pipeline(tmp)
            self.assertEqual(out['status'],'MODEL_ANSWER_PENDING_HUMAN_REVIEW')
            self.assertEqual([c['role'] for c in out['calls']],['evidence_extractor','adversarial_reviewer','synthesis'])
            self.assertTrue(out['model_used']);self.assertFalse(out['verified']);self.assertFalse(out['human_reviewed'])
            self.assertIn('https://example.org/source',render(out))

    def test_unknown_review_and_answer_citations_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp)
            self.assertEqual(self.run_pipeline(tmp,bad_review=True)['status'],'REVIEW_FAILED')
            self.assertEqual(self.run_pipeline(tmp,bad_synthesis=True)['status'],'SYNTHESIS_REJECTED_INVALID_CITATIONS')

    def test_provider_failure_preserves_evidence_without_generated_answer(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);out=self.run_pipeline(tmp,fail_role='evidence_extractor')
            self.assertEqual(out['status'],'EXTRACTION_FAILED_OR_UNSUPPORTED')
            self.assertTrue(out['evidence']);self.assertEqual(out['answer_sections'],[])

    def test_client_rejects_credential_url_and_redacts_exception(self):
        env={'PCT_LLM_PROVIDER':'openai_compatible','PCT_LLM_SYNTHESIS_MODEL':'m','PCT_LLM_API_KEY':'test-secret',
             'PCT_LLM_BASE_URL':'https://user:password@example.org/v1'}
        with patch.dict(os.environ,env,clear=True):
            self.assertEqual(call('synthesis','test')['error'],'INVALID_LLM_BASE_URL')
        env['PCT_LLM_BASE_URL']='https://example.org/v1'
        with patch.dict(os.environ,env,clear=True),patch('urllib.request.urlopen',side_effect=RuntimeError('test-secret')):
            out=call('synthesis','test')
            self.assertEqual(out['error'],'RuntimeError');self.assertNotIn('test-secret',json.dumps(out))

if __name__=='__main__':unittest.main()
