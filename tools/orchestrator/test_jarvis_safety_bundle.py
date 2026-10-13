import tempfile,unittest
from pathlib import Path
from project_scope import scoped_path
from secret_refs import validate_ref

class SafetyBundleTests(unittest.TestCase):
    def test_project_scope(self):
        with tempfile.TemporaryDirectory() as t:
            p=scoped_path(Path(t),"piratecartography","run1","agent1")
            self.assertTrue(str(p).endswith("piratecartography/run1/agent1"))
    def test_secret_ref_does_not_accept_secret_value(self):
        with self.assertRaises(ValueError):
            validate_ref("sk-this-is-not-a-reference")
    def test_unknown_project_blocked(self):
        with tempfile.TemporaryDirectory() as t:
            with self.assertRaises(ValueError):
                scoped_path(Path(t),"unknown_project","x")

if __name__=="__main__": unittest.main()
