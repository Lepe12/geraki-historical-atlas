import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import semantic_research_answer as engine
from reviewed_claim_draft import draft
from test_semantic_shards import fixture,Caller,CONFIG,BASE_ENV,response


class DraftTests(unittest.TestCase):
    def test_copy_citations_uncertainty_context_and_no_mutation(self):
        claims=[{'claim_id':'a','statement':'The author conjectures a refuge.','kind':'hypothesis','relevance_status':'CONTEXTUAL'},
                {'claim_id':'b','statement':'An inference, not an established event.','kind':'inference'}]
        original=json.dumps(claims,sort_keys=True)
        value=draft(claims)
        self.assertEqual(value['answer_sections'][0]['claim_ids'],['a'])
        self.assertTrue(value['answer_sections'][0]['text'].endswith(claims[0]['statement']))
        self.assertIn('Background context.',value['answer_sections'][0]['text'])
        self.assertIn('conjecture',value['answer_sections'][0]['text'])
        self.assertIn('Provisional inference',value['answer_sections'][1]['text'])
        self.assertEqual(json.dumps(claims,sort_keys=True),original)

    def test_bound_deduplicate_and_fall_back_without_clipping(self):
        claims=[{'claim_id':str(i),'statement':'The source reports finding '+str(i)+'.'} for i in range(7)]
        self.assertEqual(len(draft(claims)['answer_sections']),4)
        self.assertEqual(len(draft([claims[0],claims[0]])['answer_sections']),1)
        self.assertIsNone(draft([{'claim_id':'a','statement':'a'*481}]))
        self.assertIsNone(draft([]))

    def test_current_engine_still_reviews_draft_and_never_calls_synthesis_on_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);fixture(root);caller=Caller(forbid={'synthesis'})
            with patch.dict(os.environ,{**BASE_ENV,'PCT_SYNTHESIS_MODE':'reviewed_claims'}):
                out=engine.execute(root,'Historical research',caller=caller,config=CONFIG)
            self.assertEqual(out['status'],'MODEL_ANSWER_PENDING_HUMAN_REVIEW')
            self.assertTrue(out['final_answer_review'])
            self.assertEqual(len(out['answer_sections']),4)
            self.assertNotIn('synthesis',caller.calls)
            self.assertFalse(any(c['verified'] for c in out['claims']))

    def test_final_reviewer_can_reject_every_drafted_paragraph(self):
        class Reject(Caller):
            def __call__(self,role,prompt):
                if role=='adversarial_reviewer' and 'FINAL_ANSWER_JSON:' in prompt:
                    sections=json.loads(prompt.split('FINAL_ANSWER_JSON:\n')[1])['sections']
                    return response({'section_decisions':[{'section_index':i,'source_support_reason':'Meaning remains uncertain from the supplied quotation.',
                        'unsupported_answer_spans':[],'decision':'UNCERTAIN'} for i in range(len(sections))]})
                return super().__call__(role,prompt)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);fixture(root)
            with patch.dict(os.environ,{**BASE_ENV,'PCT_SYNTHESIS_MODE':'reviewed_claims'}):
                out=engine.execute(root,'Historical research',caller=Reject(),config=CONFIG)
            self.assertEqual(out['status'],'FINAL_ANSWER_REVIEW_FAILED')
            self.assertFalse(out['answer_sections'])

if __name__=='__main__':unittest.main()
