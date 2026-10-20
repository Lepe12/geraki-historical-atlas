import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from PIL import Image

from tools.historical_map_multiangle_ocr import (
    rotated_to_original, intersection_over_union, run_multiorientation)

HEADER="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
ROW="5\t1\t1\t1\t1\t1\t10\t20\t35\t15\t91\tMILO\n"

class MultiangleMapOcrTests(unittest.TestCase):
    def test_90_degree_boxes_map_to_original_source_pixels(self):
        self.assertEqual(rotated_to_original([20,100,10,30],90,width=500,height=300),
                         [370,20,30,10])
        self.assertEqual(rotated_to_original([20,100,10,30],270,width=500,height=300),
                         [100,270,30,10])
        self.assertEqual(rotated_to_original([20,100,10,30],180,width=500,height=300),
                         [470,170,10,30])

    def test_overlap_counts_as_one_region_not_independent_attestation(self):
        self.assertAlmostEqual(intersection_over_union([10,10,20,20],[10,10,20,20]),1)
        self.assertEqual(intersection_over_union([10,10,20,20],[300,300,20,20]),0)

    def test_model_source_and_original_pixel_coordinates_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"original.png"
            Image.new("RGB",(300,220),"white").save(path)
            called=[]
            def runner(command,**kwargs):
                called.append(command[1])
                return SimpleNamespace(returncode=0,stdout=HEADER+ROW,stderr="")
            result=run_multiorientation(
                path,source_id="synthetic",source_url="https://example.org/synthetic",
                title="TEST ONLY",rights="synthetic",source_year=1662,
                language="eng",angles=(0,90,270),runner=runner)
            self.assertEqual(len(called),3)
            self.assertEqual(result["ocr"]["angles_tested_degrees"],(0,90,270))
            self.assertGreaterEqual(result["ocr"]["labels_found"],1)
            self.assertFalse(result["ocr"]["mapkurator_model_used"])
            self.assertEqual(result["historically_verified"],0)
            self.assertTrue(all(item["geolocation"] is None and
                                item["historically_verified"] is False
                                for item in result["labels"]))

    def test_unapproved_geolocation_cannot_emerge_from_ocr(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"original.png"
            Image.new("RGB",(300,220),"white").save(path)
            result=run_multiorientation(path,source_id="synthetic",
                source_url="https://example.org/synthetic",rights="test",title="test",
                source_year=1662,angles=(0,),language="eng",
                runner=lambda *_args,**_kwargs:SimpleNamespace(returncode=0,stdout=HEADER+ROW,stderr=""))
            self.assertEqual(result["labels"][0]["reading_status"],"UNREVIEWED")
            self.assertEqual(result["labels"][0]["proposed_place_id"],None)


if __name__=="__main__":
    unittest.main()
