import json,tempfile,time,unittest
from pathlib import Path
from jarvis_event_bus import emit
from jarvis_task_history import record
from project_scope import scoped_path
from secret_refs import validate_ref
from connector_rate_limit import ConnectorLease
from connector_contract import validate_result

class ResilienceTests(unittest.TestCase):
    def test_event_bus_and_history_are_append_only(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            emit(root,"piratecartography","run1","progress",agent_id="a1",percent=10)
            emit(root,"piratecartography","run1","progress",agent_id="a1",percent=20)
            self.assertEqual(len((root/"piratecartography"/"run1"/"events.jsonl").read_text().splitlines()),2)
            history=root/"history.jsonl"
            record(history,"t1","piratecartography","research","RUNNING")
            record(history,"t1","piratecartography","research","COMPLETED")
            self.assertEqual(len(history.read_text().splitlines()),2)

    def test_project_scope_blocks_escape(self):
        with tempfile.TemporaryDirectory() as t:
            p=scoped_path(Path(t),"piratecartography","run1")
            self.assertIn("piratecartography",str(p))
            with self.assertRaises(ValueError):
                scoped_path(Path(t),"piratecartography","../escape")

    def test_secret_refs_are_names_only(self):
        self.assertEqual(validate_ref("PCT_TEST_SECRET"),"PCT_TEST_SECRET")
        with self.assertRaises(ValueError): validate_ref("raw-secret-value!")

    def test_connector_cannot_verify(self):
        data={"connector_id":"x","repository":"r","operation":"search","status":"EXECUTED","records":[],"provenance":{},"blockers":[],"warnings":[],"evidence_level":"VERIFIED","retrieved_utc":"now"}
        self.assertIn("CONNECTOR_MAY_NOT_OUTPUT_VERIFIED",validate_result(data))

if __name__=="__main__": unittest.main()
