"""Offline N7 source-replay and review-budget regression tests; no model/hosting access."""
import json
import os
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

from semantic_research_answer import (VERSION,collect,execute,resume_private_proposals,
                                      validate_items)
from test_semantic_research_answer import fixture,item,response, TEXT


class N7PrivateCitationReview(unittest.TestCase):
    def proposals(self, root, amount=1):
        fixture(root)
        record=collect(root)[0][0]
        values=[{**item(record['evidence_id']),
                 'statement':f'The consulted source reports attack {i} in 1677.'}
                for i in range(amount)]
        accepted,problems=validate_items({'items':values},[record])
        self.assertFalse(problems)
        self.assertEqual(len(accepted),amount)
        previous={
            'schema':VERSION,'question':'Naxos source check','model_used':True,
            'verified':False,'historically_verified':False,
            'status':'NO_MODEL_SUPPORTED_CLAIMS',
            'claims':accepted,'evidence':[record],
            'review':{'supported_claim_ids':[], 'flagged_claims':[]}
        }
        answer=Path(root)/'previous_model_answer/answer.json'
        answer.parent.mkdir(parents=True,exist_ok=True)
        answer.write_text(json.dumps(previous))
        return answer,[record],accepted,previous

    def test_revalidate_unreviewed_private_claim_without_trusting_past_verdict(self):
        with tempfile.TemporaryDirectory() as tmp:
            p,records,claims,old=self.proposals(tmp)
            replayed,rejections,receipt=resume_private_proposals(p,'Naxos source check',records,
                                                                 None,None,None,tmp)
            self.assertEqual(rejections,[])
            self.assertEqual([c['claim_id'] for c in replayed],[claims[0]['claim_id']])
            self.assertFalse(receipt['carried_over_review_verdicts'])
            self.assertFalse(receipt['new_evidence_extraction'])
            self.assertEqual(replayed[0]['source_occurrences'],claims[0]['source_occurrences'])

    def test_citation_mutation_cannot_survive_private_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            p,records,claims,old=self.proposals(tmp)
            old['claims'][0]['source_occurrences']=[{'locator':{'start_char':99}}]
            p.write_text(json.dumps(old))
            replayed,rejections,_=resume_private_proposals(p,'Naxos source check',records,
                                                             None,None,None,tmp)
            self.assertFalse(replayed)
            self.assertEqual(rejections[0]['reason'],'PRIVATE_REVIEW_ORIGINAL_CITATION_CHANGED')
            # Restoring the quote text but changing the source bytes also fails.
            old['claims'][0]=claims[0]
            old['evidence'][0]['text']='A substituted account.'
            p.write_text(json.dumps(old))
            replayed,rejections,_=resume_private_proposals(p,'Naxos source check',records,
                                                             None,None,None,tmp)
            self.assertFalse(replayed)
            self.assertEqual(rejections[0]['reason'],'PRIVATE_REVIEW_SOURCE_CONTEXT_CHANGED')

    def test_cross_run_and_wrong_question_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            p,records,_,old=self.proposals(tmp)
            with self.assertRaisesRegex(ValueError,'OUTSIDE_ORIGINAL'):
                resume_private_proposals(Path(tmp)/'../foreign/answer.json','Naxos source check',
                                         records,None,None,None,tmp)
            with self.assertRaisesRegex(ValueError,'IDENTITY_INVALID'):
                resume_private_proposals(p,'Other topic',records,None,None,None,tmp)
            old['verified']=True;p.write_text(json.dumps(old))
            with self.assertRaisesRegex(ValueError,'IDENTITY_INVALID'):
                resume_private_proposals(p,'Naxos source check',records,None,None,None,tmp)

    def test_zero_supported_with_unreviewed_claims_is_review_incomplete(self):
        with tempfile.TemporaryDirectory() as tmp:
            _,records,_,_=self.proposals(tmp,5)
            eid=records[0]['evidence_id']
            proposals=[{**item(eid), 'statement':f'Source item {i} reports an attack in 1677.'}
                       for i in range(5)]
            def fake(role,prompt):
                if role=='evidence_extractor':return response({'items':proposals})
                if role=='adversarial_reviewer':
                    return response({'decisions':[{'claim_index':0,'decision':'UNSUPPORTED',
                                                   'reason':'The proposed statement exceeds what is quoted.'}]})
                raise AssertionError('No supported claims; synthesis must not execute')
            with patch.dict(os.environ,{'PCT_SEMANTIC_PARTIAL_ANSWER':'1'},clear=False):
                out=execute(tmp,'question',caller=fake,config={'configured':True,'missing':[]})
            self.assertEqual(len(out['claims']),5)
            self.assertEqual(len(out['coverage']['claims_awaiting_review']),1)
            self.assertEqual(out['status'],'REVIEW_INCOMPLETE')
            self.assertFalse(out['answer_sections'])

    def test_review_all_extracted_finishes_all_decisions_without_fabricating_support(self):
        with tempfile.TemporaryDirectory() as tmp:
            _,records,_,_=self.proposals(tmp,5)
            eid=records[0]['evidence_id']
            proposals=[{**item(eid),'statement':f'Source item {i} reports attack in 1677.'}
                       for i in range(5)]
            def fake(role,prompt):
                if role=='evidence_extractor':return response({'items':proposals})
                if role=='adversarial_reviewer':
                    return response({'decisions':[{'claim_index':0,'decision':'UNSUPPORTED',
                                                   'reason':'There is no support in the literal quote.'}]})
                raise AssertionError('Unsupported claims may not be summarized')
            with patch.dict(os.environ,{'PCT_SEMANTIC_PARTIAL_ANSWER':'1','PCT_REVIEW_ALL_EXTRACTED':'1'},clear=False):
                out=execute(tmp,'question',caller=fake,config={'configured':True,'missing':[]})
            self.assertEqual(len(out['coverage']['claims_awaiting_review']),0)
            self.assertEqual(out['status'],'NO_MODEL_SUPPORTED_CLAIMS')


if __name__=='__main__':
    unittest.main()
