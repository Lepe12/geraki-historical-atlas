import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from research_continuation import Continuation
from production_acceptance import acceptance


class ContinuationTests(unittest.TestCase):
    def test_source_changes_and_corruption_invalidate_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            queue=Continuation(directory,'question',b'code',{})
            group=[{'text':'actual text','evidence_id':'e1'}]
            queue.save(group,{'items':[]})
            self.assertTrue(queue.completed(group))
            self.assertFalse(queue.completed([{'text':'changed','evidence_id':'e1'}]))
            self.assertFalse(Continuation(directory,'other question',b'code',{}).completed(group))
            self.assertFalse(Continuation(directory,'question',b'new code',{}).completed(group))
            queue.path(group).write_text('{}')
            self.assertFalse(queue.completed(group))

    def test_new_reanalysis_paths_reuse_only_identical_source_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            queue=Continuation(directory,'q',b'code',{})
            old=[{'acquired_text_path':'semantic_reanalysis_123/derived_sources/a.txt','source_text_sha256':'abc','locator':{'start_char':4}}]
            new=[{**old[0],'acquired_text_path':'semantic_reanalysis_456/derived_sources/a.txt'}]
            queue.save(old,{'items':[]})
            self.assertTrue(queue.completed(new))
            self.assertFalse(queue.completed([{**new[0],'locator':{'start_char':5}}]))

    def test_execute_advances_batches_instead_of_repeating_first_sample(self):
        import semantic_research_answer as engine
        from test_semantic_research_answer import fixture
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);fixture(root)
            row=engine.collect(root)[0][0]
            records=[{**row,'evidence_id':'e'+str(i),'text':row['text']+' '+('context '*500)} for i in range(4)]
            calls=[]
            def caller(role,prompt):
                calls.append(prompt)
                return {'status':'COMPLETED','content':json.dumps({'items':[]})}
            with patch.object(engine,'collect',return_value=(records,[])),patch.dict('os.environ',{'PCT_LLM_PROVIDER':'local_llama_cpp','PCT_SEMANTIC_BATCHES':'2'}):
                first=engine.execute(root,'q',caller=caller,config={'configured':True})
                before=len(calls)
                second=engine.execute(root,'q',caller=caller,config={'configured':True})
            self.assertEqual(before,2)
            self.assertEqual(len(calls),4)
            self.assertEqual(len(first['coverage']['deferred']),2)
            self.assertEqual(second['coverage']['deferred'],[])
            self.assertEqual(len(second['continuation_replays']),2)
            queue=next(root.glob('research_continuation/*/queue.json'))
            self.assertEqual(json.loads(queue.read_text())['status'],'COMPLETE')

    def test_large_passage_split_retains_every_character_and_exact_locators(self):
        import semantic_research_answer as engine
        from test_semantic_research_answer import fixture
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);fixture(root)
            row=engine.collect(root)[0][0]
            text='Historical source narrative. '*900
            row={**row,'text':text}
            original=row['occurrences'][0]['locator']['start_char']
            parts=engine.fit_passages([row],6500)
            covered=set()
            self.assertGreater(len(parts),1)
            for part in parts:
                locator=part['occurrences'][0]['locator']
                start=locator['start_char']-original;end=locator['end_char']-original
                self.assertEqual(text[start:end],part['text'])
                self.assertLessEqual(len(json.dumps(engine.model_evidence(part),ensure_ascii=False)),6500)
                covered.update(range(start,end))
            self.assertEqual(len(covered),len(text))

    def test_failed_bibliography_lookup_is_retried_then_retained_as_blocked(self):
        from cited_work_acquisition import continue_citations
        finding={'finding_id':'f','url':'parent',
            'evidence_excerpt':'Smith, «A historical bibliography of maritime correspondence», London 1956, pp. 237–253.'}
        def blocked(*args):raise OSError('unavailable')
        with tempfile.TemporaryDirectory() as directory:
            for attempt in range(1,4):
                state=continue_citations(directory,{},[],findings=[finding],searcher=blocked)
                self.assertEqual(state['searches'][0]['attempts'],attempt)
                self.assertEqual(bool(state['pending']),attempt<3)
                self.assertEqual(len(state['unresolved']),1)
            self.assertEqual(len(state['attempt_history']),2)

    def test_deferred_coverage_and_citations_block_research_acceptance(self):
        from research_validation_report import build
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);out=root/'research_answer';out.mkdir()
            (out/'answer.json').write_text(json.dumps({'coverage':{
                'unique_passages':4,'selected_passages':2,'deferred':[{'evidence_id':'e3'}]}}))
            lane=root/'greek/library_acquisition';lane.mkdir(parents=True)
            (lane/'cited_work_continuation.json').write_text(json.dumps({'deferred':[{'query':'work'}]}))
            report=build(root,root/'probes')
            self.assertIn('RESEARCH_COVERAGE_PENDING',report['blockers'])
            self.assertIn('CITATION_FOLLOWUP_PENDING',report['blockers'])

    def test_review_and_synthesis_resume_after_one_call_budget(self):
        import semantic_research_answer as engine
        from test_semantic_research_answer import fixture,response,item
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);fixture(root);eid=engine.collect(root)[0][0]['evidence_id']
            calls=[]
            def caller(role,prompt):
                calls.append(role)
                if role=='evidence_extractor':return response({'items':[item(eid)]})
                if role=='synthesis':
                    value=json.loads(prompt.split('CLAIMS_AND_REVIEW_JSON:\n')[1])
                    return response({'answer_sections':[{'text':'The consulted source reports that ships attacked the island in 1677.',
                        'claim_ids':[value['claims'][0]['claim_id']]}]})
                if 'FINAL_ANSWER_JSON:' in prompt:return response({'supported_section_indexes':[0],'flagged_sections':[]})
                value=json.loads(prompt.split('CLAIMS_JSON:\n')[1])
                return response({'supported_claim_ids':[value[0]['claim_id']],'flagged_claims':[]})
            with patch.dict('os.environ',{'PCT_SEMANTIC_CALLS_PER_PASS':'1','PCT_ENABLE_RESPONSE_CACHE':'1'}):
                answers=[engine.execute(root,'q',caller=caller,config={'configured':True}) for _ in range(4)]
            self.assertEqual(len(calls),4)
            self.assertTrue(all(a['status']=='RESEARCH_REVIEW_PENDING' for a in answers[:3]))
            self.assertEqual(answers[-1]['status'],'MODEL_ANSWER_PENDING_HUMAN_REVIEW')
            self.assertTrue(any(c.get('replayed') for c in answers[-1]['calls']))
            self.assertFalse(answers[-1]['verified'])

    def test_public_failure_blocks_otherwise_green_production(self):
        report={'checks':[{'passed':True}], 'oidc_event_auth_negative_control':{'passed':True},
            'public_route_observations':[{'endpoint':'/health','http_status':503}]}
        self.assertEqual(acceptance(report)['status'],'BLOCKED_PRODUCTION_ACCEPTANCE')
        report['public_route_observations']=[{'endpoint':'/health','http_status':200,'reported_health_status':'PASS'},
            {'endpoint':'/knowledge/evidence','http_status':401}]
        self.assertEqual(acceptance(report)['status'],'PASS')
        report['oidc_event_auth_negative_control']['passed']=False
        self.assertNotEqual(acceptance(report)['status'],'PASS')

if __name__=='__main__':unittest.main()
