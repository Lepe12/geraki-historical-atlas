import json
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from research_geographic_findings import build as geographic
from research_validation_report import build as validation
from semantic_research_answer import configuration,validate_items

class ResearchEngineValidationTests(unittest.TestCase):
    def test_person_research_is_not_rejected_for_missing_place_findings(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'123';lane=root/'greek';answer=root/'research_answer'
            for folder in (lane/'library_acquisition',lane/'run_manifest',lane/'repository_plans',answer):folder.mkdir(parents=True)
            (lane/'run_manifest/manifest.json').write_text(json.dumps({'normalized_request':{'target':'Πέτρος Λάντζας','aliases':['Pedro Lantzas']}}))
            (lane/'library_acquisition/acquisition_report.json').write_text(json.dumps({'results':[{'status':'TEXT_ACQUIRED','url':'https://example.org/source','files':['library_acquisition/source.pdf','library_acquisition/source.txt']}]}))
            (lane/'repository_plans/greek.json').write_text(json.dumps({'semantic_query_expansion':{'output_status':'MODEL_QUERIES_AVAILABLE'}}))
            raw='Η πηγή κατονομάζει τον Πέτρο.\r\n'.encode()
            source=lane/'library_acquisition/source.txt';source.write_bytes(raw)
            occurrence={'url':'https://example.org/source','acquired_text_path':'greek/library_acquisition/source.txt',
                        'source_text_sha256':hashlib.sha256(raw).hexdigest(),
                        'locator':{'start_char':0,'end_char':len(raw.decode()),'offset_unit':'UNICODE_CODE_POINTS'}}
            (answer/'answer.json').write_text(json.dumps({'status':'MODEL_ANSWER_PENDING_HUMAN_REVIEW','evidence':[{'id':'e'}],
                'calls':[{'role':r,'status':'COMPLETED'} for r in ('synthesis','evidence_extractor','adversarial_reviewer')],
                'review':{'supported_claim_ids':['c']},'claims':[{'claim_id':'c','verified':False,'quote':raw.decode(),'source_occurrences':[occurrence]}],
                'answer_sections':[{'text':'The source names the person.','claim_ids':['c']}]}))
            report=validation(root,Path(tmp)/'probes')
            self.assertEqual(report['request_kind'],'person')
            self.assertEqual(report['status'],'PROVISIONAL_RESEARCH_PIPELINE_PASSED')
            self.assertEqual(report['durable_citation_replays'][0]['status'],'PASS')
            source.write_bytes(raw.replace(b'\r\n',b'\n'))
            self.assertIn('DURABLE_CITATION_BYTE_REPLAY_FAILED',validation(root,Path(tmp)/'probes')['blockers'])
            source.write_bytes(raw)
            stored=json.loads((answer/'answer.json').read_text())
            stored['answer_sections'][0]['text']='According to the consulted source ...'
            (answer/'answer.json').write_text(json.dumps(stored))
            self.assertIn('INVALID_OR_PLACEHOLDER_CITED_SYNTHESIS',validation(root,Path(tmp)/'probes')['blockers'])
            stored['answer_sections']=[{'text':'The source names the person.','claim_ids':['unknown-claim']}]
            (answer/'answer.json').write_text(json.dumps(stored))
            self.assertIn('ANSWER_CITATIONS_NOT_BOUND_TO_SUPPORTED_CLAIMS',validation(root,Path(tmp)/'probes')['blockers'])
            request=lane/'run_manifest/manifest.json';request.write_text(json.dumps({'normalized_request':{'target':'Μήλος'}}))
            self.assertIn('NO_SUPPORTED_PLACE_FINDINGS',validation(root,Path(tmp)/'probes')['blockers'])

    def test_local_model_configuration_does_not_require_a_fake_api_key(self):
        with patch.dict(os.environ,{'PCT_LLM_PROVIDER':'local_llama_cpp','PCT_LLM_MODEL':'open-model','PCT_LOCAL_MODEL_PATH':'/tmp/model.gguf'},clear=True):
            self.assertTrue(configuration()['configured'])

    def test_whitespace_replay_preserves_original_quote_and_no_word_repairs(self):
        row={'evidence_id':'e','text':'The ship\nanchored in 1670.','years_in_scope':[1670],'occurrences':[], 'uncertainties':[]}
        item={'evidence_id':'e','quote':'The ship anchored in 1670.','statement':'Source statement','kind':'source_statement','dates':['1670']}
        accepted,rejected=validate_items({'items':[item]},[row])
        self.assertEqual(accepted[0]['quote'],row['text'])
        bad={**item,'quote':'The fleet anchored in 1670.'}
        self.assertEqual(validate_items({'items':[bad]},[row])[0],[])

    def test_model_verification_flag_is_rejected(self):
        row={'evidence_id':'e','text':'The ship anchored in 1670.','years_in_scope':[1670],'occurrences':[], 'uncertainties':[]}
        item={'evidence_id':'e','quote':row['text'],'statement':'Source statement','kind':'source_statement','verification_status':'VERIFIED'}
        self.assertEqual(validate_items({'items':[item]},[row])[0],[])

    def test_place_export_never_invents_modern_identity_or_coordinates(self):
        answer={'evidence':[],'review':{'supported_claim_ids':['c']},'claims':[{'claim_id':'c','places':['Milo'],'quote':'The corsairs sheltered at Milo.','statement':'The source reports shelter at Milo.','kind':'source_statement'}]}
        result=geographic(answer)['findings'][0]
        self.assertIsNone(result['modern_identification']);self.assertIsNone(result['coordinates'])
        self.assertEqual(result['verification_status'],'UNVERIFIED')

    def test_runtime_completion_alone_cannot_pass_research_acceptance(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'123';dest=root/'research_answer';dest.mkdir(parents=True)
            (dest/'answer.json').write_text(json.dumps({'calls':[{'role':r,'status':'COMPLETED'} for r in ('synthesis','evidence_extractor','adversarial_reviewer')],'model_used':True}))
            result=validation(root,Path(tmp)/'probes')
            self.assertEqual(result['status'],'INCOMPLETE')
            self.assertIn('NO_ACQUIRED_SOURCE_TEXT',result['blockers'])

    def test_interrupted_model_progress_is_diagnosed_and_never_accepted_as_final(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'123';dest=root/'research_answer';dest.mkdir(parents=True)
            (dest/'progress.json').write_text(json.dumps({'status':'RUNNING_SEMANTIC_ANALYSIS',
                'claims':[{'claim_id':'partial','verified':False}],
                'calls':[{'role':'synthesis','status':'RUNNING'}]}))
            result=validation(root,Path(tmp)/'probes')
            self.assertEqual(result['status'],'INCOMPLETE')
            self.assertEqual(result['counts']['model_claims'],1)
            self.assertIn('PARTIAL_PROGRESS_ONLY_NO_FINAL_ANSWER',result['blockers'])
            self.assertEqual(result['semantic_calls'][0]['status'],'RUNNING')
