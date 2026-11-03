"""Real engine draft receipts, with simulated model calls; no network or inference."""
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import semantic_research_answer as engine
from reviewed_draft_validation import validate
from research_validation_report import build
from test_semantic_shards import fixture,Caller,CONFIG,BASE_ENV

ENV={**BASE_ENV,'PCT_SYNTHESIS_MODE':'reviewed_claims','PCT_EXCERPT_RANKING':'0'}

class DraftStageValidation(unittest.TestCase):
    def material(self,tmp):
        root=Path(tmp);fixture(root)
        with patch.dict(os.environ,ENV):
            answer=engine.execute(root,'Historical research',caller=Caller(forbid={'synthesis'}),config=CONFIG)
        self.assertEqual(answer['status'],'MODEL_ANSWER_PENDING_HUMAN_REVIEW')
        return root,answer

    def test_actual_engine_draft_with_bound_final_review_is_a_synthesis_stage(self):
        with tempfile.TemporaryDirectory() as tmp:
            root,answer=self.material(tmp)
            proof=validate(root,root,answer)
            self.assertTrue(proof['valid'],proof)
            self.assertFalse(proof['model_rewrite_required'])
            self.assertFalse(proof['historical_verified'])
            self.assertNotIn('synthesis',[c['role'] for c in answer['calls']])

    def test_draft_marker_alone_cannot_satisfy_stage(self):
        with tempfile.TemporaryDirectory() as tmp:
            root,answer=self.material(tmp)
            answer['calls']=[]
            self.assertFalse(validate(root,root,answer)['valid'])

    def test_changed_answer_and_unsupported_citation_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root,answer=self.material(tmp)
            modified=copy.deepcopy(answer);modified['answer_sections'][0]['text']+=' Invented detail.'
            self.assertFalse(validate(root,root,modified)['valid'])
            modified=copy.deepcopy(answer);modified['answer_sections'][0]['claim_ids']=['not-supported']
            self.assertFalse(validate(root,root,modified)['valid'])

    def test_changed_review_response_or_missing_receipt_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root,answer=self.material(tmp)
            call=answer['calls'][-1]
            path=root/'research_answer'/call['prompt_file'].replace('.prompt.txt','.json')
            path.write_text('{}')
            self.assertFalse(validate(root,root,answer)['valid'])
            path.unlink()
            self.assertFalse(validate(root,root,answer)['valid'])

    def test_changed_review_prompt_and_invalid_continuation_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root,answer=self.material(tmp)
            self.assertFalse(validate(root,root,answer,False)['valid'])
            call=answer['calls'][-1];path=root/'research_answer'/call['prompt_file']
            path.write_text(path.read_text()+' changed')
            self.assertFalse(validate(root,root,answer)['valid'])

    def test_cached_final_review_receipt_is_checked_without_model_inference(self):
        from research_continuation import digest as cache_digest
        with tempfile.TemporaryDirectory() as tmp:
            root,answer=self.material(tmp)
            last=answer['calls'][-1]
            matches=[]
            for path in (root/'research_continuation').glob('*/responses/*.json'):
                value=json.loads(path.read_text())
                if engine.digest(value['result'])==last['response_sha256']:matches.append((path,value))
            self.assertEqual(len(matches),1)
            path,value=matches[0]
            cached=copy.deepcopy(answer)
            cached['calls'][-1]={'role':'adversarial_reviewer','status':'COMPLETED','replayed':True,
                'response_cache_path':str(path.relative_to(root)),
                'response_cache_sha256':cache_digest(value['result'])}
            with patch.object(engine,'call',side_effect=AssertionError('validation must not infer')):
                proof=validate(root,root,cached)
            self.assertTrue(proof['valid'],proof)
            self.assertTrue(proof['final_review_replayed'])

    def test_report_keeps_other_gates_and_requires_real_extraction(self):
        with tempfile.TemporaryDirectory() as tmp:
            root,answer=self.material(tmp);folder=root/'research_answer';folder.mkdir(exist_ok=True)
            (folder/'answer.json').write_text(json.dumps(answer))
            report=build(root,root/'unused-probes')
            self.assertNotIn('SEMANTIC_STAGES_INCOMPLETE',report['blockers'])
            self.assertIn('NO_ACQUIRED_SOURCE_TEXT',report['blockers'])
            self.assertEqual(set(report['required_model_roles']),{'evidence_extractor','adversarial_reviewer'})
            answer['calls']=[c for c in answer['calls'] if c['role']!='evidence_extractor']
            answer['continuation_replays']=[]
            (folder/'answer.json').write_text(json.dumps(answer))
            self.assertIn('SEMANTIC_STAGES_INCOMPLETE',build(root,root/'unused-probes')['blockers'])

    def test_model_written_path_still_requires_its_original_model_role(self):
        with tempfile.TemporaryDirectory() as tmp:
            root,answer=self.material(tmp)
            answer['synthesis_method']='MODEL_GENERATED_REQUIRES_FINAL_REVIEW'
            (root/'research_answer/answer.json').write_text(json.dumps(answer))
            report=build(root,root/'unused-probes')
            self.assertIn('synthesis',report['required_model_roles'])
            self.assertIn('SEMANTIC_STAGES_INCOMPLETE',report['blockers'])

if __name__=='__main__':unittest.main()
