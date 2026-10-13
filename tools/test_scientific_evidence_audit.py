import json
from pathlib import Path
import tempfile
import unittest
from scientific_evidence_audit import audit


class AuditSafetyTests(unittest.TestCase):
    def test_metadata_and_claimed_verified_do_not_pass_gates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'evidence/runs'
            base=root/'123'/'british'
            path=base/'structured_output/candidate_events.json'
            path.parent.mkdir(parents=True)
            source={'events':[{'candidate_id':'same','source_type':'CATALOGUE_METADATA',
                'url':'https://example.org/catalogue/1','context_excerpt':'{}',
                'verified':True,'original_inspected':True,'extracted':True,'corroborated':True,
                'exact_page_candidates':[{'leaf':0,'printed_page':None,'image_file':'cover.jpg'}]},
                {'candidate_id':'same','source_type':'CATALOGUE_METADATA','url':'https://example.org/catalogue/1','context_excerpt':'{}','verified':False}]}
            path.write_text(json.dumps(source))
            before=path.read_bytes()
            human=base/'human_review/review_queue.json';human.parent.mkdir()
            human.write_text(json.dumps({'items':[{'candidate_id':'same','reviewer':'Historian',
                'reviewed_utc':'2026-10-13T00:00:00Z','decision':'HOLD','evidence_examined':['catalogue'] }]}))
            before_human=human.read_bytes()
            report=audit(root)
            self.assertEqual(report['summary']['candidate_records'],2)
            self.assertEqual(report['summary']['source_identity_groups'],1)
            self.assertEqual(report['summary']['complete_recorded_audit_trails'],0)
            self.assertEqual(report['verified_promotions'],0)
            self.assertEqual(report['records'][0]['pagination_hold'],'PAGINATION_UNRESOLVED')
            self.assertIn('integrity_warning',report['records'][0])
            self.assertEqual([r['candidate_index'] for r in report['records']],[0,1])
            self.assertEqual(path.read_bytes(),before)
            self.assertEqual(human.read_bytes(),before_human)

    def test_empty_and_malformed_files_are_not_hidden(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for lane, content in [('british','{"events":[]}'),('french','broken')]:
                p=root/'123'/lane/'structured_output/candidate_events.json'
                p.parent.mkdir(parents=True);p.write_text(content)
            report=audit(root)
            self.assertEqual(report['summary']['candidate_files'],1)
            self.assertEqual(report['summary']['candidate_records'],0)
            self.assertEqual(report['summary']['not_fully_assessed_files'],1)


if __name__=='__main__': unittest.main()
