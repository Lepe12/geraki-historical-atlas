import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from research_geographic_findings import build as geographic
from research_validation_report import build as validation
from semantic_research_answer import configuration,validate_items

class ResearchEngineValidationTests(unittest.TestCase):
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
