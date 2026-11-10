import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from nabou_books import connect, ingest

ROOT = Path(__file__).resolve().parents[2]

class ControlledDispatchBookIntegration(unittest.TestCase):
    def test_opt_in_book_evidence_from_real_dispatch(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            item = {"source_id": "fixture001", "title": "Fixture book",
                    "printed_page": "27", "scan_page": 31,
                    "transcription": "Πέτρος Λάντζας αναφέρεται στη σελίδα."}
            pages = root / "pages.jsonl"
            pages.write_text(json.dumps(item, ensure_ascii=False) + "\n", encoding="utf-8")
            dbpath = root / "book.sqlite3"
            db = connect(dbpath)
            try:
                ingest(db,pages)
            finally:
                db.close()
            req = root / "request.json"
            req.write_text(json.dumps({"target":"Πέτρος Λάντζας",
                 "selected_agents":["greek"]}, ensure_ascii=False), encoding="utf-8")
            result_file = root / "candidates.json"
            command = [sys.executable, "tools/orchestrator/jarvis_dispatch.py",
                "--request", str(req), "--run-id", "999001",
                "--audit-root", str(root / "audits"),
                "--book-index", str(dbpath),
                "--book-output", str(result_file)]
            process = subprocess.run(command,cwd=ROOT,text=True,capture_output=True,timeout=30)
            self.assertEqual(process.returncode,0,process.stderr)
            result = json.loads(result_file.read_text(encoding="utf-8"))
            self.assertEqual(result["candidate_count"],1)
            self.assertEqual(result["candidates"][0]["printed_page"],"27")
            self.assertEqual(result["candidates"][0]["verification_status"],"UNVERIFIED")

if __name__ == "__main__":
    unittest.main()
