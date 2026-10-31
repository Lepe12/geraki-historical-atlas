import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from nabou_books import connect, ingest, search

SAMPLE = {
    "source_id": "book-test-001",
    "title": "Δοκιμαστική πηγή",
    "author": "Test Author",
    "printed_page": "42",
    "scan_page": 7,
    "language": "el",
    "transcription": "Ο Πέτρος Λάντζας εμφανίζεται στην Κέρκυρα.",
    "source_reference": "Local test scan page 7",
    "transcription_status": "REVIEWED"
}


class BookIndexTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.db = connect(self.root / "books.db")
        self.jsonl = self.root / "pages.jsonl"

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def write(self, items):
        self.jsonl.write_text("\n".join(json.dumps(i, ensure_ascii=False) for i in items) + "\n", encoding="utf-8")

    def test_ingest_search_and_idempotence(self):
        self.write([SAMPLE])
        self.assertEqual(ingest(self.db, self.jsonl)["inserted"], 1)
        self.assertEqual(ingest(self.db, self.jsonl)["duplicates"], 1)
        found = search(self.db, "Λάντζας", 10)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["printed_page"], "42")
        self.assertEqual(found[0]["evidence_status"], "DISCOVERED")

    def test_conflict_rejected(self):
        self.write([SAMPLE])
        ingest(self.db, self.jsonl)
        changed = {**SAMPLE, "transcription": "different"}
        self.write([changed])
        with self.assertRaises(ValueError):
            ingest(self.db, self.jsonl)
        self.assertEqual(len(search(self.db, "Λάντζας", 10)), 1)

    def test_batch_rollback(self):
        invalid = {**SAMPLE, "source_id": "bad-source", "printed_page": ""}
        self.write([SAMPLE, invalid])
        with self.assertRaises(ValueError):
            ingest(self.db, self.jsonl)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM pages").fetchone()[0], 0)

    def test_unsupported_verification_rejected(self):
        self.write([{**SAMPLE, "evidence_status": "VERIFIED"}])
        with self.assertRaises(ValueError):
            ingest(self.db, self.jsonl)


if __name__ == "__main__":
    unittest.main()
