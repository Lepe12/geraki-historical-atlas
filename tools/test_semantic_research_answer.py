"""Deterministic protocol tests with simulated model responses; no live API use."""
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from semantic_research_answer import collect,batches,execute,validate_items,configuration,render,geographic_claim_hold_reason,normalize_review,normalize_final_review,model_evidence
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
    def test_human_eponym_is_not_itself_a_spatial_name(self):
        quote='Ένα αγκυροβόλιο φέρει το όνομα του Creveliers, προφανώς λόγω του θανάτου του. Πρόκειται για το «Port Couvelier» στη θέση του Βαθιού.'
        self.assertEqual(geographic_claim_hold_reason({'quote':quote,'places':['Creveliers'],'usage_type':'ANCHORAGE'}),'PERSON_MENTION_REQUIRES_EXPLICIT_SPATIAL_NAME')
        self.assertIsNone(geographic_claim_hold_reason({'quote':quote,'places':['Port Couvelier'],'usage_type':'ANCHORAGE'}))

    def test_ambush_in_comparison_does_not_establish_a_raid_at_other_harbor(self):
        quote='Το «Λιμάνι Creveliers» δεν είναι το μοναδικό. Ένας από τους όρμους των Φούρνων ονομάζεται όρμος Μανέτα, συνεργάτη του Creveliers. Το νησιωτικό σύμπλεγμα ήταν γνωστός τόπος ενέδρας.'
        self.assertEqual(geographic_claim_hold_reason({'quote':quote,'places':['Λιμάνι Creveliers'],'usage_type':'RAID_LOCATION'}),'RAID_LOCATION_NOT_STATED_IN_SELECTED_QUOTE')
        self.assertEqual(geographic_claim_hold_reason({'quote':quote,'places':['Creveliers'],'usage_type':'ANCHORAGE'}),'PERSON_MENTION_REQUIRES_EXPLICIT_SPATIAL_NAME')

    def test_stored_green_paragraph_is_withheld_without_modifying_original_record(self):
        from research_validation_report import apply_current_geographic_gate
        original={'request_kind':'topic','status':'MODEL_ANSWER_PENDING_HUMAN_REVIEW',
                  'claims':[{'claim_id':'wrong','quote':'An ambush near the harbor.','places':['Harbor'],'usage_type':'RAID_LOCATION'}],
                  'answer_sections':[{'text':'The harbor was raided.','claim_ids':['wrong']}]}
        report={'status':'PROVISIONAL_RESEARCH_PIPELINE_PASSED','blockers':[]}
        answer,validation=apply_current_geographic_gate(original,report)
        self.assertEqual(answer['answer_sections'],[])
        self.assertEqual(len(answer['withheld_answer_sections']),1)
        self.assertEqual(validation['status'],'INCOMPLETE')
        self.assertEqual(len(original['answer_sections']),1)
        self.assertEqual(report['status'],'PROVISIONAL_RESEARCH_PIPELINE_PASSED')

    def test_geographic_export_rechecks_old_supported_claims(self):
        from research_geographic_findings import build
        answer={'claims':[{'claim_id':'wrong','evidence_id':'e','quote':'A harbor and an ambush.',
                           'places':['harbor'],'usage_type':'RAID_LOCATION'}],
                'review':{'supported_claim_ids':['wrong']},'evidence':[]}
        self.assertEqual(build(answer)['findings'],[])

    def test_corsair_church_is_not_automatically_a_base_and_letters_are_not_anchorages(self):
        self.assertEqual(geographic_claim_hold_reason({'quote':'The Tuscan corsair built a Catholic church honoring Saint George in Ayionissi in 1695.','places':['Ayionissi'],'usage_type':'BASE'}),'PLACE_USAGE_NOT_STATED_IN_SELECTED_QUOTE')
        self.assertEqual(geographic_claim_hold_reason({'quote':'The study will also benefit from correspondences of those who served in Izmir.','places':['Izmir'],'usage_type':'ANCHORAGE'}),'METHODOLOGICAL_SOURCE_DESCRIPTION_NOT_HISTORICAL_FINDING')

    def test_explicit_anchorages_are_not_suppressed(self):
        quote='Astypalaia provided provisions and plenty of safe anchorages for the corsairs.'
        self.assertIsNone(geographic_claim_hold_reason({'quote':quote,'places':['Astypalaia'],'usage_type':'ANCHORAGE'}))

    def test_long_s_ocr_name_variant_is_accepted_only_with_uncertainty(self):
        text='Le troifiéme fut Jean Capfi , Grec de Milo , qui fe fit Roi en 1677.'
        row={'evidence_id':'e','text':text,'years_in_scope':[1677],'occurrences':[],'uncertainties':[]}
        value=item('e',quote=text,statement='Ο Jean Capsi έγινε βασιλιάς το 1677.',actors=['Jean Capsi'],places=['Milo'],dates=['1677'])
        accepted,rejected=validate_items({'items':[value]},[row],'person')
        self.assertFalse(rejected);self.assertEqual(accepted[0]['actors'],['Jean Capfi'])
        self.assertIn('OCR_LONG_S_NAME_VARIANT',accepted[0]['uncertainty'])
        # A different name, or the variant applied to dates, still fails.
        for change in ({'actors':['Jean Capsis']},{'actors':['Jean Kapsi']}):
            self.assertEqual(validate_items({'items':[{**value,**change}]},[row],'person')[1][0]['reason'],'ENTITY_OR_DATE_NOT_IN_CITED_EVIDENCE')
        dated=validate_items({'items':[{**value,'dates':['1678']}]},[row],'person')[0]
        self.assertFalse(any('1678' in x.get('dates',[]) for x in dated))
        exact=item('e',quote=text.replace('Capfi','Capsi'),actors=['Jean Capsi'],places=['Milo'],dates=['1677'])
        plain={**row,'text':exact['quote']}
        self.assertNotIn('OCR_LONG_S_NAME_VARIANT',validate_items({'items':[exact]},[plain],'person')[0][0]['uncertainty'])

    ANCHOR_TEXT=('Le troifiéme Aventurier fut Marc Baffo; c\'étoit un Grec de Milo, qui fçavoit la mer, '
                 '& avoit été long-tems pilote fur les vaiffeaux du Roi. Aprés s\'être rendu fameux par quantité de courfes; '
                 'il hazarda de fe faire le Maitre de l\'Ifle, & fa tentative réuffit.')

    def anchor_row(self,text=None,split=None):
        text=text or self.ANCHOR_TEXT
        bounds=[{'scan_index_0_based':40,'start_char':100,'end_char':100+len(text)+1}]
        if split is not None:
            bounds=[{'scan_index_0_based':40,'start_char':100,'end_char':100+split},
                    {'scan_index_0_based':41,'start_char':100+split,'end_char':100+len(text)+1}]
        return {'evidence_id':'e','text':text,'years_in_scope':[],'uncertainties':[],
                'occurrences':[{'locator':{'start_char':100},'page_boundaries':bounds}]}

    def anchor_ids(self,row,first,last):
        from semantic_research_answer import passages
        parts=passages(row['text']);segment=lambda i:row['text'][parts[i]['start_char']:parts[i]['end_char']]
        a=next(i for i in range(len(parts)) if first in segment(i));b=next(i for i in range(len(parts)) if last in segment(i))
        return list(range(a,b+1))

    def anchored(self,row,ids,statement='Ο Marc Basso ήταν Έλληνας από τη Μήλο και πιλότος.'):
        value=item('e',quote=None,statement=statement,actors=['Marc Basso'],places=[],dates=[],passage_ids=ids)
        value.pop('quote')
        return validate_items({'items':[value]},[row],'person',(1600,1700),['Μάρκος Μπάσσος','Marc Basso'])

    def test_identity_anchor_in_preceding_passage_on_same_page(self):
        row=self.anchor_row();ids=self.anchor_ids(row,'Grec de Milo','pilote')
        accepted,rejected=self.anchored(row,ids)
        self.assertFalse(rejected);claim=accepted[0]
        self.assertNotIn('Basso',claim['quote']);self.assertNotIn('Baffo',claim['quote'])
        self.assertIn(claim['quote'],row['text'])
        self.assertIn('IDENTITY_FROM_SAME_PASSAGE_ANCHOR',claim['uncertainty'])
        self.assertIn('OCR_LONG_S_NAME_VARIANT',claim['uncertainty'])
        anchor=claim['identity_anchors'][0]
        self.assertEqual(anchor['anchor_quote'],'Marc Baffo');self.assertEqual(anchor['scan_index_0_based'],40)
        self.assertEqual(row['text'][anchor['anchor_offset_in_excerpt']:].split(';')[0],'Marc Baffo')
        # Without target names (old callers) nothing changes.
        value=item('e',quote=None,actors=['Marc Basso'],places=[],dates=[],passage_ids=ids);value.pop('quote')
        self.assertEqual(validate_items({'items':[value]},[row],'person')[1][0]['reason'],'ENTITY_OR_DATE_NOT_IN_CITED_EVIDENCE')

    def test_identity_anchor_never_reaches_distant_passage_or_other_page(self):
        row=self.anchor_row();ids=self.anchor_ids(row,'hazarda','réuffit')
        self.assertEqual(self.anchored(row,ids)[1][0]['reason'],'ENTITY_OR_DATE_NOT_IN_CITED_EVIDENCE')
        split=self.ANCHOR_TEXT.index('c\'étoit')
        paged=self.anchor_row(split=split);ids=self.anchor_ids(paged,'Grec de Milo','pilote')
        self.assertEqual(self.anchored(paged,ids)[1][0]['reason'],'ENTITY_OR_DATE_NOT_IN_CITED_EVIDENCE')

    def test_identity_anchor_rejected_when_another_person_is_named(self):
        text=self.ANCHOR_TEXT.replace('c\'étoit un Grec','Pierre Durand étoit un Grec')
        row=self.anchor_row(text);ids=self.anchor_ids(row,'Grec de Milo','pilote')
        self.assertEqual(self.anchored(row,ids)[1][0]['reason'],'ENTITY_OR_DATE_NOT_IN_CITED_EVIDENCE')
        given=self.ANCHOR_TEXT.replace('fut Marc Baffo;','fut Marc Baffo, frere de Jacques Baffo;')
        row=self.anchor_row(given);ids=self.anchor_ids(row,'Grec de Milo','pilote')
        self.assertEqual(self.anchored(row,ids)[1][0]['reason'],'ENTITY_OR_DATE_NOT_IN_CITED_EVIDENCE')

    def test_explicit_source_century_outside_question_is_held_without_using_publication_dates(self):
        row={'evidence_id':'e','text':'The consulted source describes Milo as a corsair base in the14th century.',
             'years_in_scope':[],'occurrences':[],'uncertainties':[]}
        # Actual output uses a space before the numeric century.
        row['text']=row['text'].replace('the14th','the 14th')
        value=item('e',quote=row['text'],statement=row['text'],places=['Milo'],dates=[])
        accepted,rejected=validate_items({'items':[value]},[row],'topic',(1600,1700))
        self.assertFalse(accepted);self.assertEqual(rejected[0]['reason'],'EXPLICIT_CENTURY_OUTSIDE_REQUESTED_PERIOD')
        self.assertTrue(validate_items({'items':[value]},[row],'topic',(1300,1400))[0])

    def test_uncited_gap_paragraph_gets_one_format_repair_before_fidelity_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);eid=collect(tmp)[0][0]['evidence_id'];state={'drafts':0}
            def caller(role,prompt):
                if role=='evidence_extractor':return response({'items':[item(eid)]})
                if role=='adversarial_reviewer':
                    if 'FINAL_ANSWER_JSON:' in prompt:return response({'supported_section_indexes':[0],'flagged_sections':[]})
                    cid=json.loads(prompt.split('CLAIMS_JSON:\n')[1])[0]['claim_id'];state['cid']=cid
                    return response({'supported_claim_ids':[cid],'flagged_claims':[]})
                state['drafts']+=1
                sections=[{'text':'The source reports an attack in1677.','claim_ids':[state['cid']]}]
                if state['drafts']==1:sections.append({'text':'Some research gaps remain.','claim_ids':[]})
                else:self.assertIn('FORMAT REPAIR:',prompt)
                return response({'answer_sections':sections,'unknowns':['Research gaps remain.'],'limitations':[]})
            out=execute(tmp,'question',caller=caller,config={'configured':True,'missing':[]})
            self.assertEqual(state['drafts'],2);self.assertEqual(len(out['synthesis_protocol_repairs']),1)
            self.assertEqual(out['status'],'MODEL_ANSWER_PENDING_HUMAN_REVIEW')

    def test_resume_replays_extractor_receipts_and_runs_new_reviews_without_new_extraction(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp);original=self.run_pipeline(tmp)
            path=Path(tmp)/'research_answer/answer.json';path.write_text(json.dumps(original))
            calls=[];cid=original['claims'][0]['claim_id']
            def caller(role,prompt):
                calls.append(role);self.assertNotEqual(role,'evidence_extractor')
                if role=='adversarial_reviewer':
                    return response({'supported_section_indexes':[0],'flagged_sections':[]} if 'FINAL_ANSWER_JSON:' in prompt else {'supported_claim_ids':[cid],'flagged_claims':[]})
                return response({'answer_sections':[{'text':'The consulted source reports an attack in1677.','claim_ids':[cid]}]})
            out=execute(tmp,original['question'],caller=caller,config={'configured':True,'missing':[]},
                        output_root=Path(tmp)/'recovered',resume_reviewed_from=path)
            self.assertEqual(out['status'],'MODEL_ANSWER_PENDING_HUMAN_REVIEW')
            self.assertEqual(calls,['adversarial_reviewer','synthesis','adversarial_reviewer'])
            self.assertEqual(len(out['reused_semantic_calls']),1)
            self.assertFalse(out['resume_context']['new_extraction_performed'])
            destination=Path(tmp)/'recovered/research_answer';destination.mkdir(exist_ok=True)
            (destination/'answer.json').write_text(json.dumps(out))
            from research_validation_report import build as validate_research
            report=validate_research(Path(tmp),Path(tmp)/'probes',analysis_root=Path(tmp)/'recovered')
            self.assertTrue(report['reused_extraction_receipts_validated'])
            self.assertNotIn('SEMANTIC_STAGES_INCOMPLETE',report['blockers'])
            # Altering an old response prevents reuse, even though its source
            # quotation and the claimed previous verdict still exist.
            response_file=path.parent/'model_responses/1-evidence_extractor.json'
            response_file.write_text('{"status":"COMPLETED","content":"{}"}')
            report=validate_research(Path(tmp),Path(tmp)/'probes',analysis_root=Path(tmp)/'recovered')
            self.assertFalse(report['reused_extraction_receipts_validated'])
            self.assertIn('REUSED_EXTRACTION_RECEIPTS_NOT_VALIDATED',report['blockers'])
            blocked=execute(tmp,original['question'],caller=caller,config={'configured':True,'missing':[]},
                            output_root=Path(tmp)/'blocked',resume_reviewed_from=path)
            self.assertEqual(blocked['status'],'BLOCKED_RESUME_PROVENANCE')

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
            accepted,rejected=validate_items({'items':[item(eid)]},rows,'person')
            self.assertFalse(accepted)
            self.assertEqual(rejected[0]['reason'],'PERSON_FINDING_REQUIRES_LITERAL_ACTOR')

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

    def test_supported_paragraphs_survive_only_after_new_subset_review(self):
        for subset_passes in (True,False):
            with tempfile.TemporaryDirectory() as tmp:
                fixture(tmp);eid=collect(tmp)[0][0]['evidence_id'];state={'reviews':0,'ids':[]}
                def caller(role,prompt):
                    if role=='evidence_extractor':return response({'items':[item(eid),item(eid,statement='The account is uncertain.')]})
                    if role=='adversarial_reviewer':
                        if 'FINAL_ANSWER_JSON:' not in prompt:
                            cid=json.loads(prompt.split('CLAIMS_JSON:\n')[1])[0]['claim_id'];state['ids'].append(cid)
                            return response({'supported_claim_ids':[cid],'flagged_claims':[]})
                        state['reviews']+=1
                        sections=json.loads(prompt.split('FINAL_ANSWER_JSON:\n')[1])['sections']
                        if state['reviews']<3:
                            return response({'supported_section_indexes':[0],'flagged_sections':[{'index':1,'reason':'Invented2001 date'}]})
                        self.assertEqual(len(sections),1)
                        self.assertNotIn('2001',sections[0]['text'])
                        return response({'supported_section_indexes':[0] if subset_passes else [],'flagged_sections':[] if subset_passes else [{'index':0,'reason':'Unresolved support'}]})
                    return response({'answer_sections':[{'text':'The source reports an attack in1677.','claim_ids':[state['ids'][0]]},
                                                        {'text':'The source reports an attack in2001.','claim_ids':[state['ids'][1]]}]})
                out=execute(tmp,'question',caller=caller,config={'configured':True,'missing':[]})
                self.assertEqual(state['reviews'],3)
                self.assertEqual(out['status'],'MODEL_ANSWER_PENDING_HUMAN_REVIEW' if subset_passes else 'FINAL_ANSWER_REVIEW_FAILED')
                self.assertEqual(len(out['answer_sections']),1 if subset_passes else 0)
                self.assertEqual(len(out['excluded_answer_sections']),1)
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

    def test_replay_removes_address_year_without_rewriting_acquired_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp)
            base=Path(tmp)/'travellers';p=base/'structured_output/extracted_findings.json'
            text='In 1677 the ships attacked the island. The address was Street 1292.'
            (base/'library_acquisition/doc.txt').write_text(text)
            data=json.loads(p.read_text());f=data['findings'][0]
            f.update(evidence_excerpt=text,source_text_sha256=hashlib.sha256(text.encode()).hexdigest(),years_in_scope=[1292,1677])
            f['locator'].update(start_char=0,end_char=len(text))
            p.write_text(json.dumps(data));before=p.read_bytes()
            rows,_=collect(tmp)
            self.assertEqual(rows[0]['years_in_scope'],[1677])
            self.assertEqual(rows[0]['text'],text)
            self.assertEqual(p.read_bytes(),before)

    def test_bibliographic_reference_in_history_book_is_a_lead_not_an_answer(self):
        from semantic_research_answer import person_passage_hold_reason
        request={'target':'Πέτρος Λάντζας','aliases':['Pedro Lanza'],'date_range':''}
        text='Μιχαήλ Θ. Λάσκαρις, «Πέτρος Λάντζας, διοικητής της Πάργας», Αθήνα 1956, 237–253.'
        reason=person_passage_hold_reason(text,'Ιστορία του Νέου Ελληνισμού',request,[])
        self.assertEqual(reason,'BIBLIOGRAPHIC_REFERENCE_REQUIRES_CITED_WORK_ACQUISITION')
        narrative='Ο Πέτρος Λάντζας διορίστηκε το 1573.'
        self.assertIsNone(person_passage_hold_reason(narrative,'Ιστορία',request,[]))
        damaged='ᾱ, Ἑλ. Μ. «άσκαρι, Ὁ Κερκυραῖος Πέτρος Λάντζας, «Αφιέρωμα εις την Ήπειρον», Αθήναι 1956, σ. 251.'
        self.assertEqual(person_passage_hold_reason(damaged,'Ιστορία',request,[]),reason)
        narrative_with_reference='Ο Πέτρος Λάντζας διορίστηκε το 1573. Βλ. «Μελέτη», Αθήνα 1956, σ. 251.'
        self.assertIsNone(person_passage_hold_reason(narrative_with_reference,'Ιστορία',request,[]))

    def test_empty_attribution_scaffold_is_not_a_synthesized_answer(self):
        from semantic_research_answer import valid_synthesis
        for text in ('According to the consulted source ...','According to the source…','Σύμφωνα με την πηγή ...'):
            self.assertFalse(valid_synthesis({'answer_sections':[{'text':text,'claim_ids':['c-real']}]},{'c-real'}))
        self.assertTrue(valid_synthesis({'answer_sections':[{'text':'According to the source, the captain was captured.','claim_ids':['c-real']}]},{'c-real'}))

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

    def test_exception_retains_exact_prompt_and_code_provenance_before_model_completion(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp)
            def caller(role,prompt):raise TimeoutError('simulated interrupted provider')
            with self.assertRaises(TimeoutError):
                execute(tmp,'Synthetic question',caller=caller,config={'configured':True,'missing':[]})
            destination=Path(tmp)/'research_answer'
            progress=json.loads((destination/'progress.json').read_text())
            entry=progress['calls'][0]
            self.assertEqual(entry['status'],'FAILED')
            self.assertEqual(entry['error_type'],'TimeoutError')
            self.assertTrue(entry['completed_utc'])
            self.assertEqual(hashlib.sha256((destination/entry['prompt_file']).read_bytes()).hexdigest(),entry['prompt_sha256'])
            self.assertTrue(progress['semantic_module_sha256'])

    def test_client_rejects_credential_url_and_redacts_exception(self):
        env={'PCT_LLM_PROVIDER':'openai_compatible','PCT_LLM_SYNTHESIS_MODEL':'m','PCT_LLM_API_KEY':'test-secret',
             'PCT_LLM_BASE_URL':'https://user:password@example.org/v1'}
        with patch.dict(os.environ,env,clear=True):
            self.assertEqual(call('synthesis','test')['error'],'INVALID_LLM_BASE_URL')
        env['PCT_LLM_BASE_URL']='https://example.org/v1'
        with patch.dict(os.environ,env,clear=True),patch('urllib.request.urlopen',side_effect=RuntimeError('test-secret')):
            out=call('synthesis','test')
            self.assertEqual(out['error'],'RuntimeError');self.assertNotIn('test-secret',json.dumps(out))


class NamesakeGuard(unittest.TestCase):
    """Record linkage (namesake_guard): >=2 independent attributes and no deal-breaker."""
    # Verbatim fields of the stored request and OCR passages of run 39902909088.
    REQUEST = {'target': 'Ιωάννης Καψής', 'aliases': ['Ioannis Kapsis', 'Jean Capsis', 'Jean Capsi', 'Giovanni Capsi'],
               'date_range': '1600-1700',
               'purpose': 'Έλεγξε με πραγματικές πηγές την ιστορική ταυτότητα του Ιωάννη Καψή και την αναφορά σε βασιλιά της Μήλου.'}
    MP = ('α) Ο βουλευτής Ιωάννης Καψής, Πρόεδρος της Ειδικής Κοινοβουλευτικής Επιτροπής Θεσμών και Διαφάνειας, '
          'β) Ο Χρήστος Πολυζωγόπουλος. ως εκπρόσωπος της Γ.Σ.Ε.Ε.')
    SAULGER = ("JEAN CAPSI. E troifiéme Aventurier fut Jean A Capfi; c'éroit un Grec de Milo, qui fçavoit tres bien "
               "la mer , & qui avoit été long-tems pilote far les ναί < feaux du Roi; homme; au refte")
    DIADROMI = ('Η Μήλος εν µέσω οθωμανικής κυριαρχίας, το 1677 απέ- κτησε πειρατή βασιλιά! Ο Ιωάννης Κάψης µε τα '
                'αδέρφια του Τροµάρα και Νίκο εξορμούσαν µε δύο γαλέρες')
    MAYNARD_A = ("Les corsaires chrétiens, qui tenaient les mers du Le- vant et y faisaient une guerre incessante aux Turcs, "
                 "se donnaient rendez-vous à Milo. L'un d'eux, Jean Capsi, se rendit maître de l'ile entière.")
    MAYNARD_B = ("Un capitan-pacha, sous prétexte de traiter de la paix, l'attira dans sa galère, et le conduisit, chargé "
                 "de chaînes, à Constantinople. Quelques jours après, on pendait sire Jean Capsi à la porte du bagne.")
    GAZETTE = 'ΙΩΑΝΝΗΣ ΚΑΨΗΣ'
    NAME_LIST = ('Ασσυχίδου Ελισσάβετ του Κυριάκου Γιωτοπούλου Αθανασία του Σωτηρίου - Παντελή Ηλιοπούλου '
                 'Βενετία του Ιωάννη Καψής Ιωάννης του Παναγιώτη Μπακογιάννη Αικατερίνη του Δημητρίου')

    def row(self, eid, text, year=None, title='t'):
        return {'evidence_id': eid, 'text': text, 'years_in_scope': [], 'uncertainties': [],
                'source_bibliography': {'date': [str(year)] if year else []},
                'occurrences': [{'title': title, 'locator': {'start_char': 0}, 'page_boundaries': []}]}

    def rows(self):
        return [self.row('mp', self.MP, 1999, 'Greek Government Gazette 1999'),
                self.row('saulger', self.SAULGER, 1698, 'Saulger, Histoire nouvelle'),
                self.row('diadromi', self.DIADROMI, None, 'Διαδρομή Ελευθερίας 174'),
                self.row('maynard-a', self.MAYNARD_A, 1855, 'Impressions de voyage'),
                self.row('maynard-b', self.MAYNARD_B, 1855, 'Impressions de voyage'),
                self.row('gazette', self.GAZETTE, 1987, 'Greek Government Gazette 1987'),
                self.row('name-list', self.NAME_LIST, 1995, 'Greek Government Gazette 1995'),
                self.row('unnamed', 'Le Capitan Bacha crut qu il falloit ufer d artifice.', 1698, 'Saulger, Histoire nouvelle')]

    def test_classification_records_attributes_and_deal_breakers(self):
        from namesake_guard import classify
        rows = self.rows(); before = json.dumps(rows, sort_keys=True)
        out, report = classify(rows, self.REQUEST)
        self.assertEqual(json.dumps(rows, sort_keys=True), before)
        self.assertTrue(report['enforced'])
        status = {k: v['status'] for k, v in out.items()}
        self.assertEqual(status['mp'], 'DIFFERENT_PERSON')
        self.assertEqual(out['mp']['deal_breakers'][0]['deal_breaker'], 'CONFLICTING_MODERN_OFFICE')
        for eid in ('saulger', 'diadromi', 'maynard-a', 'maynard-b'):
            self.assertEqual(status[eid], 'LINKED', eid)
            self.assertGreaterEqual(len(out[eid]['attribute_types_matched']), 2)
        self.assertEqual({m['attribute'] for m in out['saulger']['matched_attributes']}, {'place', 'role', 'source_date'})
        # 'Η Μήλος' matches through the sourced gazetteer variant Μήλος of the target's place.
        self.assertEqual({m['attribute'] for m in out['diadromi']['matched_attributes']}, {'place', 'role', 'date'})
        # The bagne passage names no place or role; they come from the same work, and say so.
        self.assertEqual({m['scope'] for m in out['maynard-b']['matched_attributes']}, {'same_document'})
        self.assertEqual(status['gazette'], 'POSSIBLE'); self.assertEqual(out['gazette']['matched_attributes'], [])
        self.assertEqual(status['name-list'], 'POSSIBLE')
        self.assertEqual(status['unnamed'], 'NO_TARGET_NAME_IN_PASSAGE')
        # Attributes come only from the request: no kin is checked unless supplied.
        self.assertNotIn('kin', report['profile']['attributes'])

    def test_date_far_outside_lifetime_is_a_deal_breaker(self):
        from namesake_guard import classify
        out, _ = classify([self.row('late', 'Ο Ιωάννης Καψής στη Μήλο το 1999.', None, 'x')], self.REQUEST)
        self.assertEqual(out['late']['status'], 'DIFFERENT_PERSON')
        self.assertEqual(out['late']['deal_breakers'][0]['deal_breaker'], 'DATE_FAR_OUTSIDE_LIFETIME')

    def test_thin_profile_only_applies_deal_breakers(self):
        from namesake_guard import classify
        request = {k: v for k, v in self.REQUEST.items() if k != 'purpose'}
        out, report = classify(self.rows(), request)
        self.assertFalse(report['enforced'])
        self.assertEqual(out['gazette']['status'], 'NOT_ENFORCED_PROFILE_TOO_THIN')
        self.assertEqual(out['mp']['status'], 'DIFFERENT_PERSON')

    def test_only_linked_mentions_support_claims(self):
        from namesake_guard import classify
        rows = self.rows(); linkage, _ = classify(rows, self.REQUEST)
        def claim(eid, quote, actor):
            return item(eid, quote=quote, statement='Η πηγή αναφέρει τον ' + actor + '.', actors=[actor], places=[], dates=[])
        cases = [('mp', self.MP, 'Ιωάννης Καψής'), ('name-list', self.NAME_LIST, 'Καψής Ιωάννης'),
                 ('maynard-a', self.MAYNARD_A, 'Jean Capsi')]
        results = {eid: validate_items({'items': [claim(eid, q, a)]}, rows, 'person', (1600, 1700),
                                       ['Ιωάννης Καψής', 'Jean Capsi'], linkage) for eid, q, a in cases}
        self.assertEqual(results['mp'][1][0]['reason'], 'NAMESAKE_DIFFERENT_PERSON')
        self.assertEqual(results['name-list'][1][0]['reason'], 'IDENTITY_LINKAGE_ONLY_POSSIBLE')
        self.assertEqual(results['name-list'][1][0]['identity_linkage']['status'], 'POSSIBLE')
        accepted = results['maynard-a'][0]
        self.assertEqual(len(accepted), 1); self.assertEqual(accepted[0]['identity_linkage']['status'], 'LINKED')
        # Without linkage (old callers) the MP claim is not affected by the guard.
        self.assertTrue(validate_items({'items': [claim(*cases[0])]}, rows, 'person')[0])


class PlaceResolver(unittest.TestCase):
    """Sourced gazetteer (Wikidata, CC0) and place-mention resolver."""
    RUN = Path(__file__).resolve().parent.parent / 'evidence/runs/39902909088'

    @classmethod
    def setUpClass(cls):
        from place_resolver import load
        cls.g = load()
        cls.by_title = {p['seed_title']: p['id'] for p in cls.g['doc']['places']}

    def first(self, text):
        from place_resolver import resolve
        hits = resolve(text)
        self.assertTrue(hits, text)
        return hits[0]

    def test_every_place_and_variant_is_sourced(self):
        doc = self.g['doc']
        self.assertIn('CC0', doc['licences']['wikidata'])
        for p in doc['places']:
            src = 'https://www.wikidata.org/wiki/' + p['wikidata']
            self.assertTrue(p['coordinates'] and p['coordinates']['source'] == src + '#P625', p['id'])
            for v in p['variants']:
                self.assertEqual((v['status'], v['source']), ('SOURCED', src))
            self.assertNotIn('corsair_base', p)
            if 'corsair_base_candidate' in p:
                self.assertEqual(p['corsair_base_candidate']['status'], 'CANDIDATE_ONLY_NOT_A_FACT')
        for u in doc['unsourced_variants']:
            self.assertEqual(u['status'], 'UNSOURCED')

    def test_historical_and_foreign_variants_resolve(self):
        cases = {'Grec de Milo': 'Milos', 'de Cerigo': 'Kythira', 'à Zante': 'Zakynthos', 'de Negroponte': 'Euboea',
                 'Napoli di Romania': 'Nafplio', 'Alger': 'Algiers', 'Argel': 'Algiers', 'Sapienza': 'Sapientza',
                 'Itilo': 'Oitylo', 'Smyrne': 'İzmir', 'Santa Maura': 'Lefkada', 'Lepanto': 'Nafpaktos',
                 'στη Μήλο': 'Milos', 'τον Μύτικα της Αιτωλοακαρνανίας': 'elwiki:Μύτικας Αιτωλοακαρνανίας'}
        for text, title in cases.items():
            hit = self.first(text)
            self.assertEqual((hit['status'], hit['place_ids']), ('RESOLVED', [self.by_title[title]]), text)
            self.assertTrue(hit['candidates'][0]['variant_source'].startswith('https://www.wikidata.org/wiki/Q'))
        # Long-s OCR and line-break hyphenation.
        hit = self.first('à Con- ftantinople')
        self.assertEqual(hit['place_ids'], [self.by_title['Constantinople']])
        self.assertEqual(hit['candidates'][0]['method'], 'LONG_S_OCR')
        self.assertEqual(self.first('de Marfeille')['place_ids'], [self.by_title['Marseille']])

    def test_ambiguous_and_unsourced_names_are_not_guessed(self):
        from place_resolver import resolve
        candia = self.first('à Candia')
        self.assertEqual(candia['status'], 'AMBIGUOUS')
        self.assertEqual(set(candia['place_ids']), {self.by_title['Crete'], self.by_title['Heraklion']})
        self.assertEqual(self.first('Tripoli')['status'], 'AMBIGUOUS')
        self.assertEqual(self.first('Thera')['status'], 'AMBIGUOUS')
        self.assertIn('COMMON_WORD_COLLISION', self.first('Sale et Milo')['reasons'])
        self.assertEqual(self.first('Salé')['status'], 'RESOLVED')
        unsourced = {u['name'] for u in self.g['doc']['unsourced_variants']}
        for name in ('Argentiera', 'Vitylo', 'Mili'):
            self.assertIn(name, unsourced); self.assertEqual(resolve(name), [])
        self.assertEqual(resolve('une mile de la ville'), [])

    def test_base_label_needs_supported_cited_claim(self):
        from place_resolver import base_label
        claim = {'claim_id': 'c-1', 'usage_type': 'BASE', 'source_occurrences': [{'url': 'u'}]}
        self.assertEqual(base_label(claim, {'c-1'}), {'label': 'BASE_PER_SUPPORTED_CITED_CLAIM', 'claim_id': 'c-1'})
        self.assertIsNone(base_label(claim, set()))
        self.assertIsNone(base_label({**claim, 'usage_type': 'OTHER'}, {'c-1'}))
        self.assertIsNone(base_label({**claim, 'source_occurrences': []}, {'c-1'}))

    def test_annotate_records_links_on_passages_and_claims(self):
        from place_resolver import annotate
        answer = {'evidence': [{'evidence_id': 'e', 'text': "L'un d'eux, Jean Capsi, se rendit maître de Milo."}],
                  'claims': [{'claim_id': 'c', 'quote': 'maître de Milo'}]}
        annotate(answer)
        self.assertEqual(answer['place_links']['passages']['e'][0]['place_ids'], [self.by_title['Milos']])
        self.assertEqual(answer['claims'][0]['place_links'][0]['surface'], 'Milo')

    def test_namesake_profile_uses_gazetteer_variants(self):
        from namesake_guard import profile
        prof = profile({'target': 'Ιωάννης Καψής', 'date_range': '1600-1700', 'purpose': 'αναφορά σε βασιλιά της Μήλου.'})
        self.assertIn('melos', prof['attributes']['place'])

    @unittest.skipUnless((RUN / 'travellers/library_acquisition/diadromi_174_diadromi_174_djvu.txt').is_file(), 'stored run not checked out')
    def test_replay_stored_kapsis_passages(self):
        from place_resolver import resolve
        files = {'diadromi': 'travellers/library_acquisition/diadromi_174_diadromi_174_djvu.txt',
                 'saulger_336': 'italian_states/library_acquisition/51a1e91aae26bdbdb49d6796.txt',
                 'saulger_340': 'italian_states/library_acquisition/389a2a55a389b0891fab65ff.txt'}
        found = {k: {pid for m in resolve((self.RUN / f).read_text(encoding='utf-8')) if m['status'] == 'RESOLVED'
                     for pid in m['place_ids']} for k, f in files.items()}
        self.assertTrue({self.by_title['Milos'], self.by_title['elwiki:Μύτικας Αιτωλοακαρνανίας']} <= found['diadromi'])
        self.assertIn(self.by_title['Milos'], found['saulger_336'])
        self.assertTrue({self.by_title['Milos'], self.by_title['Constantinople']} <= found['saulger_340'])

if __name__=='__main__':unittest.main()



class PassageTriage(unittest.TestCase):
    """Deterministic pre-model reading order: no model calls, nothing dropped."""
    WORDS = ' '.join(['mot'] * 30)

    def row(self, eid, text, year=None, scan=None, doc='d', flags=()):
        bounds = [{'scan_index_0_based': scan, 'start_char': 0, 'end_char': len(text)}] if scan is not None else []
        return {'evidence_id': eid, 'text': text, 'uncertainties': list(flags),
                'source_bibliography': {'date': [str(year)] if year else [], 'source_type': 'OCR_CONTEXT'},
                'occurrences': [{'source_text_sha256': doc, 'page_boundaries': bounds}]}

    def test_named_early_primary_passages_lead_without_dropping_or_mutating(self):
        from passage_triage import triage
        rows = [self.row('modern-unnamed', self.WORDS, 1999, doc='m1'),
                self.row('modern-named', 'Ο Ιωάννης Κάψη ήταν πειρατής. ' + self.WORDS, 2018, doc='m2'),
                self.row('early-unnamed', self.WORDS, 1698, doc='s'),
                self.row('early-named', 'Le troifiéme fut Jean Capfi; ' + self.WORDS, 1698, scan=336, doc='s')]
        before = json.dumps(rows, sort_keys=True)
        ranked, report = triage(rows, ['Ιωάννης Καψής', 'Jean Capsi'])
        self.assertEqual([r['evidence_id'] for r in ranked], ['early-named', 'modern-named', 'early-unnamed', 'modern-unnamed'])
        self.assertEqual(json.dumps(rows, sort_keys=True), before)
        self.assertEqual(report['model_calls'], 0); self.assertEqual(report['dropped'], 0)
        self.assertEqual(sorted(p['evidence_id'] for p in report['passages']), sorted(r['evidence_id'] for r in rows))
        first = report['passages'][0]
        self.assertEqual((first['rank'], first['previous_rank']), (0, 3))
        self.assertIn('TARGET_NAME_OR_LONG_S_VARIANT_IN_PASSAGE', first['reasons'])
        self.assertIn('PUBLICATION_METADATA_BEFORE_1800', first['reasons'])

    def test_section_continuation_only_from_flag_or_following_scan_of_same_document(self):
        from passage_triage import triage
        rows = [self.row('other-book', self.WORDS, 1698, scan=338, doc='x'),
                self.row('earlier-page', self.WORDS, 1698, scan=335, doc='s'),
                self.row('next-page', self.WORDS, 1698, scan=338, doc='s'),
                self.row('flagged', self.WORDS, 1900, doc='y', flags=['SURNAME_FROM_ADJACENT_NAMED_PAGE']),
                self.row('named', 'JEAN CAPSI. ' + self.WORDS, 1698, scan=336, doc='s')]
        ranked, report = triage(rows, ['Jean Capsi'])
        signal = {p['evidence_id']: p['identity_signal'] for p in report['passages']}
        self.assertEqual(signal, {'named': 2, 'next-page': 1, 'flagged': 1, 'earlier-page': 0, 'other-book': 0})
        block = self.row('page-block', self.WORDS, 1698, doc='z', flags=['SECTION_CONTINUATION_PAGE_BLOCK'])
        self.assertEqual(triage([block], ['Jean Capsi'])[1]['passages'][0]['identity_signal'], 1)
        self.assertEqual([r['evidence_id'] for r in ranked][:3], ['named', 'next-page', 'flagged'])

    def test_ocr_quality_breaks_ties_and_stable_order_otherwise(self):
        from passage_triage import ocr_quality, triage
        noisy = ' '.join(['m0t', '|;', 'fe', '{{', 'x'] * 6)
        rows = [self.row('a', noisy, 1999), self.row('b', self.WORDS, 1999), self.row('c', self.WORDS, 1999),
                self.row('short', 'ΙΩΑΝΝΗΣ ΚΑΨΗΣ', 1999)]
        self.assertEqual(ocr_quality('ΙΩΑΝΝΗΣ ΚΑΨΗΣ'), 0.0)
        self.assertGreater(ocr_quality(self.WORDS), ocr_quality(noisy))
        ranked, _ = triage(rows, ['Jean Capsi'])
        self.assertEqual([r['evidence_id'] for r in ranked], ['b', 'c', 'a', 'short'])
