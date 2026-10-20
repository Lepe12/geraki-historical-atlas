import tempfile
import unittest
from pathlib import Path
from PIL import Image
from tools.historical_map_georeference import sha256_file
from tools.historical_map_learning_bridge import build_candidates, write_staging


class MapLearningBridgeTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.image=Path(self.folder.name)/"synthetic.png"
        Image.new("RGB",(100,100),"white").save(self.image)
        digest=sha256_file(self.image)
        self.review={
            "schema":"nabou-manual-map-review-v1",
            "source":{"id":"test:imaginary-map","url":"https://example.org/synthetic",
                      "image_sha256":digest,"title":"SYNTHETIC MAP"},
            "image_sha256":digest,"map_georeferenced":False,"historically_verified":0,
            "labels":[{"label_id":"raw_1","ocr_text":"MIIO","final_reading":"Milo",
                       "decision":"READING_ACCEPTED","reviewer":"Test Historian",
                       "reviewed_at":"2026-10-20T10:00:00Z",
                       "pixel_bbox":[10,15,15,8],"geolocation":None,"historically_verified":False},
                      {"label_id":"raw_2","ocr_text":"L4","final_reading":None,
                       "decision":"UNREVIEWED","reviewer":None,
                       "pixel_bbox":[50,55,12,8],"geolocation":None,
                       "historically_verified":False}]
        }

    def test_limited_to_reviewed_transcription_not_historical_place(self):
        result=build_candidates(self.review,self.image)
        self.assertEqual(result["historically_verified"],0)
        self.assertFalse(result["eligible_for_automatic_claim_promotion"])
        self.assertEqual(result["medium"],"HISTORICAL_MAP_IMAGE_NOT_PDF")
        self.assertEqual(len(result["human_corrected_readings"]),1)
        entry=result["human_corrected_readings"][0]
        self.assertEqual(entry["locator"]["bbox"],[10,15,15,8])
        self.assertEqual(entry["historical_place_identity_status"],"UNRESOLVED")
        self.assertFalse(entry["historical_fact_verified"])

    def test_memory_uses_separate_staging_not_pdf_documents(self):
        mem={"schema":"naboux-research-memory-v1","documents":{"keep":"original"},
             "entities":{"another":"original"}}
        result=build_candidates(self.review,self.image)
        write_staging(mem,result)
        self.assertEqual(mem["documents"],{"keep":"original"})
        self.assertEqual(mem["entities"],{"another":"original"})
        self.assertEqual(len(mem["map_review_staging"]),1)

    def test_refuses_tampered_original_and_fabricated_geolocation(self):
        self.review["source"]["image_sha256"]="0"*64
        with self.assertRaisesRegex(ValueError,"SHA256"):
            build_candidates(self.review,self.image)
        self.review["source"]["image_sha256"]=sha256_file(self.image)
        self.review["labels"][0]["geolocation"]=[24.5,36.5]
        with self.assertRaisesRegex(ValueError,"verified geography"):
            build_candidates(self.review,self.image)


if __name__=="__main__":
    unittest.main()
