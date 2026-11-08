"""N7 post-research failures: genealogy must create its folder, publisher must explain rejections."""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

from publish_research_outputs import classify_push_failure, safe_push_diagnostic, retry_is_useful


SCRIPT = pathlib.Path(__file__).resolve().with_name("aggregate_source_genealogy.py")


class ResearchRecoveryTests(unittest.TestCase):
    def test_genealogy_creates_missing_parent_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--run-id", "42434462262"],
                cwd=tmp, capture_output=True, text=True, timeout=20,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            target = pathlib.Path(tmp) / "evidence/runs/42434462262/SOURCE_GENEALOGY.json"
            self.assertTrue(target.is_file())
            body = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(body["run_id"], "42434462262")
            self.assertEqual(body["source_count"], 0)
            self.assertFalse(any(x["relationship"] == "INDEPENDENT" for x in body["relationships"]))
            self.assertEqual(body["exact_duplicate_groups"], 0)

    def test_genealogy_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--run-id", "../bad"],
                cwd=tmp, capture_output=True, text=True, timeout=20,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((pathlib.Path(tmp) / "evidence/bad").exists())

    def test_classifies_push_failure_without_hiding_cause(self):
        examples = [
            (b"! [rejected] HEAD -> main (fetch first)", "CONCURRENT_MAIN_UPDATE", True),
            (b"remote: error: GH001: Large files detected", "GITHUB_FILE_SIZE_LIMIT", False),
            (b"remote: Permission to repository denied", "GITHUB_PERMISSION_OR_RULESET", False),
            (b"error: RPC failed; HTTP 502 curl 22", "GIT_TRANSPORT_FAILURE", True),
            (b"remote: error: pack exceeds maximum allowed size", "PUSH_PAYLOAD_TOO_LARGE", False),
            (b"remote: GH013 push declined due to repository rule violations", "GITHUB_REPOSITORY_RULE_VIOLATION", False),
            (b"remote: Push cannot contain secrets", "GITHUB_SECRET_SCANNING_PROTECTION", False),
        ]
        for message, expected, retry in examples:
            with self.subTest(expected=expected):
                actual = classify_push_failure(message)
                self.assertEqual(actual, expected)
                self.assertEqual(retry_is_useful(actual), retry)

    def test_diagnostics_redact_credentials_and_remote(self):
        message = b"fatal: https://user:secret@github.com/repo?token=abc request failed\n"
        shown = safe_push_diagnostic(message)
        self.assertNotIn("secret", shown)
        self.assertNotIn("abc", shown)
        self.assertNotIn("github.com/repo", shown)


if __name__ == "__main__":
    unittest.main()
