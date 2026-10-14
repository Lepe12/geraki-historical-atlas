import unittest
from unittest.mock import patch

import repository_connectors as rc


class ScholarlyDiscoveryTests(unittest.TestCase):
    @patch.object(rc, "_json")
    def test_openalex_is_secondary_discovery_only(self, mocked_json):
        mocked_json.return_value = {
            "results": [{
                "id": "https://openalex.org/W123",
                "title": "Piracy in the Aegean",
                "doi": "https://doi.org/10.1234/example",
                "publication_date": "2024-01-02",
                "authorships": [{"author": {"display_name": "A. Scholar"}}],
                "primary_location": {"landing_page_url": "https://doi.org/10.1234/example"},
                "type": "article",
                "cited_by_count": 7,
            }]
        }
        status, rows, detail = rc.openalex_works("Aegean piracy", "greek")
        self.assertEqual(status, "EXECUTED")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["discovery_repository"], "OpenAlex Scholarly Works")
        self.assertEqual(rows[0]["evidence_level"], "SECONDARY_DISCOVERY_ONLY")
        self.assertEqual(rows[0]["verification_status"], "UNVERIFIED_DISCOVERY")
        self.assertEqual(rows[0]["creator"], ["A. Scholar"])
        self.assertIn("api.openalex.org/works", detail)

    @patch.object(rc, "_json")
    def test_crossref_is_secondary_discovery_only(self, mocked_json):
        mocked_json.return_value = {
            "message": {
                "items": [{
                    "DOI": "10.5678/example",
                    "title": ["Corsairing and the Cyclades"],
                    "author": [{"given": "B.", "family": "Historian"}],
                    "issued": {"date-parts": [[2023, 5, 4]]},
                    "URL": "https://doi.org/10.5678/example",
                    "type": "journal-article",
                    "publisher": "Example Press",
                    "container-title": ["Mediterranean Studies"],
                }]
            }
        }
        status, rows, detail = rc.crossref_works("Cyclades corsair", "greek")
        self.assertEqual(status, "EXECUTED")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["discovery_repository"], "Crossref Scholarly Metadata")
        self.assertEqual(rows[0]["evidence_level"], "SECONDARY_DISCOVERY_ONLY")
        self.assertEqual(rows[0]["verification_status"], "UNVERIFIED_DISCOVERY")
        self.assertEqual(rows[0]["creator"], ["B. Historian"])
        self.assertEqual(rows[0]["date"], ["2023-5-4"])
        self.assertIn("api.crossref.org/works", detail)

    @patch.object(rc, "openalex_works", return_value=("EXECUTED", [], "oa"))
    @patch.object(rc, "crossref_works", return_value=("EXECUTED", [], "cr"))
    def test_dispatch_routes_scholarly_metadata(self, mocked_crossref, mocked_openalex):
        self.assertEqual(rc.dispatch("OpenAlex Scholarly Works", "Milos piracy", "greek")[0], "EXECUTED")
        self.assertEqual(rc.dispatch("Crossref Scholarly Metadata", "Milos piracy", "greek")[0], "EXECUTED")
        mocked_openalex.assert_called_once()
        mocked_crossref.assert_called_once()


if __name__ == "__main__":
    unittest.main()
