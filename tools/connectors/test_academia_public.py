import unittest
from unittest.mock import patch
from urllib.parse import urlsplit
import repository_connectors as rc


class PublicDiscoveryConnectorTests(unittest.TestCase):
    @patch("http_audit.anemi_search", return_value=b"<html></html>")
    @patch.object(rc, "_get", return_value=b"<html></html>")
    def test_public_native_catalogues_are_queried_without_external_search_api(self, remote, anemi):
        # These native catalogue routes no longer require a third-party search
        # API key; do not expect API_KEY_REQUIRED from a working local HTML fetch.
        routes=("Academia.edu Public Research", "OpenArchives.gr / EKT",
                "National Library of Greece Digital Collections",
                "Anemi / University of Crete")
        for route in routes:
            with self.subTest(repository=route):
                status,rows,detail=rc.dispatch(route,"Pedro Lanza","greek")
                self.assertEqual(status,"EXECUTED")
                self.assertEqual(rows,[])  # empty response is not an acquired source
                self.assertNotIn("VERIFIED",str(detail))
        hosts={urlsplit(call.args[0]).hostname for call in remote.call_args_list}
        self.assertEqual(hosts,{"www.academia.edu","www.openarchives.gr",
                                "digitalcollections.nlg.gr"})
        anemi.assert_called_once()

    @patch.object(rc, "_get", return_value=b"<html></html>")
    def test_tna_uses_only_its_native_site_not_an_external_search_engine(self, remote):
        rc.tna_public_content("Pedro Lanza","british")
        self.assertTrue(remote.called)
        for call in remote.call_args_list:
            self.assertEqual(urlsplit(call.args[0]).hostname,"www.nationalarchives.gov.uk")


if __name__=="__main__":
    unittest.main()
