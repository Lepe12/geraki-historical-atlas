import json,tempfile,unittest
from pathlib import Path
from connector_contract import validate_result
from connector_registry import eligible,next_route

class ConnectorFrameworkTests(unittest.TestCase):
    def test_contract_rejects_verified(self):
        data={
          "connector_id":"x","repository":"r","operation":"search","status":"EXECUTED",
          "records":[],"provenance":{},"blockers":[],"warnings":[],
          "evidence_level":"VERIFIED","retrieved_utc":"now"
        }
        self.assertIn("CONNECTOR_MAY_NOT_OUTPUT_VERIFIED",validate_result(data))

    def test_registry_routes_native_to_browser(self):
        self.assertEqual(next_route("pares_simancas_native","ARCHIVE_NOT_CONFIRMED"),"pares_simancas_browser")

    def test_search_capability_discovery(self):
        found=eligible("search")
        ids={x["connector_id"] for x in found}
        self.assertIn("pares_simancas_native",ids)
        self.assertIn("moreveneto_browser",ids)

if __name__=="__main__": unittest.main()
