import unittest
from unittest.mock import patch
import repository_connectors as rc


class PublicWebProviderRemovalTests(unittest.TestCase):
    @patch.object(rc, '_get')
    def test_dependent_routes_report_unavailable_without_network(self, remote):
        for name in ('Academia.edu Public Research', 'OpenArchives.gr / EKT',
                     'National Library of Greece Digital Collections',
                     'Anemi / University of Crete', 'Public Web Source Discovery'):
            with self.subTest(repository=name):
                status,rows,detail=rc.dispatch(name,'Pedro Lanza','greek')
                self.assertEqual(status,'API_KEY_REQUIRED')
                self.assertEqual(rows,[])
                self.assertIn('WEB_SEARCH_PROVIDER_NOT_CONFIGURED',detail)
        remote.assert_not_called()

    @patch.object(rc, '_get', return_value=b'<html></html>')
    def test_tna_uses_only_its_native_site_not_an_external_search_engine(self, remote):
        rc.tna_public_content('Pedro Lanza','british')
        self.assertTrue(remote.called)
        from urllib.parse import urlsplit
        for call in remote.call_args_list:
            self.assertEqual(urlsplit(call.args[0]).hostname,'www.nationalarchives.gov.uk')


if __name__=='__main__':unittest.main()
