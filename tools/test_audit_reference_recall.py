import json,tempfile,unittest
from pathlib import Path
from audit_reference_recall import audit
REF=[{'id':'work','title':'Known history','signatures':[['known history','islands']]}]
class ReferenceAudit(unittest.TestCase):
    def fixture(self,d):
        root=Path(d)/'123';base=root/'greek';(base/'research_discovery').mkdir(parents=True);(base/'library_acquisition').mkdir();return root,base
    def test_search_queries_are_not_source_discoveries(self):
        with tempfile.TemporaryDirectory() as d:
            root,base=self.fixture(d)
            (base/'research_discovery/all_findings.json').write_text(json.dumps({'findings':[{'title':'Other work','search_query':'Known history of islands'}]}))
            self.assertEqual(audit(root,REF)['mentioned_count'],0)
    def test_citation_in_another_book_is_not_acquisition_of_cited_work(self):
        with tempfile.TemporaryDirectory() as d:
            root,base=self.fixture(d)
            (base/'library_acquisition/other.txt').write_text('References: Known history of islands.')
            (base/'library_acquisition/acquisition_report.json').write_text(json.dumps({'results':[{'title':'Other book','files':['library_acquisition/other.txt']}]}))
            out=audit(root,REF);self.assertEqual(out['mentioned_count'],1);self.assertEqual(out['acquired_work_count'],0)
    def test_matching_title_requires_actual_nonempty_file(self):
        with tempfile.TemporaryDirectory() as d:
            root,base=self.fixture(d);p=base/'library_acquisition/acquisition_report.json'
            p.write_text(json.dumps({'results':[{'title':'Known history of islands','files':['library_acquisition/missing.txt']}]}))
            self.assertEqual(audit(root,REF)['acquired_work_count'],0)
            (base/'library_acquisition/missing.txt').write_text('A page of the acquired work.')
            self.assertEqual(audit(root,REF)['acquired_work_count'],1)
