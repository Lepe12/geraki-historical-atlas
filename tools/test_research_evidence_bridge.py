import os
import unittest
from unittest.mock import patch
from tools.research_evidence_bridge import discovery_to_evidence_queue, query_live_learning


class EvidenceBridgeTests(unittest.TestCase):
    def test_discovery_never_promoted_to_historical_evidence(self):
        runs = [
            {"connector_id":"repo:archive","query":"Milo","status":"EXECUTED",
             "records":[{"url":"https://example.org/item1","title":"Milo catalogue"},
                        {"url":"https://example.org/item1","title":"Milo catalogue"}]},
            {"connector_id":"repo:other","status":"REMOTE_ACCESS_BLOCKED",
             "diagnostic":"access denied","records":[]}]
        result=discovery_to_evidence_queue(runs, run_id="123", agent_id="venetian")
        self.assertEqual(len(result["source_leads"]), 1)
        self.assertEqual(len(result["connector_errors"]), 1)
        self.assertEqual(result["verified_count"], 0)
        self.assertFalse(result["source_leads"][0]["historical_attestation"])
        self.assertFalse(result["source_leads"][0]["citation_verified"])
        self.assertEqual(result["historical_attestations"], [])

    def test_unconfigured_oidc_fails_closed(self):
        with patch.dict(os.environ,{},clear=True):
            result=query_live_learning(["Milo"])
        self.assertEqual(result["status"],"NOT_CONFIGURED")
        self.assertEqual(result["hits"],[])


if __name__=="__main__":
    unittest.main()
