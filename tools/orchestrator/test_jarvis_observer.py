import json
import tempfile
import unittest
from pathlib import Path

from jarvis_observer import EXPECTED_LANES, observe


class JarvisObserverTests(unittest.TestCase):
    def test_observer_reads_real_artifact_shapes_without_side_effects(self):
        with tempfile.TemporaryDirectory() as tmp:
            run = Path(tmp) / "123"
            run.mkdir()
            (run / "SYSTEM_HEALTH.json").write_text(json.dumps({
                "run_id": "123",
                "lane_reports": [
                    {
                        "lane": lane,
                        "status": "OPERATIONAL",
                        "repository_candidates": 1,
                        "acquisition_results": 1,
                        "event_first_hits": 0,
                        "verified_events": 0,
                        "repository_blockers": [],
                        "repository_errors": [],
                    }
                    for lane in EXPECTED_LANES
                ],
            }), encoding="utf-8")
            (run / "MARIADB_STORAGE_INTENT.json").write_text(json.dumps({
                "backend": "host-local-mariadb",
                "database": "piratecartography",
                "status": "QUEUED_HOST_LOCAL_IMPORT",
                "durable_lane_indexes": EXPECTED_LANES,
                "missing_lane_indexes": [],
            }), encoding="utf-8")

            report = observe(run)
            self.assertEqual(report["metrics"]["operational_agents"], 10)
            self.assertEqual(report["metrics"]["candidate_sources"], 10)
            self.assertFalse(report["guardrails"]["dispatch_performed"])
            self.assertFalse(report["guardrails"]["database_write_performed"])
            self.assertFalse(report["guardrails"]["verified_promotion_performed"])


if __name__ == "__main__":
    unittest.main()
