"""Synthetic reading controls: these fixtures are not historical assertions."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from section_extraction import extract_document, build_findings, answer_report

CTX={'target':'Νίκο Δέλτα','aliases':[],'date_range':'1577-1583','purpose':'Find sources'}
SOURCE={'title':'Νίκος Δέλτας: biography','url':'https://example.org/history','identifier':'document-1',
        'web_acquisition':{'source_type':'WEB_PAGE_TEXT','files':['library_acquisition/doc.txt']}}

class SectionExtraction(unittest.TestCase):
    def extract(self,text,ctx=None,source=None):
        return extract_document(text,source or SOURCE,'doc.txt',ctx or CTX)

    def test_heading_surname_and_exact_acquired_excerpt(self):
        text='1578\r\n\r\nΟ Δέλτας αιχμαλώτισε ένα πλοίο.\r\n\r\n1584\r\n\r\nΟ Δέλτας αναφέρει άλλη αποστολή.'
        rows=self.extract(text)
        self.assertEqual(rows[0]['decision'],'RETAIN_CANDIDATE')
        self.assertEqual(rows[0]['years_in_scope'],[1578])
        self.assertEqual(rows[0]['date_basis'],'YEAR_HEADING')
        for row in rows:
            loc=row['locator'];self.assertEqual(text[loc['start_char']:loc['end_char']],row['evidence_excerpt'])
            self.assertFalse(row['verified']);self.assertFalse(row['original_inspected'])
        self.assertEqual(rows[1]['decision'],'REVIEW_CONTEXT')

    def test_in_scope_explicit_date_does_not_need_piracy_word(self):
        row=self.extract('Ο Νίκος Δέλτας διορίστηκε το 1581.')[0]
        self.assertEqual(row['decision'],'RETAIN_CANDIDATE')
        self.assertEqual(row['actor'],'UNKNOWN');self.assertIsNone(row['place'])

    def test_explicit_outside_date_not_replaced_by_heading(self):
        row=self.extract('1578\n\nΟ Δέλτας αιχμαλώτισε πλοίο το 1590.')[0]
        self.assertEqual(row['years_in_scope'],[])

    def test_unrelated_paragraph_does_not_supply_date(self):
        rows=self.extract('Ο Νίκος Δέλτας ήταν πειρατής.\n\nΤο 1578 ο Γιώργος αιχμαλώτισε πλοίο.')
        self.assertFalse(any(r['decision']=='RETAIN_CANDIDATE' for r in rows))

    def test_surname_requires_named_context_and_other_person_is_held(self):
        self.assertEqual(self.extract('Το 1578 ο Δέλτας αιχμαλώτισε πλοίο.',source={'title':'Other text'}),[])
        row=self.extract('Το 1578 ο Γιώργος Δέλτας αιχμαλώτισε πλοίο.')[0]
        self.assertEqual(row['decision'],'REVIEW_CONTEXT')
        self.assertIn('CONFLICTING_GIVEN_NAME',row['uncertainties'])

    def test_fiction_not_promoted_and_date_unknown_preserved(self):
        row=self.extract('Στο μυθιστόρημα ο Νίκος Δέλτας αιχμαλώτισε πλοίο το 1578.')[0]
        self.assertEqual(row['decision'],'REVIEW_CONTEXT')
        row=self.extract('Ο Νίκος Δέλτας αιχμαλώτισε πλοίο.')[0]
        self.assertEqual(row['years_in_scope'],[])
        self.assertIn('EVENT_DATE_UNRESOLVED',row['uncertainties'])

    def test_pdf_scan_and_mediated_pages_remain_distinct(self):
        source={**SOURCE,'web_acquisition':{'pages':[{'start_char':0,'end_char':400,'scan_index_0_based':3}],'pdf_file':'doc.pdf'}}
        row=self.extract('Ο Νίκος Δέλτας αιχμαλώτισε πλοίο το 1578 (σελ.283).',source=source)[0]
        self.assertEqual(row['locator']['scan_indexes_0_based'],[3])
        self.assertIsNone(row['locator']['printed_page'])
        self.assertEqual(row['reported_cited_pages'],['283'])

    def test_anonymous_text_and_social_are_not_claim_sources(self):
        self.assertEqual(self.extract('Ο Νίκος Δέλτας πειρατής το 1578.',source={**SOURCE,'url':'https://instagram.com/p/x'}),[])
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'library_acquisition';root.mkdir()
            (root/'doc.txt').write_text('Ο Νίκος Δέλτας πειρατής το 1578.')
            self.assertEqual(build_findings(tmp,CTX)['findings'],[])

    def test_independent_place_and_latin_person_controls(self):
        rows=self.extract('In 1677 pirates attacked the island of Serifos.',ctx={'target':'Serifos','aliases':[],'date_range':'1660-1680'})
        self.assertEqual(rows[0]['years_in_scope'],[1677])
        rows=self.extract('In 1621 William Rook was appointed captain.',ctx={'target':'William Rook','aliases':[],'date_range':'1620-1630'})
        self.assertEqual(rows[0]['decision'],'RETAIN_CANDIDATE')

    def test_end_to_end_writes_candidates_and_attributed_answer_without_verification(self):
        tools=Path(__file__).resolve().parent
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp);root=base/'library_acquisition';root.mkdir()
            (root/'doc.txt').write_text('1578\n\nΟ Δέλτας αιχμαλώτισε ένα πλοίο.')
            (root/'acquisition_report.json').write_text(json.dumps({'results':[SOURCE]}))
            env={**os.environ,'PCT_TARGET':CTX['target'],'PCT_DATE_RANGE':CTX['date_range'],'PCT_PURPOSE':CTX['purpose'],'PCT_RESEARCH_LANE':'travellers'}
            for script in ('event_first_search.py','verification_pipeline.py'):
                subprocess.run([sys.executable,str(tools/script)],cwd=tmp,env=env,check=True,capture_output=True)
            events=json.loads((base/'structured_output/candidate_events.json').read_text())['events']
            self.assertEqual(len(events),1)
            self.assertEqual(events[0]['url'],SOURCE['url'])
            self.assertFalse(events[0]['verified']);self.assertFalse(events[0]['extracted'])
            matrix=json.loads((base/'claim_evidence_matrix/claims.json').read_text())
            support=matrix['claims'][0]['supporting_evidence'][0]
            self.assertEqual(support['evidence_kind'],'ACQUIRED_TEXT_EXCERPT')
            self.assertFalse(support['original_inspected'])
            self.assertIn('CONTROLLED_EXTRACTION_MISSING',matrix['claims'][0]['uncertainties'])
            answer=json.loads((base/'research_dossier/answer.json').read_text())
            self.assertEqual(answer['status'],'PROVISIONAL_SOURCE_FINDINGS')
            self.assertEqual(answer['verified_claims'],0)
            self.assertIn('example.org/history',(base/'research_dossier/answer.md').read_text())

if __name__=='__main__':unittest.main()
