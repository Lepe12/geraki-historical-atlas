import json
import tempfile
import unittest
from pathlib import Path
from tools.historical_map_agent_bridge import curated_map_leads


class MapAgentRegistryTests(unittest.TestCase):
    def test_greek_historical_map_question_lists_curated_sources_as_leads(self):
        r=curated_map_leads(["Χάρτης Αιγαίου 1662"])
        self.assertEqual(r["status"],"CURATED_LEADS_ONLY")
        self.assertFalse(r["archival_search_executed"])
        self.assertEqual(r["historically_verified"],0)
        self.assertGreaterEqual(len(r["leads"]),1)
        self.assertTrue(any(x["source_id"]=="commons:1662-ollive-aegean-dardanelles"
                            for x in r["leads"]))
        self.assertTrue(all(x["stage"]=="CURATED_CATALOGUE_LEAD_NOT_A_FRESH_SEARCH"
                            and x["historically_verified"] is False
                            and x["citation_to_specific_historical_event"] is None
                            for x in r["leads"]))

    def test_unrelated_research_does_not_inject_curated_maps(self):
        r=curated_map_leads(["Pedro Lanza in Simancas 1581"])
        self.assertEqual(r["leads"], [])
        self.assertEqual(r["status"],"NOT_RELEVANT_TO_OPERATOR_QUERY")

    def test_malformed_catalogue_file_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)/"data"/"historical-map-sources"
            folder.mkdir(parents=True)
            (folder/"malformed.json").write_text("{invalid")
            (folder/"fake.json").write_text(json.dumps({
                "schema":"nabou-historical-map-source-lead-v1",
                "source_id":"a", "catalogue_url":"javascript:alert(1)"}))
            self.assertEqual(curated_map_leads(["portolan"],root=tmp)["leads"],[])


if __name__=="__main__":
    unittest.main()
