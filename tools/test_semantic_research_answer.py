"""Deterministic protocol tests with simulated model responses; no live API use."""
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from semantic_research_answer import collect,batches,execute,validate_items,configuration,render,normalize_review,normalize_final_review,model_evidence
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
    def test_discovery_genres_and_missing_geographic_entities_cannot_become_findings(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);rows=collect(tmp)[0];eid=rows[0]['evidence_id']
            for genre in ('INDEX_ENTRY','BIBLIOGRAPHIC_REFERENCE','CATALOGUE_METADATA','NAME_LIST'):
                accepted,rejected=validate_items({'items':[item(eid,passage_kind=genre)]},rows)
                self.assertFalse(accepted)
                self.assertEqual(rejected[0]['reason'],'DISCOVERY_LEAD_NOT_NARRATIVE_EVIDENCE')
            accepted,rejected=validate_items({'items':[item(eid)]},rows,'place')
            self.assertFalse(accepted)
            self.assertEqual(rejected[0]['reason'],'GEOGRAPHIC_FINDING_REQUIRES_LITERAL_PLACE')
            self.assertTrue(validate_items({'items':[item(eid)]},rows,'person')[0])

    def test_quarantined_claims_never_enter_synthesis_context(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);eid=collect(tmp)[0][0]['evidence_id'];state={'supported':None}
            def caller(role,prompt):
                if role=='evidence_extractor':
                    return response({'items':[item(eid),item(eid,statement='An unrelated rejected claim.')]})
                if role=='adversarial_reviewer':
                    if 'FINAL_ANSWER_JSON:' in prompt:
                        return response({'supported_section_indexes':[0],'flagged_sections':[]})
                    claim=json.loads(prompt.split('CLAIMS_JSON:\n')[1])[0]
                    if claim['statement']=='An unrelated rejected claim.':
                        return response({'supported_claim_ids':[],'flagged_claims':[{'claim_id':claim['claim_id'],'reason':'QUARANTINED_SECRET_MARKER'}]})
                    state['supported']=claim['claim_id']
                    return response({'supported_claim_ids':[claim['claim_id']],'flagged_claims':[]})
                self.assertNotIn('QUARANTINED_SECRET_MARKER',prompt)
                self.assertNotIn('An unrelated rejected claim.',prompt)
                return response({'answer_sections':[{'text':'The source reports an attack in 1677.','claim_ids':[state['supported']]}]})
            out=execute(tmp,'question',caller=caller,config={'configured':True,'missing':[]})
            self.assertEqual(out['status'],'MODEL_ANSWER_PENDING_HUMAN_REVIEW')
            self.assertEqual(len(out['review']['flagged_claims']),1)

    def test_one_word_place_request_requires_a_place_during_real_pipeline_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);eid=collect(tmp)[0][0]['evidence_id']
            manifest=Path(tmp)/'travellers/run_manifest';manifest.mkdir()
            (manifest/'manifest.json').write_text(json.dumps({'normalized_request':{'target':'Μήλος','aliases':['Milo']}}))
            def caller(role,prompt):
                self.assertEqual(role,'evidence_extractor')
                return response({'items':[item(eid)]})
            out=execute(tmp,'Μήλος (1660-1680)',caller=caller,config={'configured':True,'missing':[]})
            self.assertEqual(out['request_kind'],'place')
            self.assertEqual(out['status'],'EXTRACTION_FAILED_OR_UNSUPPORTED')
            self.assertEqual(out['claims'],[])
            self.assertEqual(out['rejected'][0]['reason'],'GEOGRAPHIC_FINDING_REQUIRES_LITERAL_PLACE')

    def test_unresolved_alias_only_and_bibliographic_leads_do_not_become_person_answers(self):
        cases=[('Nicola Test Principe di Esempio','Synthetic source',
                ['EVENT_DATE_UNRESOLVED','ACTION_UNRESOLVED'],'ALIAS_ONLY_WITHOUT_IDENTITY_OR_EVENT_CONTEXT_RETAINED_AS_LEAD'),
               ('Author, «Νικόλαος Δοκιμής, διοικητής (4575)», Athens 1956, pp. 10–12.',
                'Synthetic bibliographic guide',['ACTION_UNRESOLVED'],'BIBLIOGRAPHIC_REFERENCE_REQUIRES_CITED_WORK_ACQUISITION')]
        for text,title,flags,reason in cases:
            with tempfile.TemporaryDirectory() as tmp:
                fixture(tmp);base=Path(tmp)/'travellers';file=base/'library_acquisition/doc.txt';file.write_text(text)
                fp=base/'structured_output/extracted_findings.json';f=json.loads(fp.read_text())['findings'][0]
                f.update(evidence_excerpt=text,title=title,uncertainties=flags,years_in_scope=[],
                         source_text_sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
                         locator={'start_char':0,'end_char':len(text),'start_line':1,'end_line':1})
                fp.write_text(json.dumps({'findings':[f]}));(base/'run_manifest').mkdir()
                (base/'run_manifest/manifest.json').write_text(json.dumps({'normalized_request':{
                    'target':'Νικόλαος Δοκιμής','aliases':['Nicola Test'],'date_range':'1500-1650'}}))
                rows,excluded=collect(tmp)
                self.assertEqual(rows,[]);self.assertEqual(excluded[0]['reason'],reason)
                self.assertEqual(file.read_text(),text)
        from semantic_research_answer import person_passage_hold_reason
        request={'target':'Ιωάννης Δοκιμής','aliases':['Jean Test']}
        self.assertIsNone(person_passage_hold_reason('Quelques jours après, on pendait sire Jean Test à la porte du bagne.',
            'Synthetic French narrative',request,['EVENT_DATE_UNRESOLVED','ACTION_UNRESOLVED']))
        self.assertIsNotNone(person_passage_hold_reason('In 1608 Nicola Test Principe di Esempio',
            'Synthetic rank list',{'target':'Νικόλαος Δοκιμής','aliases':['Nicola Test']},[]))
        request={'target':'Νικόλαος Δοκιμής','aliases':['Nicola Test'],'date_range':'1500-1650'}
        bibliography={'date':['1884']}
        text='Nicola Test entered the city administration after completing his studies.'
        self.assertIsNotNone(person_passage_hold_reason(text,'Biographies of illustrious contemporaries',request,[],bibliography,[]))
        for title in ('Historical study of the requested person','Biographies of 16th century contemporaries'):
            self.assertIsNone(person_passage_hold_reason(text,title,request,[],bibliography,[]))
        self.assertIsNone(person_passage_hold_reason(text,'Biographies of illustrious contemporaries',request,[],bibliography,[1608]))

    def test_entity_formatting_copies_real_mention_without_spelling_or_identity_repair(self):
        from semantic_research_answer import literal_entity_surface
        quote='The CORSAIRS named Romanos\nManetas anchored at Milos.'
        self.assertEqual(literal_entity_surface('corsairs',quote),'CORSAIRS')
        self.assertEqual(literal_entity_surface('Romanos Manetas',quote),'Romanos\nManetas')
        self.assertIsNone(literal_entity_surface('Milo',quote))
        self.assertIsNone(literal_entity_surface('Manetas Romanos',quote))
        self.assertIsNone(literal_entity_surface('Μήλος',quote))
        self.assertIsNone(literal_entity_surface('Petro','Petró'))
        self.assertEqual(literal_entity_surface('Petró','Petro\u0301'),'Petro\u0301')

    def test_whitespace_variants_are_not_misattributed_as_identical_quotes(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);fixture(tmp,'greek','https://example.org/other-version')
            lane=Path(tmp)/'greek';changed=TEXT.replace('ships attacked','ships\r\nattacked')
            (lane/'library_acquisition/doc.txt').write_bytes(changed.encode())
            p=lane/'structured_output/extracted_findings.json';data=json.loads(p.read_text());f=data['findings'][0]
            f.update(evidence_excerpt=changed,source_text_sha256=hashlib.sha256(changed.encode()).hexdigest())
            f['locator'].update(end_char=len(changed));p.write_text(json.dumps(data))
            rows,excluded=collect(tmp)
            self.assertFalse(excluded);self.assertEqual(len(rows),2)
            self.assertEqual(rows[0]['similar_text_fingerprint'],rows[1]['similar_text_fingerprint'])
            self.assertTrue(all(len(r['occurrences'])==1 for r in rows))

    def test_selected_quote_gets_exact_character_locator_and_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);rows,_=collect(tmp);row=rows[0]
            boundary=TEXT.index(' The account')
            row['occurrences'][0]['page_boundaries']=[{'start_char':0,'end_char':boundary,'scan_index_0_based':0},
                {'start_char':boundary,'end_char':len(TEXT),'scan_index_0_based':1}]
            value=item(row['evidence_id'],passage_ids=[1],statement='The source expresses uncertainty.');value.pop('quote');value['dates']=[]
            accepted,rejected=validate_items({'items':[value]},rows)
            self.assertFalse(rejected)
            c=accepted[0];loc=c['source_occurrences'][0]['locator']
            self.assertEqual(TEXT[loc['start_char']:loc['end_char']],c['quote'])
            self.assertEqual(loc['scan_indexes_0_based'],[1]);self.assertEqual(loc['span_semantics'],'EXACT_QUOTE')

    def test_repeated_sentence_uses_the_selected_occurrence(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);row=collect(tmp)[0][0];row['text']=TEXT+' '+TEXT
            value=item(row['evidence_id'],passage_ids=[2]);value.pop('quote')
            accepted,rejected=validate_items({'items':[value]},[row])
            self.assertFalse(rejected)
            self.assertEqual(accepted[0]['source_occurrences'][0]['locator']['start_char'],len(TEXT))

    def test_flagged_synthesis_is_revised_once_and_reviewed_again(self):
        for second_pass in (True,False):
            with tempfile.TemporaryDirectory() as tmp:
                fixture(tmp);eid=collect(tmp)[0][0]['evidence_id'];state={'drafts':0,'final_reviews':0}
                def caller(role,prompt):
                    if role=='evidence_extractor':return response({'items':[item(eid)]})
                    if role=='adversarial_reviewer':
                        if 'FINAL_ANSWER_JSON:' not in prompt:
                            claims=json.loads(prompt.split('CLAIMS_JSON:\n')[1]);state['cid']=claims[0]['claim_id']
                            return response({'supported_claim_ids':[state['cid']],'flagged_claims':[]})
                        state['final_reviews']+=1
                        passed=second_pass and state['final_reviews']==2
                        return response({'supported_section_indexes':[0] if passed else [],
                                         'flagged_sections':[] if passed else [{'index':0,'reason':'unsupported date'}]})
                    state['drafts']+=1
                    return response({'answer_sections':[{'text':'According to the source, ships attacked in 1677. Verification is pending.','claim_ids':[state['cid']]}]})
                out=execute(tmp,'question',caller=caller,config={'configured':True,'missing':[]})
                self.assertEqual(state['drafts'],2);self.assertEqual(state['final_reviews'],2)
                self.assertEqual(out['status'],'MODEL_ANSWER_PENDING_HUMAN_REVIEW' if second_pass else 'FINAL_ANSWER_REVIEW_FAILED')
                if not second_pass:self.assertEqual(out['answer_sections'],[])
                self.assertFalse(out['verified'])

    def test_malformed_extraction_gets_one_repair_and_all_gates_still_apply(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);eid=collect(tmp)[0][0]['evidence_id'];calls=[]
            def caller(role,prompt):
                calls.append(role)
                if len(calls)==1:return response({'items':[item(eid,actors=[{'name':'invented'}])]})
                if len(calls)==2:
                    self.assertIn('REPAIR:',prompt)
                    return response({'items':[item(eid,quote='An invented historical quote.') ]})
                raise AssertionError('Repair budget exceeded')
            out=execute(tmp,'question',caller=caller,config={'configured':True,'missing':[]})
            self.assertEqual(out['status'],'EXTRACTION_FAILED_OR_UNSUPPORTED')
            self.assertEqual(out['claims'],[])
            self.assertEqual(len(calls),2)

    def test_indexed_review_requires_explicit_unique_decisions(self):
        claims=[{'claim_id':'a'},{'claim_id':'b'}]
        partial=normalize_review({'decisions':[{'claim_index':0,'decision':'SUPPORTED','reason':'quote supports it'}]},claims)
        self.assertEqual(partial['supported_claim_ids'],['a'])
        self.assertEqual(partial['missing_claim_ids'],['b'])
        for index in (True,-1,2,[0]):
            self.assertIsNone(normalize_review({'decisions':[{'claim_index':index,'decision':'SUPPORTED','reason':'reason'}]},claims))
        row={'claim_index':0,'decision':'SUPPORTED','reason':'literal'}
        self.assertIsNone(normalize_review({'decisions':[row,row]},claims))
        self.assertIsNone(normalize_review({'supported_claim_ids':['a'],'flagged_claims':[{'claim_id':'a','reason':'conflict'}]},claims))

    def test_missing_decision_is_repaired_once_or_fails_closed(self):
        for repair_ok in (True,False):
            with tempfile.TemporaryDirectory() as tmp:
                fixture(tmp);eid=collect(tmp)[0][0]['evidence_id'];state={'reviews':0}
                def caller(role,prompt):
                    if role=='evidence_extractor':return response({'items':[item(eid)]})
                    if role=='adversarial_reviewer':
                        if 'FINAL_ANSWER_JSON:' in prompt:return response({'supported_section_indexes':[0],'flagged_sections':[]})
                        state['reviews']+=1
                        claims=json.loads(prompt.split('CLAIMS_JSON:\n')[1]);state['cid']=claims[0]['claim_id']
                        return response({'decisions':[{'claim_index':0,'decision':'SUPPORTED','reason':'faithful quotation'}] if repair_ok and state['reviews']==2 else []})
                    return response({'answer_sections':[{'text':'Η πηγή αναφέρει επίθεση το 1677.','claim_ids':[state['cid']]}]})
                out=execute(tmp,'question',caller=caller,config={'configured':True,'missing':[]})
                self.assertEqual(state['reviews'],2)
                self.assertEqual(out['status'],'MODEL_ANSWER_PENDING_HUMAN_REVIEW' if repair_ok else 'REVIEW_INCOMPLETE')
                self.assertFalse(out['verified'])
                if not repair_ok:self.assertEqual(out['answer_sections'],[])

    def test_final_review_requires_concrete_spans_and_complete_decisions(self):
        sections=[{'text':'According to the source, ships attacked in 1677.'}]
        decision={'section_index':0,'source_support_reason':'The quotation gives this year.',
                  'unsupported_answer_spans':[],'decision':'SUPPORTED'}
        normalized=normalize_final_review({'section_decisions':[decision]},sections)
        self.assertEqual(normalized['supported_section_indexes'],[0])
        self.assertEqual(normalized['flagged_sections'],[])
        for invalid in ([],[decision,decision],[{**decision,'decision':'UNSUPPORTED'}],
                        [{**decision,'unsupported_answer_spans':['1677']}],
                        [{**decision,'decision':'UNSUPPORTED','unsupported_answer_spans':['generic placeholder']}],
                        [{**decision,'section_index':True}]):
            self.assertIsNone(normalize_final_review({'section_decisions':invalid},sections))
        rejected={**decision,'decision':'UNSUPPORTED','unsupported_answer_spans':['1677']}
        normalized=normalize_final_review({'section_decisions':[rejected]},sections)
        self.assertEqual(normalized['supported_section_indexes'],[])
        self.assertEqual(normalized['flagged_sections'][0]['unsupported_answer_spans'],['1677'])

    def test_passage_selection_copies_original_without_generated_quote(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);rows,_=collect(tmp);eid=rows[0]['evidence_id']
            value=item(eid,passage_ids=[0]);value.pop('quote')
            accepted,rejected=validate_items({'items':[value]},rows)
            self.assertFalse(rejected)
            self.assertEqual(accepted[0]['quote'],'In 1677 the ships attacked the island.')
            for ids in ([99],[-1],[True],[1,0],[0,0]):
                self.assertFalse(validate_items({'items':[{**value,'passage_ids':ids}]},rows)[0])
            self.assertFalse(validate_items({'items':[{**value,'quote':'Invented quote'}]},rows)[0])

    def test_model_passages_do_not_repeat_engine_only_offsets(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);row=collect(tmp)[0][0]
            wire=model_evidence(row)
            self.assertTrue(wire['passages'])
            self.assertTrue(all(set(p)=={'passage_id','text'} for p in wire['passages']))
            self.assertEqual(''.join(p['text'] for p in wire['passages']),row['text'])

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
            for changes in ({'quote':'Invented passage which is not in the source.'},{'actors':['Someone Else']},{'dates':['1680'],'statement':'The event occurred in 1680.'},{'verified':True},{'evidence_id':'invented'},{'evidence_id':[]}):
                ok,bad=validate_items({'items':[item(eid,**changes)]},rows)
                self.assertEqual(ok,[]);self.assertTrue(bad)

    def test_bad_optional_date_does_not_erase_valid_source_quotation(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);rows,_=collect(tmp);eid=rows[0]['evidence_id']
            ok,bad=validate_items({'items':[item(eid,dates=['1680'],source_type='PRIMARY_SOURCE')]},rows)
            self.assertEqual(ok[0]['quote'],TEXT)
            self.assertEqual(ok[0]['dates'],[])
            self.assertEqual(ok[0]['source_classification'],'UNVERIFIED')
            self.assertIn('UNSUPPORTED_DATE_ATTRIBUTE_REMOVED',[x['reason'] for x in bad])

    def test_call_budget_retains_explicit_deferred_coverage(self):
        rows=[{'evidence_id':str(i),'text':'x'*90} for i in range(8)]
        groups,deferred=batches(rows,max_batches=2,budget=200)
        self.assertEqual(len(groups),2);self.assertEqual(len(deferred),6)

    def run_pipeline(self,root,bad_review=False,bad_synthesis=False,fail_role=None,bad_final=False):
        rows,_=collect(root);eid=rows[0]['evidence_id'];state={}
        def caller(role,prompt):
            if role==fail_role:return {'status':'FALLBACK_REQUIRED','error':'NETWORK_UNAVAILABLE'}
            if role=='evidence_extractor':return response({'items':[item(eid)]})
            if role=='adversarial_reviewer':
                if 'FINAL_ANSWER_JSON:' in prompt:return response({'supported_section_indexes':[[0]] if bad_final else [0],'flagged_sections':[]})
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
            self.assertEqual([c['role'] for c in out['calls']],['evidence_extractor','adversarial_reviewer','synthesis','adversarial_reviewer'])
            self.assertTrue(out['model_used']);self.assertFalse(out['verified']);self.assertFalse(out['human_reviewed'])
            self.assertIn('https://example.org/source',render(out))

    def test_unknown_review_and_answer_citations_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp)
            self.assertEqual(self.run_pipeline(tmp,bad_review=True)['status'],'REVIEW_FAILED')
            self.assertEqual(self.run_pipeline(tmp,bad_synthesis=True)['status'],'SYNTHESIS_REJECTED_INVALID_CITATIONS')

    def test_final_review_schema_failure_cannot_publish_answer(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);out=self.run_pipeline(tmp,bad_final=True)
            self.assertEqual(out['status'],'FINAL_ANSWER_REVIEW_FAILED')
            self.assertEqual(out['answer_sections'],[])

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
