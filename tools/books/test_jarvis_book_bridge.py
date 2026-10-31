import json
import tempfile
import unittest
from pathlib import Path
from nabou_books import connect, ingest
from jarvis_book_bridge import retrieve

class JarvisBridgeTests(unittest.TestCase):
    def test_request_candidates_remain_unverified(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            file = root / "pages.jsonl"
            file.write_text(json.dumps({
                "source_id":"example", "title":"Research extract", "printed_page":"19",
                "transcription":"Πέτρος Λάντζας στην Κέρκυρα", "source_reference":"scan 23",
                "scan_page":23
            }, ensure_ascii=False)+"\n", encoding="utf-8")
            db = connect(root/"index.db")
            try:
                ingest(db,file)
                out = retrieve(db,{"research_job_id":"pilot-1","target":"Λάντζας","aliases":["Κέρκυρα"]})
                self.assertEqual(out["status"],"EXECUTED_LOCAL")
                self.assertEqual(out["candidate_count"],1)
                hit=out["candidates"][0]
                self.assertEqual(hit["printed_page"],"19")
                self.assertEqual(hit["scan_page"],23)
                self.assertEqual(hit["verification_status"],"UNVERIFIED")
                self.assertEqual(hit["matched_terms"],["Λάντζας","Κέρκυρα"])
            finally:
                db.close()

    def test_empty_query_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=connect(Path(tmp)/"index.db")
            try:
                with self.assertRaises(ValueError):
                    retrieve(db,{"target":"  "})
            finally:
                db.close()

if __name__=="__main__":
    unittest.main()
