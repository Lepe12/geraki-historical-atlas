"""Structure checks do not claim factual model correctness."""
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import research_response_schema as schemas
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'llm'))
import local_model

class ResponseSchemaTests(unittest.TestCase):
    def test_extraction_names_are_strings_and_citation_ids_are_closed(self):
        s=schemas.extraction(['e-actual'])
        item=s['properties']['items']['items']
        self.assertEqual(item['properties']['actors']['items']['type'],'string')
        self.assertEqual(item['properties']['evidence_id']['enum'],['e-actual'])
        self.assertFalse(item['additionalProperties'])
        self.assertEqual(schemas.review(2)['properties']['decisions']['minItems'],2)
        self.assertEqual(schemas.synthesis(['c-supported'])['properties']['answer_sections']['items']['properties']['claim_ids']['items']['enum'],['c-supported'])

    def test_local_boundary_passes_real_schema_to_grammar_response_format(self):
        seen={}
        class Model:
            def tokenize(self,value):return [1]*20
            def create_chat_completion(self,**kwargs):
                seen.update(kwargs)
                return {'choices':[{'message':{'content':'{"items":[]}'},'finish_reason':'stop'}]}
        route=SimpleNamespace(model='test-model',max_output_tokens=200,temperature=0)
        schema=schemas.extraction(['e-actual'])
        with patch.object(local_model,'_model',Model()),patch.object(local_model,'identity',return_value={'repository':'test-model'}):
            result=local_model.call('evidence_extractor','Synthetic prompt',route,response_schema=schema)
        self.assertEqual(seen['response_format']['schema'],schema)
        self.assertEqual(seen['response_format']['type'],'json_object')
        self.assertTrue(result['response_schema_sha256'])
        self.assertFalse(result['verified_promotion_allowed'])

if __name__=='__main__':unittest.main()
