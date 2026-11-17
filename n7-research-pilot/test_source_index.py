import tempfile
import unittest
from pathlib import Path
from source_index import ingest, search

class SourceIndexTests(unittest.TestCase):
    def test_ingest_search_duplicate_and_page(self):
        with tempfile.TemporaryDirectory() as directory:
            db = str(Path(directory) / "sources.db")
            source = Path(directory) / "sample.txt"
            source.write_text("Κέρκυρα και πειρατεία\fΗ Τήνος αναφέρεται εδώ.", encoding="utf8")
            result = ingest(db, source)
            self.assertEqual(result["pages"], 2)
            self.assertEqual(ingest(db, source)["status"], "duplicate")
            matches = search(db, "Τήνος")
            self.assertEqual(len(matches), 1)
            self.assertEqual(matches[0]["page"], 2)
            self.assertEqual(matches[0]["verification"], "UNVERIFIED_TEXT")
            self.assertEqual(search(db, "Μήλος"), [])

if __name__ == "__main__":
    unittest.main()
