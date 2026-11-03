"""Offline integration tests for the first-party NABOU multi-file coding agent."""
from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from nabou_coding_agent import AgentError
from nabou_coding_task import main, prepare_changes, selected_files


class MultiFileCodingTaskTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.frontend = self.root / "jarvis-intelligence-chamber"
        self.frontend.mkdir()
        self.one = self.frontend / "nabou-shell.js"
        self.two = self.frontend / "command-deck.js"
        self.one_source = 'export const a = "old-one";\n'
        self.two_source = 'export const b = "old-two";\n'
        self.one.write_text(self.one_source, encoding="utf-8")
        self.two.write_text(self.two_source, encoding="utf-8")
        self.names = "jarvis-intelligence-chamber/nabou-shell.js,jarvis-intelligence-chamber/command-deck.js"
        self.report = self.root / "result.json"

    def proposal_file(self, second_good=True):
        file = self.root / "proposals.json"
        value = {
            "jarvis-intelligence-chamber/nabou-shell.js": {
                "summary": "update a", "edits": [{"old": "old-one", "new": "new-one"}],
            },
            "jarvis-intelligence-chamber/command-deck.js": {
                "summary": "update b",
                "edits": [{"old": '"old-two"', "new": '"new-two"' if second_good else '"'}],
            },
        }
        file.write_text(json.dumps(value), encoding="utf-8")
        return file

    def execute(self, *, apply=False, proposal=None):
        argv = ["--repo", str(self.root), "--files", self.names,
                "--task", "Coordinate two safe module changes",
                "--report", str(self.report)]
        if apply:
            argv.append("--apply")
        if proposal:
            argv += ["--proposals-file", str(proposal)]
        return main(argv)

    def test_two_files_preview_is_non_mutating(self):
        self.assertEqual(self.execute(proposal=self.proposal_file()), 0)
        self.assertEqual(self.one.read_text(), self.one_source)
        self.assertEqual(self.two.read_text(), self.two_source)
        r = json.loads(self.report.read_text())
        self.assertEqual(r["status"], "preview_only")
        patch = self.report.with_name("agent_task_preview.patch")
        self.assertTrue(patch.exists())
        self.assertIn("a/jarvis-intelligence-chamber/nabou-shell.js", patch.read_text())
        self.assertIn("b/jarvis-intelligence-chamber/command-deck.js", patch.read_text())
        self.assertEqual(len(r["files"]), 2)
        self.assertNotEqual(r["files"][0]["before_sha256"], r["files"][0]["after_sha256"])

    @unittest.skipUnless(subprocess.run(["which", "node"], capture_output=True).returncode == 0,
                         "Node.js is required for syntax checking")
    def test_two_valid_files_apply_together(self):
        self.assertEqual(self.execute(apply=True, proposal=self.proposal_file()), 0)
        self.assertIn("new-one", self.one.read_text())
        self.assertIn("new-two", self.two.read_text())
        r = json.loads(self.report.read_text())
        self.assertEqual(r["status"], "applied")
        self.assertEqual(len(r["checks"]), 2)
        self.assertTrue(all(x["ok"] for x in r["checks"]))

    @unittest.skipUnless(subprocess.run(["which", "node"], capture_output=True).returncode == 0,
                         "Node.js is required for syntax checking")
    def test_atomic_rollback_when_second_file_invalid(self):
        self.assertEqual(self.execute(apply=True, proposal=self.proposal_file(False)), 1)
        self.assertEqual(self.one.read_text(), self.one_source)
        self.assertEqual(self.two.read_text(), self.two_source)
        self.assertEqual(json.loads(self.report.read_text())["status"], "blocked")

    def test_no_partial_write_if_second_proposal_bad(self):
        proposal = self.proposal_file()
        obj = json.loads(proposal.read_text())
        obj["jarvis-intelligence-chamber/command-deck.js"]["edits"][0]["old"] = "missing text"
        proposal.write_text(json.dumps(obj))
        self.assertEqual(self.execute(apply=True, proposal=proposal), 1)
        self.assertEqual(self.one.read_text(), self.one_source)
        self.assertEqual(self.two.read_text(), self.two_source)

    def test_file_list_and_scope_are_strict(self):
        for bad in (
            "jarvis-intelligence-chamber/nabou-shell.js",
            "jarvis-intelligence-chamber/nabou-shell.js,jarvis-intelligence-chamber/nabou-shell.js",
            self.names + ",jarvis-intelligence-chamber/command-deck.css,jarvis-intelligence-chamber/nabou-shell.css",
        ):
            with self.subTest(bad=bad), self.assertRaises(AgentError):
                selected_files(bad)
        self.assertEqual(len(selected_files(self.names)), 2)

    def test_protected_file_rejected_before_inference(self):
        from nabou_coding_task import prepare_changes
        protected = [
            "jarvis-intelligence-chamber/nabou-shell.js",
            "jarvis-intelligence-chamber/index.html",
        ]
        with patch("nabou_coding_task.infer_model", side_effect=AssertionError("called")) as spy:
            with self.assertRaises(AgentError):
                prepare_changes(self.root, protected, "Change only the reviewed code",
                                model="mock", endpoint="", token="")
            spy.assert_not_called()

    def test_proposal_cannot_escape_explicit_targets(self):
        proposal = self.proposal_file()
        obj = json.loads(proposal.read_text())
        obj["jarvis-intelligence-chamber/map-3d.js"] = obj.pop(
            "jarvis-intelligence-chamber/command-deck.js")
        proposal.write_text(json.dumps(obj))
        self.assertEqual(self.execute(apply=True, proposal=proposal), 1)
        self.assertEqual(self.one.read_text(), self.one_source)
        self.assertEqual(self.two.read_text(), self.two_source)

    def test_model_is_invoked_once_per_approved_file(self):
        def infer(_, source, target, *args):
            if "nabou-shell" in target:
                self.assertIn("old-one", source)
                return json.dumps({"edits": [{"old": "old-one", "new": "new-one"}]})
            self.assertIn("old-two", source)
            return json.dumps({"edits": [{"old": "old-two", "new": "new-two"}]})

        with patch("nabou_coding_task.infer_model", side_effect=infer) as model:
            changes = prepare_changes(
                self.root, selected_files(self.names), "Update both frontend modules",
                model="mock", endpoint="", token="")
        self.assertEqual(model.call_count, 2)
        self.assertEqual(len(changes), 2)
        self.assertEqual(self.one.read_text(), self.one_source)
        self.assertEqual(self.two.read_text(), self.two_source)

    def test_bad_model_patch_gets_exactly_one_bounded_retry(self):
        attempts = []
        def model(task, source, target, *args):
            attempts.append(target)
            if target.endswith("nabou-shell.js"):
                return json.dumps({"edits": [{"old": "old-one", "new": "new-one"}]})
            if attempts.count(target) == 1:
                return json.dumps({"edits": [{"old": "not-found", "new": "oops"}]})
            self.assertIn("Previous attempt was rejected", task)
            return json.dumps({"edits": [{"old": "old-two", "new": "new-two"}]})

        with patch("nabou_coding_task.infer_model", side_effect=model):
            changes = prepare_changes(
                self.root, selected_files(self.names), "Update two exact module strings",
                model="mock", endpoint="", token="")
        self.assertEqual(len(attempts), 3)
        self.assertEqual([x["model_attempts"] for x in changes], [1, 2])
        self.assertEqual(self.one.read_text(), self.one_source)
        self.assertEqual(self.two.read_text(), self.two_source)

    def test_two_bad_model_patches_abort_without_file_writes(self):
        def model(task, source, target, *args):
            if target.endswith("nabou-shell.js"):
                return json.dumps({"edits": [{"old": "old-one", "new": "new-one"}]})
            return json.dumps({"edits": [{"old": "not-found", "new": "oops"}]})

        with patch("nabou_coding_task.infer_model", side_effect=model) as spy:
            with self.assertRaises(AgentError):
                prepare_changes(
                    self.root, selected_files(self.names), "Try two code changes",
                    model="mock", endpoint="", token="")
        self.assertEqual(spy.call_count, 3)
        self.assertEqual(self.one.read_text(), self.one_source)
        self.assertEqual(self.two.read_text(), self.two_source)

    def test_symlink_is_rejected(self):
        self.two.unlink()
        self.two.symlink_to(self.one)
        self.assertEqual(self.execute(apply=True, proposal=self.proposal_file()), 1)
        self.assertEqual(self.one.read_text(), self.one_source)


    def test_css_valid_and_invalid_structure(self):
        from nabou_coding_task import check_css_structure
        css = self.frontend / "navigation-rail.css"
        css.write_text('.menu { color: white; }\n')
        self.assertTrue(check_css_structure(css)["ok"])
        css.write_text('.menu { color: white;\n')
        self.assertFalse(check_css_structure(css)["ok"])
        css.write_text('.menu { content: "}"; }\n')
        self.assertTrue(check_css_structure(css)["ok"])
        css.write_text('.menu { /* never closed')
        self.assertFalse(check_css_structure(css)["ok"])

    def test_css_transaction_rolls_back_second_invalid_file(self):
        first = self.frontend / "navigation-rail.css"
        second = self.frontend / "nabou-shell.css"
        first.write_text(".rail { color: red; }\n")
        second.write_text(".shell { color: blue; }\n")
        file = self.root / "css.json"
        targets = ("jarvis-intelligence-chamber/navigation-rail.css,"
                   "jarvis-intelligence-chamber/nabou-shell.css")
        proposals = {
            "jarvis-intelligence-chamber/navigation-rail.css":
                {"edits": [{"old": "red", "new": "cyan"}]},
            "jarvis-intelligence-chamber/nabou-shell.css":
                {"edits": [{"old": "blue; }", "new": "blue; /* missing close"}]},
        }
        file.write_text(json.dumps(proposals))
        code = main(["--repo", str(self.root), "--files", targets,
                     "--task", "Improve both stylesheet focus colors",
                     "--apply", "--proposals-file", str(file),
                     "--report", str(self.report)])
        self.assertEqual(code, 1)
        self.assertEqual(first.read_text(), ".rail { color: red; }\n")
        self.assertEqual(second.read_text(), ".shell { color: blue; }\n")



if __name__ == "__main__":
    unittest.main()
