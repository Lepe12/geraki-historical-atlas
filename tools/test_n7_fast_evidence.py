import unittest
from n7_fast_evidence import search, tokens

class FastEvidenceTests(unittest.TestCase):
    def test_greek_accent_insensitive(self):
        self.assertIn("ναξοσ",tokens("Νάξος"))
        self.assertEqual(tokens("Νάξος"),tokens("ΝΑΞΟΣ"))
    def test_exact_source_excerpt_and_locator(self):
        rows=[{"evidence_id":"e1","text":"Η Νάξος αναφέρεται ως λιμάνι.","occurrences":[{"title":"Test source","url":"https://example.org/source","locator":{"page":12}}]}]
        hits=search(rows,{"target":"Νάξος"})
        self.assertEqual(len(hits),1)
        self.assertEqual(hits[0]["excerpt"],rows[0]["text"])
        self.assertEqual(hits[0]["source"]["locator"]["page"],12)
        self.assertFalse(hits[0]["historically_verified"])
    def test_unrelated_not_reported(self):
        rows=[{"evidence_id":"e2","text":"Unrelated text","occurrences":[]}]
        self.assertEqual(search(rows,{"target":"Νάξος"}),[])
if __name__=="__main__":
    unittest.main()
