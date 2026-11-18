"""Tests that the N7 historical dossier uses only actually-inspected source passages."""
import json
import tempfile
import unittest
from pathlib import Path

from n7_research_dossier import write_dossier


class HistoricalDossierTests(unittest.TestCase):
    def test_distinguishes_reading_from_historical_proof_and_exports_citations(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "results").mkdir()
            (d / "results" / "source_genealogy.json").write_text(json.dumps({
                "agent_id": "source_genealogy",
                "source_inspection": {"inspected_pages": [
                    {"url": "https://helios.eie.gr/helios/bitstream/10442/18865/1/Study.pdf",
                     "title": "Historical study",
                     "status": "CO_OCCURRENCE_NEEDS_REVIEW",
                     "pages_read": 32, "total_pages": 32,
                     "contains_person": True, "contains_target": True,
                     "page_excerpts": [
                         {"pdf_page": 21, "text": "The account of Creveliers in Ierapetra during 1675"}
                     ]}
                ]}
            }), encoding="utf8")
            result = write_dossier(d, {"run_id": "123", "discovered_record_count": 35,
                                      "inspected_source_pages_count": 32})
            self.assertEqual(result["readable_source_count"], 1)
            self.assertEqual(result["independent_source_candidates"], 1)
            self.assertFalse(result["claim_assessment"]["status"] == "VERIFIED")
            self.assertFalse(result["claim_assessment"]["cross_checked"])
            report = (d / "research_dossier.md").read_text(encoding="utf8")
            self.assertIn("Σελίδα PDF 21", report)
            self.assertIn("The account of Creveliers", report)
            self.assertIn("https://helios.eie.gr", report)

    def test_no_fake_quotes_when_pdf_read_but_no_event_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "results").mkdir()
            (d / "results" / "source_genealogy.json").write_text(json.dumps({
                "agent_id": "source_genealogy",
                "source_inspection": {"inspected_pages": [
                    {"url": "https://helios.eie.gr/file.pdf", "status": "PAGE_READ_NO_EVENT_MATCH",
                     "pages_read": 32, "total_pages": 32, "page_excerpts": []}
                ]}
            }))
            result = write_dossier(d, {"run_id": "123", "discovered_record_count": 81,
                                      "inspected_source_pages_count": 32})
            self.assertEqual(result["readable_source_count"], 1)
            self.assertEqual(result["same_page_person_place_leads"], [])
            self.assertEqual(result["claim_assessment"]["status"], "NOT_HISTORICALLY_VERIFIED")
            self.assertIn("Δεν εξήχθη χωρίο", (d / "research_dossier.md").read_text())

    def test_unreadable_hits_do_not_become_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "results").mkdir()
            (d / "results" / "contradiction.json").write_text(json.dumps({
                "agent_id": "contradiction",
                "source_inspection": {"inspected_pages": [
                    {"url": "https://ekt.gr/unavailable", "status": "PAGE_UNAVAILABLE"}
                ]}
            }))
            result = write_dossier(d, {"run_id": "123"})
            self.assertEqual(result["readable_source_count"], 0)
            self.assertEqual(len(result["unreadable_source_attempts"]), 1)
            self.assertFalse(result["claim_assessment"]["cross_checked"])


if __name__ == "__main__":
    unittest.main()
