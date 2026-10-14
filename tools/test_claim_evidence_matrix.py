import json,tempfile,unittest
from pathlib import Path
from claim_evidence_matrix import build_lane

class ClaimMatrixTests(unittest.TestCase):
    def test_no_auto_verify_and_tracks_unknowns(self):
        with tempfile.TemporaryDirectory() as t:
            b=Path(t)
            (b/"structured_output").mkdir()
            (b/"corroboration").mkdir()
            (b/"source_genealogy").mkdir()
            (b/"human_review").mkdir()
            (b/"structured_output"/"candidate_events.json").write_text(json.dumps({"events":[{
              "candidate_id":"x1","source_file":"a.txt","source_type":"OCR_CONTEXT","context_excerpt":"possible event",
              "original_inspected":False,"extracted":False,"corroborated":False,
              "research_value":{"score":78},"evidence_confidence":{"score":8},
              "retention":{"retention_status":"RETAINED_RESEARCH_DISCOVERY"}
            }]}))
            (b/"corroboration"/"corroboration_queue.json").write_text(json.dumps({"candidate_events":[]}))
            (b/"source_genealogy"/"genealogy_queue.json").write_text(json.dumps({"sources":[]}))
            (b/"human_review"/"review_queue.json").write_text(json.dumps({"items":[]}))
            out=build_lane(b,"venetian")
            c=out["claims"][0]
            self.assertFalse(c["verified"])
            self.assertEqual(c["machine_recommendation"],"UNRESOLVED")
            self.assertIn("ORIGINAL_NOT_INSPECTED",c["uncertainties"])
            self.assertEqual(c["contradiction_search_status"],"NOT_ASSESSED")
            self.assertEqual(c["research_value"]["score"],78)
            self.assertEqual(c["evidence_confidence"]["score"],8)
            self.assertEqual(c["retention"]["retention_status"],"RETAINED_RESEARCH_DISCOVERY")
            self.assertEqual([x["stage"] for x in c["claim_trail"]],[
              "DISCOVERY","EXACT_LOCATOR","ORIGINAL_INSPECTION","CONTROLLED_EXTRACTION",
              "SOURCE_GENEALOGY","CORROBORATION","CONTRADICTION_SEARCH","HUMAN_REVIEW","FINAL_VERIFICATION"
            ])

if __name__=="__main__":
    unittest.main()
