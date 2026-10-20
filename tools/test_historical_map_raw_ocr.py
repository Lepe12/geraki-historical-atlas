import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from tools.historical_map_raw_ocr import run_raw_ocr

TSV=("level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
     "5\t1\t1\t1\t1\t1\t42\t85\t77\t20\t82\tMILO\n"
     "5\t1\t1\t1\t1\t2\t42\t110\t77\t20\t-1\tNOT_A_WORD\n")

class RawHistoricalMapOcrTests(unittest.TestCase):
    def test_unlocated_ocr_cannot_be_taken_as_geographic_truth(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"synthetic.jpg"
            p.write_bytes(b"synthetic-image-bytes-only")
            def mock_run(args,**kwargs):
                self.assertEqual(args[0],"tesseract")
                self.assertEqual(args[-1],"tsv")
                return SimpleNamespace(returncode=0,stdout=TSV,stderr="")
            record=run_raw_ocr(p,source_id="test:synthetic",
                  source_url="https://example.org/fictional-test",
                  title="Synthetic Test Only",rights="test",
                  source_year=1662,language="eng",runner=mock_run)
            self.assertEqual(record["ocr"]["labels_found"],1)
            self.assertEqual(record["labels"][0]["text_raw"],"MILO")
            self.assertEqual(record["labels"][0]["pixel_bbox"],[42,85,77,20])
            self.assertIsNone(record["labels"][0]["geolocation"])
            self.assertEqual(record["historically_verified"],0)
            self.assertEqual(record["georeferencing_status"],"NOT_GEOREFERENCED")
            self.assertFalse(record["ocr"]["mapkurator_model_used"])
    def test_bad_source_url_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"image.jpg";p.write_bytes(b"synthetic")
            with self.assertRaisesRegex(ValueError,"HTTPS"):
                run_raw_ocr(p,source_id="a",source_url="http://example.org",
                            title="Synthetic",rights="test",source_year=1662)


if __name__=="__main__":
    unittest.main()
