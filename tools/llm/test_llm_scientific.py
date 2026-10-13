import json,tempfile,unittest
from pathlib import Path
from evidence_hash import evidence_hash
from synthesis_cache import cache_key,save,load
from llm_router import route
from llm_tasks import run_query_expander,run_replanner,run_extractor
from scientific_llm_audit import audit

class LLMScientificTests(unittest.TestCase):
    def test_evidence_hash_changes_when_evidence_changes(self):
        a={"records":[{"id":"1","source_says":"A"}]}
        b={"records":[{"id":"1","source_says":"B"}]}
        self.assertNotEqual(evidence_hash(a),evidence_hash(b))

    def test_volatile_timestamp_does_not_change_evidence_hash(self):
        a={"records":[{"id":"1","source_says":"A","retrieved_utc":"x"}]}
        b={"records":[{"id":"1","source_says":"A","retrieved_utc":"y"}]}
        self.assertEqual(evidence_hash(a),evidence_hash(b))

    def test_router_falls_back_without_model(self):
        r=route("synthesis")
        self.assertIn(r.provider,{"disabled","openai_compatible"})
        if r.provider=="disabled": self.assertIsNone(r.model)

    def test_query_expander_never_verifies(self):
        out=run_query_expander("Test Pirate",["Alias"],"1650-1700",["en"])
        self.assertFalse(out["verified_promotion_allowed"])
        self.assertTrue(out["query_variants"])

    def test_replanner_cannot_escape_registered_routes(self):
        out=run_replanner("goal",[{"route":"a"}],["a","b"])
        self.assertFalse(out["verified_promotion_allowed"])
        for r in out.get("route_changes",[]): self.assertIn(r,["a","b"])

    def test_extractor_source_first_preserves_locator_absence(self):
        out=run_extractor("claim",{"records":[{"id":"x","source_says":"text"}]})
        self.assertIsNone(out["extracted_items"][0]["exact_locator"])
        self.assertFalse(out["verified_promotion_allowed"])

    def test_scientific_audit(self):
        self.assertEqual(audit()["overall"],"PASS")

if __name__=="__main__": unittest.main()
