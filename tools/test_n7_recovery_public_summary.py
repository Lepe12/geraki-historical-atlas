"""Public-safe N7 recovery metadata must never disclose raw OCR or fake verification."""
import json
import tempfile
import unittest
from pathlib import Path

from n7_recovery_public_summary import LANES, build


class SafeN7RecoverySummaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.run = "42434462262"
        p = self.root / "evidence" / "runs" / self.run
        p.mkdir(parents=True)
        (p/"LANE_HANDOFF.json").write_text(json.dumps({
            "schema": "research-lane-handoff-v1", "run_id": self.run,
            "received_lanes": sorted(LANES), "missing_lanes": [],
            "manifests": [{"lane": x, "archive_sha256": "a"*64} for x in LANES],
        }))
        (p/"SOURCE_GENEALOGY.json").write_text(json.dumps({
            "run_id": self.run, "source_count": 1502,
            "exact_duplicate_groups": 282, "possible_derivative_groups": 67,
            "sources": [{"title": "PRIVATE DO NOT REPRODUCE", "url": "https://private.invalid"}],
        }))
        (p/"SYSTEM_HEALTH.json").write_text(json.dumps({
            "run_id": self.run, "request_fingerprint_ok": True,
            "all_lanes_pipeline_reports_present": True, "all_lanes_operational": True,
        }))

    def test_summary_only_aggregate_statistics_and_hashes(self):
        data = build(self.root, self.run)
        text = json.dumps(data)
        self.assertEqual(data["source_records"], 1502)
        self.assertEqual(data["exact_duplicate_groups"], 282)
        self.assertEqual(data["complete_lanes"], 11)
        self.assertFalse(data["historically_verified"])
        self.assertFalse(data["publication_allowed"])
        self.assertNotIn("PRIVATE DO NOT REPRODUCE", text)
        self.assertNotIn("private.invalid", text)
        self.assertEqual(len(data["archive_sha256_by_lane"]), 11)
        self.assertEqual(data["semantic_synthesis_status"], "NOT_RUN_FROM_UNPUBLISHED_RAW_EVIDENCE")

    def test_missing_lane_fails_closed(self):
        p = self.root/"evidence/runs"/self.run/"LANE_HANDOFF.json"
        v = json.loads(p.read_text())
        v["received_lanes"] = ["greek"]
        p.write_text(json.dumps(v))
        with self.assertRaisesRegex(ValueError, "RECOVERY_NOT_COMPLETE"):
            build(self.root, self.run)

    def test_mismatch_fingerprint_fails_closed(self):
        p = self.root/"evidence/runs"/self.run/"SYSTEM_HEALTH.json"
        v = json.loads(p.read_text())
        v["request_fingerprint_ok"] = False
        p.write_text(json.dumps(v))
        with self.assertRaisesRegex(ValueError, "RESEARCH_FINGERPRINT_MISMATCH"):
            build(self.root, self.run)

    def test_rejects_cross_run_and_traversal(self):
        with self.assertRaisesRegex(ValueError, "INVALID_ORIGINAL_RUN_ID"):
            build(self.root, "../123")
        p = self.root/"evidence/runs"/self.run/"SYSTEM_HEALTH.json"
        v = json.loads(p.read_text())
        v["run_id"] = "99999999"
        p.write_text(json.dumps(v))
        with self.assertRaisesRegex(ValueError, "CROSS_RUN_EVIDENCE_FORBIDDEN"):
            build(self.root, self.run)


if __name__ == "__main__":
    unittest.main()
