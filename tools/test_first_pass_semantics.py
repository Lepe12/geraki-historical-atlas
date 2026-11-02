"""Parallel initial reading: frozen source order, isolated workers and safe merge."""
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import semantic_research_answer as engine
from first_pass_semantics import freeze,apply_plan,prepare,read_shard,pack,unpack,file_hash
from research_continuation import Continuation,digest,atomic
from test_semantic_shards import fixture,Caller,CONFIG,BASE_ENV


class FrozenOrder(unittest.TestCase):
    def test_sources_and_configuration_are_bound_but_order_is_restored(self):
        with tempfile.TemporaryDirectory() as tmp:
            q=Continuation(tmp,'question',b'code',{'model':'a'})
            records=[{'evidence_id':'a','text':'source A'},{'evidence_id':'b','text':'source B'}]
            p=Path(tmp)/'plan.json';freeze(p,records,q,{'rank':'frozen'})
            rows,report=apply_plan(p,list(reversed(records)),q)
            self.assertEqual(rows,records);self.assertEqual(report,{'rank':'frozen'})
            with self.assertRaisesRegex(ValueError,'SOURCE_OR_CONFIGURATION'):
                apply_plan(p,[{**records[0],'text':'changed'},records[1]],q)
            with self.assertRaisesRegex(ValueError,'SOURCE_OR_CONFIGURATION'):
                apply_plan(p,records,q,{'aliases':['changed research scope']})
            with self.assertRaisesRegex(ValueError,'SOURCE_OR_CONFIGURATION'):
                apply_plan(p,records,Continuation(tmp,'another question',b'code',{'model':'a'}))
            with self.assertRaisesRegex(ValueError,'SOURCE_OR_CONFIGURATION'):
                apply_plan(p,records,Continuation(tmp,'question',b'code',{'model':'b'}))
            value=json.loads(p.read_text());value['order'].reverse();p.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError,'CHECKSUM'):apply_plan(p,records,q)

    def test_small_disabled_and_eval_requests_keep_the_single_runner(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'evidence/runs/123';fixture(root)
            with patch.dict(os.environ,{**BASE_ENV,'PCT_LLM_PROVIDER':'disabled'}):
                self.assertEqual(prepare(tmp,'123',4)['shards'],1)
            with patch.dict(os.environ,{**BASE_ENV,'PCT_LLM_PROVIDER':'local_llama_cpp','PCT_EVAL_FAST_MODE':'true'}):
                self.assertEqual(prepare(tmp,'123',4)['shards'],1)

    def test_planner_uses_pending_batches_and_never_calls_inference(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'evidence/runs/123';fixture(root)
            with patch.dict(os.environ,{**BASE_ENV,'PCT_LLM_PROVIDER':'local_llama_cpp','PCT_LLM_MODEL':'fixture',
                                        'PCT_SEMANTIC_BATCH_CHARS':'6500','PCT_EVAL_FAST_MODE':'false'}),patch.object(engine,'call',side_effect=AssertionError('planning must not infer')):
                self.assertEqual(prepare(tmp,'123',4)['shards'],1)
            with patch.dict(os.environ,{**BASE_ENV,'PCT_LLM_PROVIDER':'local_llama_cpp','PCT_LLM_MODEL':'fixture',
                                        'PCT_SEMANTIC_BATCH_CHARS':'1200','PCT_EVAL_FAST_MODE':'false'}),patch.object(engine,'call',side_effect=AssertionError('planning must not infer')):
                self.assertEqual(prepare(tmp,'123',4)['shards'],4)


class InitialParallel(unittest.TestCase):
    def test_four_isolated_readers_cover_each_excerpt_once_and_merge_does_no_extraction(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp);seed=base/'seed';root=seed/'evidence/runs/123'
            places=['Kimolos','Milos','Sifnos','Paros','Naxos','Rhodes','Crete','Corfu']
            with patch('test_semantic_shards.PLACES',places):fixture(root)
            env={**BASE_ENV,'PCT_LLM_PROVIDER':'disabled','PCT_SEMANTIC_PARTIAL_ANSWER':'1',
                 'PCT_SEMANTIC_SHARD':'','PCT_SEMANTIC_MERGE':''}
            with patch.dict(os.environ,{**env,'PCT_SEMANTIC_WRITE_READING_PLAN':str(root/'first_pass/reading_plan.json')}):
                plan=engine.execute(root,'Historical research',config={'configured':False,'missing':[]})
            self.assertFalse(plan['model_used']);self.assertFalse(plan['calls'])
            extracted=[];transports=base/'transports';transports.mkdir()
            original_execute=engine.execute;original_collect=engine.collect
            def reversed_collect(*args,**kwargs):
                rows,excluded=original_collect(*args,**kwargs)
                return list(reversed(rows)),excluded
            for i in range(4):
                repo=base/f'worker_{i}';shutil.copytree(seed,repo)
                caller=Caller()
                def execute(*args,**kwargs):return original_execute(*args,caller=caller,config=CONFIG,**kwargs)
                with patch.dict(os.environ,env),patch.object(engine,'execute',side_effect=execute),patch.object(engine,'collect',side_effect=reversed_collect):
                    result=read_shard(repo,'123',i,4)
                self.assertEqual(result['index'],i)
                self.assertNotIn('synthesis',caller.calls)
                extracted+=caller.extracted
                pack(repo,'123',i,4,transports/f'shard_{i}')
            self.assertEqual(len(extracted),len(set(extracted)))
            self.assertEqual(len(extracted),len(places))
            collector=base/'collector';shutil.copytree(seed,collector)
            summary=unpack(collector,'123',4,transports)
            self.assertFalse(summary['missing_shards']);self.assertFalse(summary['transport_missing'])
            merge_root=collector/'evidence/runs/123'
            caller=Caller(forbid=('evidence_extractor',))
            with patch.dict(os.environ,{**env,'PCT_SEMANTIC_MERGE':'1','PCT_SEMANTIC_READING_PLAN':str(merge_root/'first_pass/reading_plan.json')}):
                answer=original_execute(merge_root,'Historical research',caller=caller,config=CONFIG)
            self.assertEqual(len(answer['claims']),len(places))
            self.assertEqual(answer['research_funnel']['examined']['remaining'],0)
            self.assertTrue(answer['answer_sections'])
            self.assertNotIn('evidence_extractor',caller.calls)
            self.assertEqual(answer['coverage']['new_claim_review_calls'],0)

    def test_transport_corruption_and_wrong_scope_do_not_modify_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Path(tmp)/'repo';root=repo/'evidence/runs/123'
            atomic(root/'first_pass/reading_plan.json',{'frozen':'plan'})
            atomic(root/'first_pass/shards/shard_0/shard_summary.json',{'index':0,'count':2,'status':'PARTIAL'})
            atomic(root/'research_continuation'/('a'*64)/'batches/b.json',{'raw':'original'})
            incoming=Path(tmp)/'incoming';bundle=incoming/'shard_0';pack(repo,'123',0,2,bundle)
            collector=Path(tmp)/'collector';atomic(collector/'evidence/runs/123/first_pass/reading_plan.json',{'frozen':'plan'})
            archive=bundle/'shard.tgz'
            with archive.open('ab') as out:out.write(b'corrupt')
            with self.assertRaisesRegex(ValueError,'CHECKSUM'):unpack(collector,'123',2,incoming)
            self.assertFalse((collector/'evidence/runs/123/research_continuation').exists())
            # Even a self-consistent archive may never write code or another run.
            with tarfile.open(archive,'w:gz') as tar:
                member=tarfile.TarInfo('tools/unsafe.py');member.size=1;tar.addfile(member,io.BytesIO(b'x'))
            m=json.loads((bundle/'manifest.json').read_text());m['archive_sha256']=file_hash(archive)
            m['files']=[{'path':'tools/unsafe.py','bytes':1,'sha256':hashlib.sha256(b'x').hexdigest()}]
            atomic(bundle/'manifest.json',m)
            with self.assertRaisesRegex(ValueError,'UNSAFE'):unpack(collector,'123',2,incoming)
            self.assertFalse((collector/'tools/unsafe.py').exists())

    def test_missing_reader_is_explicit_and_available_work_survives(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Path(tmp)/'repo';root=repo/'evidence/runs/123'
            atomic(root/'first_pass/reading_plan.json',{'frozen':'plan'})
            atomic(root/'first_pass/shards/shard_0/shard_summary.json',{'index':0,'count':2,'status':'PARTIAL'})
            atomic(root/'research_continuation'/('a'*64)/'batches/b.json',{'raw':'original'})
            incoming=Path(tmp)/'incoming';pack(repo,'123',0,2,incoming/'shard_0')
            collector=Path(tmp)/'collector';atomic(collector/'evidence/runs/123/first_pass/reading_plan.json',{'frozen':'plan'})
            result=unpack(collector,'123',2,incoming)
            self.assertEqual(result['missing_shards'],[1]);self.assertEqual(result['transport_missing'],[1])
            self.assertEqual(json.loads((collector/'evidence/runs/123/research_continuation'/('a'*64)/'batches/b.json').read_text()),{'raw':'original'})

if __name__=='__main__':unittest.main()
