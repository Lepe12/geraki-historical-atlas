import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from run_first_pass_speed_probe import prepare,restore,compare,fixture

class BoundProbe(unittest.TestCase):
    def test_actual_public_ocr_is_preserved_and_forms_four_cold_batches(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Path(tmp)/'seed';output=Path(tmp)/'output'
            env={'PCT_LLM_PROVIDER':'local_llama_cpp','PCT_LLM_MODEL':'Qwen/Qwen3-8B-GGUF',
                 'PCT_PREFILTER':'0','PCT_SCREENING':'0','PCT_EXCERPT_RANKING':'0',
                 'PCT_SEMANTIC_BATCH_CHARS':'2200','PCT_SEMANTIC_BATCHES':'4','PCT_SEMANTIC_SHARD':'','PCT_SEMANTIC_MERGE':''}
            with patch.dict(os.environ,env):prepare(repo,'123',output)
            restored=Path(tmp)/'restored';restore(restored,output)
            data,_=fixture()
            for i,row in enumerate(data['records']):
                path=restored/'evidence/runs/123/travellers/library_acquisition'/f'sonnini-excerpt-{i+1}.txt'
                self.assertEqual(path.read_text(),row['record']['text'])
            self.assertFalse(list((restored/'evidence/runs/123/research_continuation').glob('*/batches/*.json')))
            self.assertTrue((restored/'evidence/runs/123/first_pass/reading_plan.json').exists())

    def test_comparison_rejects_different_workloads(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for name,sha in [('serial','one'),('parallel','different')]:
                p=root/name/'timing.json';p.parent.mkdir()
                p.write_text(json.dumps({'profile':name,'fixture_sha256':sha,'plan_sha256':'same','question':'same'}))
            with self.assertRaisesRegex(ValueError,'NOT_IDENTICAL'):compare(root,root/'out')

if __name__=='__main__':unittest.main()
