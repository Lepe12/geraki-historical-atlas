"""Normal continuations reuse completed source-bound work despite reordering."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import semantic_research_answer as engine
from test_semantic_shards import fixture, Caller, CONFIG, BASE_ENV, PLACES


class IncrementalReading(unittest.TestCase):
    def test_reordered_normal_pass_reads_no_previously_completed_excerpt(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp)
            env={**BASE_ENV,'PCT_SEMANTIC_BATCH_CHARS':'3000','PCT_SEMANTIC_SHARD':'','PCT_SEMANTIC_MERGE':''}
            with patch.dict(os.environ,env):
                first=engine.execute(tmp,'Synthetic question',caller=Caller(),config=CONFIG,
                                     output_root=Path(tmp)/'first',provenance_root=tmp)
            original=engine.collect
            def reversed_collection(*args):
                rows,excluded=original(*args)
                return list(reversed(rows)),excluded
            caller=Caller(forbid=('evidence_extractor',))
            with patch.dict(os.environ,env),patch.object(engine,'collect',reversed_collection):
                second=engine.execute(tmp,'Synthetic question',caller=caller,config=CONFIG,
                                      output_root=Path(tmp)/'second',provenance_root=tmp)
            self.assertEqual(second['source_group_reuse']['saved_excerpts'],len(PLACES))
            self.assertEqual({c['claim_id'] for c in first['claims']},{c['claim_id'] for c in second['claims']})
            self.assertNotIn('evidence_extractor',caller.calls)
            self.assertEqual(second['research_funnel']['examined']['remaining'],0)

    def test_exact_replay_needs_no_new_model_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp)
            env={**BASE_ENV,'PCT_ENABLE_RESPONSE_CACHE':'1','PCT_SEMANTIC_PARTIAL_ANSWER':'0','PCT_SEMANTIC_SHARD':'','PCT_SEMANTIC_MERGE':''}
            with patch.dict(os.environ,env):
                first=engine.execute(tmp,'Synthetic question',caller=Caller(),config=CONFIG,
                                     output_root=Path(tmp)/'first',provenance_root=tmp)
                caller=Caller(forbid=('evidence_extractor','adversarial_reviewer','synthesis'))
                second=engine.execute(tmp,'Synthetic question',caller=caller,config=CONFIG,
                                      output_root=Path(tmp)/'second',provenance_root=tmp)
            self.assertEqual(first['answer_sections'],second['answer_sections'])
            self.assertFalse(caller.calls)

    def test_changed_source_is_not_reused_as_if_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp)
            env={**BASE_ENV,'PCT_SEMANTIC_BATCH_CHARS':'3000','PCT_SEMANTIC_SHARD':'','PCT_SEMANTIC_MERGE':''}
            with patch.dict(os.environ,env):
                engine.execute(tmp,'Synthetic question',caller=Caller(),config=CONFIG,
                               output_root=Path(tmp)/'first',provenance_root=tmp)
            original=engine.collect
            def changed_collection(*args):
                rows,excluded=original(*args)
                row=dict(rows[0]);row['text']+=' New source sentence.'
                return [row,*rows[1:]],excluded
            caller=Caller()
            with patch.dict(os.environ,env),patch.object(engine,'collect',changed_collection):
                second=engine.execute(tmp,'Synthetic question',caller=caller,config=CONFIG,
                                      output_root=Path(tmp)/'second',provenance_root=tmp)
            self.assertTrue(second['source_group_reuse']['holds'])
            self.assertIn('evidence_extractor',caller.calls)
            self.assertLess(second['source_group_reuse']['saved_excerpts'],len(PLACES))


if __name__=='__main__':unittest.main()
