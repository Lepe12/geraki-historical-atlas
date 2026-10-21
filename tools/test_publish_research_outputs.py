"""Race regression: an older worker finishing last must preserve newer analysis."""
import json
import unittest
from unittest.mock import patch
from publish_research_outputs import shared_output,newer_analysis

class PublicationOrder(unittest.TestCase):
    def test_older_pointer_does_not_replace_newer_published_analysis(self):
        old={'analysis_path':'semantic_reanalysis_100'}
        new={'analysis_path':'semantic_reanalysis_200'}
        with patch('publish_research_outputs.git',side_effect=[json.dumps(new).encode(),json.dumps(old).encode()]):
            self.assertIsNone(shared_output('evidence/runs/99/research_continuation/latest.json','old-blob','main'))

    def test_older_snapshot_does_not_hide_newer_answer_for_same_parent(self):
        def snapshot(run,analysis):return {'run_id':run,'research_answer':{'execution_receipt':{'analysis_run_id':analysis}}}
        for path in ['command-center/live/runs/99.json','command-center/live/latest.json']:
            self.assertTrue(newer_analysis(path,snapshot('99','200'),snapshot('99','100')))
            self.assertFalse(newer_analysis(path,snapshot('99','100'),snapshot('99','200')))
            self.assertFalse(newer_analysis(path,snapshot('99','200'),snapshot('101','100')))

    def test_immutable_child_artifact_is_always_published(self):
        with patch('publish_research_outputs.git') as git:
            self.assertEqual(shared_output('evidence/runs/99/semantic_reanalysis_100/research_answer/answer.json','blob','main'),'blob')
            git.assert_not_called()

if __name__=='__main__':unittest.main()
