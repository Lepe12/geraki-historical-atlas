"""Offline N7 source-replay and review-budget regression tests; no model/hosting access."""
import copy
import json
import os
import subprocess
import sys
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
            'claims':copy.deepcopy(accepted),'evidence':[copy.deepcopy(record)],
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

    def test_prompt_compaction_does_not_change_source_identity(self):
        with tempfile.TemporaryDirectory() as tmp:
            p,records,claims,_=self.proposals(tmp)
            records[0].update(model_view='compact',model_window=True)
            replayed,rejections,_=resume_private_proposals(p,'Naxos source check',records,None,None,None,tmp)
            self.assertEqual(rejections,[])
            self.assertEqual(replayed[0]['source_occurrences'],claims[0]['source_occurrences'])

    def test_citation_mutation_cannot_survive_private_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            p,records,claims,old=self.proposals(tmp)
            pristine=copy.deepcopy(claims[0])
            old['claims'][0]['source_occurrences']=[{'locator':{'start_char':99}}]
            p.write_text(json.dumps(old))
            replayed,rejections,_=resume_private_proposals(p,'Naxos source check',records,
                                                             None,None,None,tmp)
            self.assertFalse(replayed)
            self.assertEqual(rejections[0]['reason'],'PRIVATE_REVIEW_ORIGINAL_CITATION_CHANGED')
            # Restoring the quote text but changing the source bytes also fails.
            old['claims'][0]=pristine
            old['evidence'][0]['text']=TEXT
            old['evidence'][0]['text']='A substituted account.'
            p.write_text(json.dumps(old))
            replayed,rejections,_=resume_private_proposals(p,'Naxos source check',records,
                                                             None,None,None,tmp)
            self.assertFalse(replayed)
            self.assertEqual(rejections[0]['reason'],'PRIVATE_REVIEW_SOURCE_CONTEXT_CHANGED')

    def test_proposals_using_the_same_evidence_have_separate_decisions(self):
        with tempfile.TemporaryDirectory() as tmp:
            p,records,claims,old=self.proposals(tmp,2)
            old['claims'][1]['quote_offset_in_excerpt']+=1
            p.write_text(json.dumps(old))
            replayed,_,receipt=resume_private_proposals(p,'Naxos source check',records,None,None,None,tmp)
            self.assertEqual([claim['claim_id'] for claim in replayed],[claims[0]['claim_id']])
            first,second=receipt['proposal_decisions']
            self.assertEqual((first['proposal'],first['status']),(1,'REPLAYED'))
            self.assertEqual((second['proposal'],second['status']),(2,'REJECTED'))
            self.assertEqual(second['claim_id'],claims[1]['claim_id'])
            self.assertEqual(second['saved_quote'],claims[1]['quote'])
            self.assertEqual(second['reasons'][0]['reason'],'PRIVATE_REVIEW_QUOTE_OFFSET_OR_ID_MISMATCH')

    def test_blocked_preflight_saves_private_decision_before_exiting(self):
        with tempfile.TemporaryDirectory() as tmp:
            run='42434462262';root=Path(tmp)/'evidence'/'runs'/run
            original,_,_,answer=self.proposals(root)
            answer['claims'][0]['evidence_id']='missing-synthetic-evidence'
            original.write_text(json.dumps(answer))
            manifest=root/'travellers'/'run_manifest'/'manifest.json'
            manifest.parent.mkdir(parents=True)
            manifest.write_text(json.dumps({'normalized_request':{'target':'Naxos source check'}}))
            result=subprocess.run([sys.executable,str(Path(__file__).with_name('semantic_research_answer.py')),
                '--repo',tmp,'--run-id',run,'--resume-private-proposals','--check-private-proposals-only'],
                capture_output=True,text=True,timeout=30)
            self.assertIn('N7_PRIVATE_REVIEW_CITATION_REPLAY_NOT_COMPLETE',result.stderr)
            self.assertNotIn(TEXT,result.stdout+result.stderr)
            decision_file=root/'research_answer'/'citation-replay.json'
            decision=json.loads(decision_file.read_text())['proposal_decisions'][0]
            self.assertEqual(decision['reasons'][0]['reason'],'PRIVATE_REVIEW_SOURCE_EXCERPT_NOT_AVAILABLE')
            self.assertEqual(decision_file.stat().st_mode&0o777,0o600)

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
            with patch.dict(os.environ,{'PCT_SEMANTIC_PARTIAL_ANSWER':'1','PCT_REVIEW_ALL_EXTRACTED':'0'},clear=False):
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


    def test_full_preflight_replays_without_invoking_any_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp)
            eid=collect(tmp)[0][0]['evidence_id']
            def original_caller(role,prompt):
                if role=='evidence_extractor':
                    return response({'items':[{**item(eid),'statement':
                        'The consulted account reports an attack during 1677.'}]})
                if role=='adversarial_reviewer':
                    return response({'decisions':[{'claim_index':0,'decision':'UNSUPPORTED',
                                                   'reason':'Proposed event exceeds quotation.'}]})
                raise AssertionError('No automatic synthesis without supported source')
            previous=execute(tmp,'Naxos source check',caller=original_caller,
                             config={'configured':True,'missing':[]})
            self.assertEqual(len(previous['claims']),1)
            self.assertTrue(previous['model_used'])
            original=Path(tmp)/'previous_model_answer/answer.json'
            original.parent.mkdir(parents=True)
            original.write_text(json.dumps(previous))
            with patch.dict(os.environ,{'PCT_PRIVATE_REVIEW_PREFLIGHT_ONLY':'1'},clear=False):
                output=execute(tmp,'Naxos source check',
                               caller=lambda *_: (_ for _ in ()).throw(AssertionError('MODEL_CALL_FORBIDDEN')),
                               config={'configured':True,'missing':[]},
                               resume_private_proposals_from=original)
            self.assertEqual(output['status'],'PRIVATE_CITATION_REPLAY_ONLY')
            self.assertEqual(output['private_proposal_replay']['replayed_source_bound_proposals'],1)
            self.assertEqual(output['private_proposal_replay']['rejected_source_bound_proposals'],0)
            self.assertFalse(output['calls'])
            self.assertFalse(output['private_proposal_replay']['carried_over_review_verdicts'])


if __name__=='__main__':
    unittest.main()
