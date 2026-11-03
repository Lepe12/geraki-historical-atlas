"""Replay a real wrong-scope answer and adversarial facet controls, offline."""
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from question_scope import assess, apply_to_answer, profile, queries, review_binding, replay_review


class QuestionScopeTests(unittest.TestCase):
    def setUp(self):
        self.fixture=json.loads((Path(__file__).parent/'fixtures/kimolos_question_scope_41630296108.json').read_text())
        self.request=self.fixture['request']

    def claim_answer(self, quote, statement=None, bib=None):
        statement=statement or quote
        return {'status':'MODEL_ANSWER_PENDING_HUMAN_REVIEW',
                'claims':[{'claim_id':'c','quote':quote,'statement':statement,
                           'source_occurrences':[{'source_bibliography':bib or {}}]}],
                'review':{'supported_claim_ids':['c']},
                'answer_sections':[{'text':statement,'claim_ids':['c']}]}

    def test_real_53_minute_answer_is_not_accepted_as_covering_the_question(self):
        answer=copy.deepcopy(self.fixture['answer'])
        original=copy.deepcopy(answer)
        result=assess(self.request,answer)
        self.assertEqual(result['missing_requirements'],['anchorage','freshwater'])
        self.assertEqual(answer,original)
        apply_to_answer(self.request,answer)
        self.assertEqual(answer['status'],'QUESTION_COVERAGE_INCOMPLETE')
        self.assertEqual(answer['answer_sections'],[])
        self.assertEqual(answer['question_scope_context_sections'],original['answer_sections'])
        self.assertEqual(answer['claims'],original['claims'])

    def test_negative_piracy_instruction_is_not_a_positive_requirement(self):
        self.assertEqual(profile(self.request)['facets'],['anchorage','freshwater'])
        greek={**self.request,'purpose':'Βρες αγκυροβόλια και πόσιμο νερό. Μην υποθέτεις πειρατεία.'}
        self.assertEqual(profile(greek)['facets'],['anchorage','freshwater'])

    def test_multilingual_facet_queries_precede_broad_alias_searches(self):
        french=queries(self.request,'french')
        self.assertEqual(french[:2],['"Kimolos" mouillage','"Kimolos" eau douce'])
        self.assertEqual(len(french),6)
        from research_relevance import discovery_queries,identity
        ident=identity(self.request,self.request)
        self.assertEqual(discovery_queries(ident)[:2],queries(self.request)[:2])
        self.assertIn('"Argentiera"',discovery_queries(ident))

    def test_one_facet_cannot_stand_in_for_another(self):
        answer=self.claim_answer('The traveller describes an anchorage at Kimolos.')
        req={**self.request,'purpose':'Find anchorage and drinking-water supply.'}
        self.assertEqual(assess(req,answer)['missing_requirements'],['freshwater'])

    def test_model_label_or_keywords_without_quote_support_cannot_pass(self):
        answer=self.claim_answer('Kimolos was under Russian authority.','Kimolos had anchorage and fresh water.')
        answer['claims'][0]['model_proposed_source_classification']='PRIMARY_SOURCE'
        answer['question_coverage']={'status':'PASS','missing_requirements':[]}
        self.assertEqual(assess(self.request,answer)['missing_requirements'],['anchorage','freshwater'])

    def test_modern_summary_cannot_satisfy_explicit_primary_requirement(self):
        answer=self.claim_answer('The anchorage at Kimolos offered drinking water.')
        answer['claims'][0]['source_occurrences'][0]['reported_archival_reference']={'display':'An archive cited by a modern author'}
        result=assess(self.request,answer)
        self.assertTrue(all(r['status']=='PRIMARY_SUPPORT_NOT_ESTABLISHED' for r in result['requirements']))

    def test_contemporary_metadata_is_not_event_date_or_historical_verification(self):
        bib={'creator':['Test traveller'],'date':['1740'],'source_type':'CONTEMPORARY_ACCOUNT'}
        answer=self.claim_answer('The anchorage at Kimolos offered drinking water.',bib=bib)
        result=assess(self.request,answer)
        self.assertEqual(result['missing_requirements'],[])
        self.assertEqual(result['status'],'INCOMPLETE')  # Missing semantic review.
        self.assertFalse(result['historical_verified'])
        self.assertFalse(result['answer_semantically_complete'])
        self.assertNotIn('dates',answer['claims'][0])

    def test_semantic_review_is_separate_from_keyword_overlap(self):
        req={**self.request,'purpose':'Find anchorage and drinking water.'}
        answer=self.claim_answer('The anchorage at Kimolos offered drinking water.')
        answer['question_scope_review']={'binding':review_binding(req,answer['answer_sections'],answer['claims']),
            'decisions':[{'facet':f,'reason':'Actual source support assessed.','decision':'ADDRESSED'} for f in profile(req)['facets']]}
        self.assertEqual(assess(req,answer)['status'],'PROVISIONAL_SCOPE_REVIEW_PASSED')
        answer['question_scope_review']['decisions'][1]['decision']='UNCERTAIN'
        self.assertEqual(assess(req,answer)['status'],'INCOMPLETE')
        answer['answer_sections'][0]['text']+=' Extra words change the answer.'
        self.assertFalse(assess(req,answer)['semantic_review_valid'])

    def test_actual_semantic_review_receipt_is_required_and_tampering_is_detected(self):
        from semantic_research_answer import digest
        answer=self.claim_answer('The anchorage at Kimolos offered drinking water.')
        binding=review_binding(self.request,answer['answer_sections'],answer['claims'])
        review={'binding':binding,'decisions':[{'facet':f,'reason':'Needs primary support.','decision':'UNCERTAIN'} for f in profile(self.request)['facets']]}
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);folder=root/'research_answer/model_responses';folder.mkdir(parents=True)
            prompt='FINAL_ANSWER_JSON:\n'+json.dumps({'question_scope':{'binding':binding}})
            result={'status':'COMPLETED','content':json.dumps({'question_scope_review':review})}
            (folder/'1-adversarial_reviewer.prompt.txt').write_text(prompt)
            (folder/'1-adversarial_reviewer.json').write_text(json.dumps(result))
            answer['calls']=[{'role':'adversarial_reviewer','status':'COMPLETED',
                'prompt_file':'model_responses/1-adversarial_reviewer.prompt.txt',
                'prompt_sha256':hashlib.sha256(prompt.encode()).hexdigest(),'response_sha256':digest(result)}]
            self.assertEqual(replay_review(root,root,self.request,answer)['status'],'REPLAYED')
            (folder/'1-adversarial_reviewer.json').write_text('{}')
            self.assertEqual(replay_review(root,root,self.request,answer)['status'],'NOT_REPLAYED')

    def test_unrecognized_subject_is_reported_unassessed(self):
        self.assertEqual(assess({'purpose':'Find evidence about taxation.'},{})['status'],'NOT_ASSESSED')

    def test_validator_recomputes_real_missing_requirements(self):
        from research_validation_report import build
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'123';lane=root/'travellers/run_manifest';lane.mkdir(parents=True)
            (lane/'manifest.json').write_text(json.dumps({'normalized_request':self.request}))
            dest=root/'research_answer';dest.mkdir()
            answer=copy.deepcopy(self.fixture['answer'])
            answer['question_coverage']={'status':'PASS'}
            (dest/'answer.json').write_text(json.dumps(answer))
            result=build(root,Path(tmp)/'no-probes')
            self.assertIn('QUESTION_REQUIREMENTS_NOT_COVERED',result['blockers'])
            self.assertEqual(result['question_coverage']['missing_requirements'],['anchorage','freshwater'])

    def test_scoped_fulltext_queries_are_used_by_real_run_entrypoint(self):
        from fulltext_discovery import run
        with tempfile.TemporaryDirectory() as tmp, patch('fulltext_discovery.ia_search',return_value=[]) as search:
            run(Path(tmp),self.request,self.request,ia_enabled=True)
            actual={c.args[0] for c in search.call_args_list}
            self.assertTrue(set(queries(self.request)) <= actual)

    def test_real_engine_final_review_assesses_facets_in_the_existing_call(self):
        from semantic_research_answer import execute
        text='In 1740 ships used an anchorage at Kimolos and obtained drinking water there.'
        req={**self.request,'purpose':'Find anchorage and drinking water.'}
        seen=[]
        def caller(role,prompt):
            seen.append(role)
            if role=='evidence_extractor':
                row=json.loads(prompt.split('EVIDENCE_JSON:\n',1)[1].split('\n',1)[0])[0]
                value={'items':[{'evidence_id':row['evidence_id'],'passage_ids':[0],
                    'statement':'The source reports an anchorage at Kimolos and drinking water in 1740.',
                    'kind':'source_statement','passage_kind':'NARRATIVE_EVIDENCE','source_type':'UNVERIFIED',
                    'actors':[],'places':['Kimolos'],'dates':['1740'],'usage_type':'ANCHORAGE','uncertainty':[]}]}
            elif 'FINAL_ANSWER_JSON:\n' in prompt:
                payload=json.loads(prompt.split('FINAL_ANSWER_JSON:\n',1)[1])
                value={'section_decisions':[{'section_index':i,'source_support_reason':'The quote explicitly reports anchorage and drinking water.',
                    'unsupported_answer_spans':[],'decision':'SUPPORTED'} for i in range(len(payload['sections']))],
                    'question_scope_review':{'binding':payload['question_scope']['binding'],
                    'decisions':[{'facet':f,'reason':'The cited passage directly addresses this requested supply or anchorage.',
                                  'decision':'ADDRESSED'} for f in payload['question_scope']['required_facets']]}}
            else:
                value={'decisions':[{'claim_index':0,'reason':'The statement faithfully attributes the supplied quote.','decision':'SUPPORTED'}],'limitations':[]}
            return {'status':'COMPLETED','provider':'simulated-test','model':'fixture','content':json.dumps(value)}
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ,{'PCT_SYNTHESIS_MODE':'reviewed_claims','PCT_EXCERPT_RANKING':'0','PCT_PREFILTER':'0','PCT_SCREENING':'0'}):
            root=Path(tmp);lane=root/'travellers'
            for path in ['run_manifest','library_acquisition','structured_output']:(lane/path).mkdir(parents=True)
            (lane/'run_manifest/manifest.json').write_text(json.dumps({'normalized_request':req}))
            (lane/'library_acquisition/doc.txt').write_text(text)
            finding={'finding_id':'fixture','file':'doc.txt','url':'https://example.org/fixture','title':'Synthetic test document',
                     'source_text_sha256':hashlib.sha256(text.encode()).hexdigest(),'evidence_excerpt':text,
                     'years_in_scope':[1740],'date_basis':'EXPLICIT_PARAGRAPH','uncertainties':['ORIGINAL_NOT_INSPECTED'],
                     'locator':{'start_char':0,'end_char':len(text),'start_line':1,'end_line':1}}
            (lane/'structured_output/extracted_findings.json').write_text(json.dumps({'findings':[finding]}))
            answer=execute(root,'Kimolos: anchorage and drinking water.',caller=caller,config={'configured':True,'missing':[]})
            self.assertEqual(answer['question_coverage']['status'],'PROVISIONAL_SCOPE_REVIEW_PASSED')
            self.assertEqual(seen,['evidence_extractor','adversarial_reviewer','adversarial_reviewer'])
            self.assertEqual(replay_review(root,root,req,answer)['status'],'REPLAYED')


if __name__=='__main__':unittest.main()
