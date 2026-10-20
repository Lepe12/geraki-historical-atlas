"""Actual Poppler replay checks; fixtures are not historical assertions."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from prepare_acquired_analysis import prepare,corrected_bibliography
from semantic_research_answer import collect
from test_source_acquisition_routes import two_column_pdf

class AcquiredAnalysis(unittest.TestCase):
    def test_bibliographic_correction_requires_identical_pdf_and_preserves_original(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'data').mkdir();(root/'evidence').mkdir()
            original={'title':'Wrong catalogue title','creator':['Original metadata'],'date':['2012']}
            work={'title':'Actual inspected title','author':'Actual author','year':2014}
            record={'pdf_sha256':'a'*64,'actual_work':work}
            (root/'evidence/correction.json').write_text(json.dumps(record))
            (root/'data/source_bibliographic_corrections.json').write_text(json.dumps({'records':['evidence/correction.json']}))
            self.assertEqual(corrected_bibliography(original,'b'*64,root),(original,None))
            corrected,receipt=corrected_bibliography(original,'a'*64,root)
            self.assertEqual(corrected['title'],work['title']);self.assertEqual(corrected['date'],['2014'])
            self.assertEqual(original['title'],'Wrong catalogue title')
            self.assertFalse(receipt['original_acquisition_report_modified'])
            self.assertEqual(receipt['record_sha256'],hashlib.sha256((root/'evidence/correction.json').read_bytes()).hexdigest())

    def test_reanalysis_separates_columns_and_preserves_original_source_and_locators(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);lane=root/'greek';library=lane/'library_acquisition';library.mkdir(parents=True)
            pdf=library/'doc.pdf';raw,left,right=two_column_pdf();pdf.write_bytes(raw)
            old=library/'doc.txt';subprocess.run(['pdftotext','-layout',str(pdf),str(old)],check=True)
            original=old.read_bytes()
            source={'status':'TEXT_ACQUIRED','title':'Synthetic source','url':'https://example.org/source.pdf',
                    'files':['library_acquisition/doc.pdf','library_acquisition/doc.txt']}
            (library/'acquisition_report.json').write_text(json.dumps({'results':[source]}))
            dest=root/'semantic_reanalysis_test/derived_sources'
            request={'target':'Pirate bases and anchorages in the Mediterranean','aliases':[],'date_range':'1600-1700','purpose':'Test'}
            receipt=prepare(root,dest,request)
            self.assertFalse(receipt['network_requests_performed'])
            self.assertEqual(pdf.read_bytes(),raw);self.assertEqual(old.read_bytes(),original)
            rows,_=collect(dest,provenance_root=root)
            self.assertTrue(rows)
            for r in rows:
                self.assertNotIn('1781',r['text'])
                for occurrence in r['occurrences']:
                    path=root/occurrence['acquired_text_path'];self.assertTrue(path.is_file())
                    self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),occurrence['source_text_sha256'])
                    binary=occurrence['source_pdf']
                    self.assertEqual(binary['sha256'],hashlib.sha256(raw).hexdigest())
                    self.assertEqual(root/binary['path'],pdf)
                    self.assertEqual(occurrence['locator']['pdf_reference_base'],'PARENT_RESEARCH_RUN')
            self.assertFalse(list(dest.rglob('*.pdf')))
            with self.assertRaises(FileExistsError):prepare(root,dest,request)
            pdf.write_bytes(raw+b'\n% changed after acquisition\n')
            rows,excluded=collect(dest,provenance_root=root)
            self.assertEqual(rows,[])
            self.assertTrue(any(e['reason']=='SOURCE_PDF_CHECKSUM_MISMATCH' for e in excluded))

if __name__=='__main__':unittest.main()
