"""Tests for bounded anchor patches and immutable coder model preparation."""
from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from nabou_coding_agent import AgentError
from nabou_patch_engine import parse_and_apply
from prepare_nabou_coder_model import FILENAME, REPO, prepare


class ExactPatchTests(unittest.TestCase):
    def test_old_new_backwards_compatible(self):
        proposal = {"edits": [{"old": "color: red", "new": "color: cyan"}]}
        obj, result = parse_and_apply(json.dumps(proposal), ".x{color: red;}")
        self.assertIn("cyan", result)
        self.assertEqual(len(obj["edits"]), 1)

    def test_insert_after_unique_anchor(self):
        original = ".nav:focus-visible{outline:2px solid cyan}\n"
        payload = {"edits": [{"op": "insert_after", "anchor": original.strip(),
                               "text": "\n@media(forced-colors:active){.nav:focus-visible{outline:3px solid Highlight}}\n"}]}
        _, result = parse_and_apply(json.dumps(payload), original)
        self.assertTrue(result.startswith(original))
        self.assertIn("forced-colors", result)

    def test_insert_before(self):
        _, result = parse_and_apply(json.dumps({"edits": [{
            "op": "insert_before", "anchor": "const value = 3;", "text": "// keep\n"
        }]}), "const value = 3;\n")
        self.assertEqual(result, "// keep\nconst value = 3;\n")

    def test_duplicate_anchor_fail_closed(self):
        with self.assertRaises(AgentError):
            parse_and_apply(json.dumps({"edits": [{"op": "insert_after",
                "anchor": ".x", "text": "something"}]}), ".x{}\n.x{}")

    def test_hallucinated_anchor_fail_closed(self):
        with self.assertRaises(AgentError):
            parse_and_apply(json.dumps({"edits": [{"op": "insert_after",
                "anchor": ".does-not-exist{}", "text": ".y{}"}]}), ".x{}")

    def test_large_ai_rewrite_refused(self):
        with self.assertRaises(AgentError):
            parse_and_apply(json.dumps({"edits": [{"op": "insert_after",
                "anchor": ".x{}", "text": "x" * 1201}]}), ".x{}")

    def test_invalid_operation_refused(self):
        with self.assertRaises(AgentError):
            parse_and_apply(json.dumps({"edits": [{"op": "shell",
                "command": "rm -rf /"}]}), ".x{}")

    def test_fenced_json(self):
        ticks = chr(96) * 3
        payload = ticks + 'json\n{"edits":[{"old":"old","new":"new"}]}\n' + ticks
        _, result = parse_and_apply(payload, "old")
        self.assertEqual(result, "new")

    def test_multi_operation_atomic_candidate(self):
        with self.assertRaises(AgentError):
            parse_and_apply(json.dumps({"edits": [
                {"op": "replace", "old": "old", "new": "new"},
                {"op": "insert_after", "anchor": "not in original", "text": "oops"},
            ]}), "old")


class CoderModelTests(unittest.TestCase):
    def test_verified_model_with_pinned_revision(self):
        payload = b"tiny fixture (not a real GGUF)"
        expected = hashlib.sha256(payload).hexdigest()
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            model = base / FILENAME
            model.write_bytes(payload)
            api = SimpleNamespace(model_info=lambda repo, revision, files_metadata:
                SimpleNamespace(sha="a" * 40,
                    siblings=[SimpleNamespace(rfilename=FILENAME,
                                             lfs=SimpleNamespace(sha256=expected))]))
            received = []
            def download(repo, filename, revision, local_dir):
                received.append((repo, filename, revision))
                return model
            with patch("prepare_nabou_coder_model.EXPECTED_SHA256", expected):
                manifest = prepare(base, api=api, downloader=download)
            self.assertEqual(received, [(REPO, FILENAME, "a" * 40)])
            self.assertEqual(manifest["sha256"], expected)
            self.assertTrue(model.with_suffix(".manifest.json").exists())

    def test_wrong_model_hash_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            model = base / FILENAME
            model.write_bytes(b"tampered")
            api = SimpleNamespace(model_info=lambda repo, revision, files_metadata:
                SimpleNamespace(sha="b" * 40,
                    siblings=[SimpleNamespace(rfilename=FILENAME, lfs=None)]))
            with self.assertRaisesRegex(ValueError, "MODEL_CHECKSUM_MISMATCH"):
                prepare(base, api=api, downloader=lambda *_args, **_kwargs: model)

    def test_nonimmutable_revision_fails(self):
        api = SimpleNamespace(model_info=lambda repo, revision, files_metadata:
            SimpleNamespace(sha="main", siblings=[]))
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, "MODEL_REVISION_NOT_IMMUTABLE"):
                prepare(Path(temp), api=api, downloader=lambda *_args, **_kw: None)


if __name__ == "__main__":
    unittest.main()
