import json, tempfile, unittest
from pathlib import Path
from jarvis_escalate import plan

class EscalationTests(unittest.TestCase):
    def test_zero_candidates_plus_blocker_escalates(self):
        with tempfile.TemporaryDirectory() as t:
            run=Path(t)/"123"; lane=run/"venetian"
            (lane/"qa").mkdir(parents=True); (lane/"research_dossier").mkdir()
            (lane/"qa"/"qa_report.json").write_text(json.dumps({"candidate_events":0,"verified_events":0}))
            (lane/"research_dossier"/"venetian.json").write_text(json.dumps({"repositories_attempted":[{"repository":"Archivio di Stato di Venezia / SIAS","status":"AUTH_OR_BROWSER_REQUIRED"}]}))
            (lane/"research_request_identity.json").write_text(json.dumps({"normalized_request":{"target":"Petros Lantzas"},"request_sha256":"x","research_job_id":"j"}))
            out=plan(run)
            self.assertEqual(out["routes"][0]["route"],"moreveneto_browser")
    def test_candidates_prevent_escalation(self):
        with tempfile.TemporaryDirectory() as t:
            run=Path(t)/"123"; lane=run/"venetian"
            (lane/"qa").mkdir(parents=True); (lane/"research_dossier").mkdir()
            (lane/"qa"/"qa_report.json").write_text(json.dumps({"candidate_events":1,"verified_events":0}))
            (lane/"research_dossier"/"venetian.json").write_text(json.dumps({"repositories_attempted":[{"repository":"Archivio di Stato di Venezia / SIAS","status":"AUTH_OR_BROWSER_REQUIRED"}]}))
            self.assertEqual(plan(run)["routes"],[])

if __name__=="__main__": unittest.main()
