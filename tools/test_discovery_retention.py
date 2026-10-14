import json,tempfile,unittest
from pathlib import Path
from research_relevance import assess,identity
from research_discovery_inventory import update_inventory

class DiscoveryRetentionTests(unittest.TestCase):
    def setUp(self):
        self.req={"target":"Milos","aliases":["Μήλος","Melos","Milo"],"date_range":"1660-1680",
                  "purpose":"History of the island","target_context":{"type":"place","region_terms":["Aegean","Archipelago"]}}
        self.ident=identity(self.req,self.req)
    def test_dual_scores_are_separate(self):
        a=assess({"title":"Voyage to the island of Milo","year":"1675","identifier":"x"},self.ident)
        self.assertEqual(a["status"],"PRIORITY")
        self.assertFalse(a["research_value"]["is_probability"])
        self.assertFalse(a["evidence_confidence"]["is_probability"])
        self.assertGreater(a["research_value"]["score"],a["evidence_confidence"]["score"])
        self.assertTrue(a["retention"]["visible_in_research_discovery"])
    def test_excluded_is_still_retained(self):
        row={"title":"Melos Zeitschrift für Musik","identifier":"noise-1"}
        a=assess(row,self.ident)
        self.assertEqual(a["status"],"EXCLUDE_FROM_ACQUISITION")
        self.assertEqual(a["retention"]["acquisition_disposition"],"DO_NOT_AUTO_ACQUIRE")
        self.assertFalse(a["retention"]["discard_allowed"])
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/"research_discovery"/"all_findings.json"
            out=update_inventory([{**row,"relevance_assessment":a}],"travellers","unit_test",str(p))
            self.assertEqual(out["retained_count"],1)
            saved=json.loads(p.read_text(encoding="utf-8"))
            self.assertEqual(saved["findings"][0]["identifier"],"noise-1")
    def test_dedupe_preserves_provenance(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/"all.json";row={"repository":"Repo","identifier":"1","title":"Lead"}
            update_inventory([row],"greek","lane",str(p))
            out=update_inventory([{**row,"url":"https://example.invalid/1"}],"greek","specialist",str(p))
            self.assertEqual(out["retained_count"],1)
            self.assertEqual(out["findings"][0]["inventory_sources"],["lane","specialist"])

if __name__=="__main__":unittest.main()
