"""Traceability controls use synthetic text; not a historical gold standard."""
import hashlib,json,tempfile,unittest
from pathlib import Path
from research_evidence_package import build,source_key,source_classification
from evaluate_research_methods import metrics,evaluate

class EvidencePackage(unittest.TestCase):
    def test_quote_replay_metadata_and_independence(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)/'123';lane=root/'travellers'
            def write(name,data):
                p=lane/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data))
            text='In 1621 William Rook was appointed captain. The consulted edition reports this appointment in a letter to the governor.'
            (lane/'library_acquisition').mkdir(parents=True)
            (lane/'library_acquisition/doc.txt').write_text(text)
            source={'url':'https://example.org/article?id=1','title':'Letters of William Rook','creator':['A. Editor'],
                    'date':'2001','status':'TEXT_ACQUIRED','web_acquisition':{'source_type':'PDF_TEXT'}}
            write('library_acquisition/acquisition_report.json',{'results':[source]})
            finding={'finding_id':'f1','file':'doc.txt','url':source['url'],'title':source['title'],
                     'evidence_excerpt':text,'source_text_sha256':hashlib.sha256(text.encode()).hexdigest(),
                     'locator':{'start_char':0,'end_char':len(text),'scan_indexes_0_based':[0],'pdf_file':'doc.pdf'},
                     'uncertainties':['ORIGINAL_NOT_INSPECTED']}
            write('structured_output/extracted_findings.json',{'findings':[finding,{**finding,'finding_id':'f2'}]})
            package=build(root)
            self.assertEqual(package['quality']['exact_replayed_quotes'],2)
            self.assertEqual(len(package['sources']),1)
            self.assertEqual(package['sources'][0]['bibliography']['creators'],['A. Editor'])
            self.assertEqual(package['sources'][0]['classification']['category'],'UNCLASSIFIED')
            passage=package['passages'][0]
            self.assertEqual(passage['pdf_pages_1_based'],[1])
            self.assertIsNone(passage['original_quote']);self.assertIsNone(passage['source_statement'])
            self.assertIn('PRINTED_PAGE_OR_FOLIO_UNRESOLVED',passage['citation_missing_fields'])
            self.assertEqual(package['source_relationships'][0]['independence_effect'],'DO_NOT_COUNT_AS_INDEPENDENT_CORROBORATION')
            (lane/'library_acquisition/doc.txt').write_text(text+' altered')
            self.assertEqual(build(root)['quality']['exact_replayed_quotes'],0)

    def test_query_record_identity_and_classification_not_guessed_from_format(self):
        self.assertNotEqual(source_key({'url':'https://archive.org/record?id=1'}),source_key({'url':'https://archive.org/record?id=2'}))
        self.assertEqual(source_classification({'source_type':'PDF_TEXT'})['category'],'UNCLASSIFIED')
        self.assertEqual(source_classification({'url':'https://en.wikipedia.org/wiki/A'})['category'],'UNVERIFIED_WEB_REFERENCE')

    def test_acquisition_can_enrich_sparse_catalogue_without_confirming_classification(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);lane=root/'travellers'
            (lane/'lane_discovery').mkdir(parents=True);(lane/'library_acquisition').mkdir()
            (lane/'lane_discovery/travellers.json').write_text(json.dumps({'results':[{'url':'https://example.org/source','title':'Letters'}]}))
            (lane/'library_acquisition/acquisition_report.json').write_text(json.dumps({'results':[{'url':'https://example.org/source','title':'Letters','source_type':'PRIMARY_FACSIMILE','year':1621,'creator':['Reported Author']}]}))
            source=build(root)['sources'][0]
            self.assertEqual(source['classification']['category'],'PRIMARY_SOURCE_REPORTED')
            self.assertFalse(source['classification']['confirmed'])
            self.assertEqual(source['bibliography']['publication_date'],1621)
            self.assertEqual(source['bibliography']['creators'],['Reported Author'])

    def test_evaluation_does_not_claim_independence_or_undefined_perfection(self):
        self.assertIsNone(metrics([True],[False])['precision'])
        self.assertEqual(metrics([True],[False])['recall'],0)
        report=evaluate({'id':'synthetic','cases':[{'id':'a','request':{'target':'William Rook'},'record':{'title':'William Rook'},'expected_auto_acquire':True}]})
        self.assertFalse(report['independent_validation_ready'])
        self.assertEqual(report['evaluation_type'],'DEVELOPMENT_REGRESSION_ONLY')

if __name__=='__main__':unittest.main()
