"""Catalog hits must materialize readable page text for semantic-read."""
import tempfile
import unittest
from pathlib import Path

from research_focus import decompose
from research_relevance import assess, identity
from web_acquisition import acquire


class CatalogPageAcquisitionTests(unittest.TestCase):
    def test_priority_catalog_name_hit_is_auto_acquire_eligible(self):
        req = {
            "target": "πετρο λάνζτα τον κερκυραιο κορσάρο",
            "aliases": [],
            "purpose": "ψάξε για πετρο λάνζτα τον κερκυραίο κορσάρο",
        }
        focus = decompose(req["target"], purpose=req["purpose"])
        self.assertEqual(focus["kind"], "person")
        hit = {
            "title": "Πέτρος Λάντζας",
            "url": "https://example.org/petros-lantzas",
            "discovery_repository": "Public Web Source Discovery",
            "acquisition_policy": "PUBLIC_ACCESS_ONLY_NO_LOGIN_OR_PAYWALL_BYPASS",
        }
        result = assess(hit, identity(req, req))
        self.assertEqual(result["status"], "PRIORITY")
        self.assertEqual(
            result["retention"]["acquisition_disposition"], "AUTO_ACQUIRE_ELIGIBLE"
        )

    def test_fake_catalog_hit_materializes_readable_text(self):
        html = (
            "<html><body><h1>Petros Lantzas</h1>"
            + ("<p>Petros Lantzas was a Corfiot corsair active in the late sixteenth century. </p>" * 8)
            + "</body></html>"
        )

        def fetcher(url):
            return html.encode("utf-8"), "text/html; charset=utf-8", url

        with tempfile.TemporaryDirectory() as td:
            out = Path(td)
            acquired = acquire("https://example.org/catalogue/lantzas", out, fetcher=fetcher, follow=False)
            self.assertEqual(acquired["status"], "TEXT_ACQUIRED")
            text_files = [Path(p) for p in acquired["files"] if str(p).endswith(".txt")]
            self.assertTrue(text_files)
            body = text_files[0].read_text(encoding="utf-8")
            self.assertIn("Petros Lantzas", body)
            self.assertGreater(len(body.strip()), 100)


if __name__ == "__main__":
    unittest.main()
