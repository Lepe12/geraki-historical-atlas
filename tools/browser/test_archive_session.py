import unittest
from tools.browser.archive_session import _host_allowed,_safe_name

class ArchiveSessionTests(unittest.TestCase):
    def test_allowlist(self):
        self.assertTrue(_host_allowed("https://pares.cultura.gob.es/ParesBusquedas20/"))
        self.assertTrue(_host_allowed("https://asve.arianna4.cloud/"))
        self.assertFalse(_host_allowed("https://example.com/"))
    def test_safe_name(self):
        self.assertEqual(_safe_name("venice / test"),"venice_test")

if __name__=="__main__": unittest.main()
