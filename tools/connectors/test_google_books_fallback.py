import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from connectors import repository_connectors as rc

class GoogleBooksFallbackTests(unittest.TestCase):
    @patch.object(rc,"bnf_sru")
    @patch.object(rc,"_json")
    def test_429_stays_blocked_and_fallback_retains_its_origin(self, get, bnf):
        get.side_effect=HTTPError("https://www.googleapis.com/books/v1/volumes",429,"quota",{},None)
        bnf.return_value=("EXECUTED",[{"discovery_repository":"Gallica/BnF","title":"Voyage"}],"catalogue")
        status,rows,detail=rc.google_books("Rhodes","travellers")
        self.assertEqual(status,"REMOTE_RATE_LIMITED")
        self.assertEqual(rows[0]["discovery_repository"],"Gallica/BnF")
        self.assertEqual(rows[0]["fallback_for"],"Google Books")
        bnf.assert_called_once_with("Rhodes","travellers")
        self.assertIn("429",detail)

    @patch.object(rc,"bnf_sru",side_effect=TimeoutError)
    @patch.object(rc,"_json",side_effect=HTTPError("https://www.googleapis.com",503,"unavailable",{},None))
    def test_both_failures_are_reported_without_inventing_hits(self, get, bnf):
        status,rows,detail=rc.google_books("Rhodes","travellers")
        self.assertEqual(status,"REMOTE_UNAVAILABLE")
        self.assertEqual(rows,[])
        self.assertIn("fallback failed",detail)

if __name__=="__main__":unittest.main()
