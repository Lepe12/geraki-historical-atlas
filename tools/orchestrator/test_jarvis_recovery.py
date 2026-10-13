import unittest
from jarvis_recovery import decide, RecoveryAction

class RecoveryTests(unittest.TestCase):
    def test_blocker_escalates(self):
        self.assertEqual(decide("AUTH_OR_BROWSER_REQUIRED").action,RecoveryAction.ESCALATE)
    def test_transient_retries_once(self):
        self.assertEqual(decide("ERROR","connection reset",attempts=1).action,RecoveryAction.RETRY)
    def test_repeated_transient_replans(self):
        self.assertEqual(decide("ERROR","connection reset",attempts=2).action,RecoveryAction.REPLAN)
    def test_candidates_accept(self):
        self.assertEqual(decide("NO_EVENT_CANDIDATES",candidate_events=1).action,RecoveryAction.ACCEPT)

if __name__=="__main__": unittest.main()
