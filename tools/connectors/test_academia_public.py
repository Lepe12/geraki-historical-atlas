import unittest
from unittest.mock import patch

import repository_connectors as rc


HTML = r"""
<html><body>
<a href="https://www.academia.edu/123456/Piracy_in_the_Aegean">Piracy in the Aegean</a>
<a href="https://eie.academia.edu/Scholar/Papers">Scholar Papers</a>
<a href="https://example.com/not-allowed">Noise</a>
</body></html>
"""


class AcademiaPublicDiscoveryTests(unittest.TestCase):
    @patch.object(rc, "_get", return_value=HTML.encode("utf-8"))
    def test_academia_public_is_discovery_only(self, mocked_get):
        status, rows, detail = rc.academia_public("Aegean piracy", "greek")
        self.assertEqual(status, "EXECUTED")
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(x["discovery_lane"] == "greek" for x in rows))
        self.assertTrue(all(x["evidence_level"] == "SECONDARY_DISCOVERY_ONLY" for x in rows))
        self.assertTrue(all(x["verification_status"] == "UNVERIFIED_DISCOVERY" for x in rows))
        self.assertTrue(all(x["acquisition_policy"] == "PUBLIC_ACCESS_ONLY_NO_LOGIN_OR_PAYWALL_BYPASS" for x in rows))
        self.assertTrue(all("academia.edu" in x["url"] for x in rows))
        self.assertIn("site%3Aacademia.edu", detail)
        mocked_get.assert_called_once()

    @patch.object(rc, "_get", side_effect=RuntimeError("blocked"))
    def test_remote_block_is_explicit(self, mocked_get):
        status, rows, detail = rc.academia_public("Aegean piracy", "greek")
        self.assertEqual(status, "REMOTE_ACCESS_BLOCKED")
        self.assertEqual(rows, [])
        self.assertIn("RuntimeError", detail)


if __name__ == "__main__":
    unittest.main()
