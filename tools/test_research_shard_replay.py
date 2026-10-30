import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from research_continuation import Continuation, atomic
from research_shard_replay import recover


class SavedGroups(unittest.TestCase):
    def test_overlapping_groups_survive_reordering_and_deduplicate_inventory(self):
        with tempfile.TemporaryDirectory() as tmp:
            q=Continuation(Path(tmp)/'research_continuation','question',b'code',{})
            rows=[{'evidence_id':str(i),'text':'source '+str(i),'occurrences':[]} for i in range(4)]
            q.save(rows[:3],{'items':[]});q.save(rows[2:],{'items':[]})
            current=[{**r,'screening':{'changed':'reading metadata'}} for r in reversed(rows)]
            groups,holds=q.replay_groups(current)
            self.assertEqual(holds,[])
            q.inventory(current,groups,[])
            value=json.loads((q.root/'queue.json').read_text())
            self.assertEqual(value['completed'],4)
            self.assertEqual(value['status'],'COMPLETE')

    def test_changed_evidence_is_held_and_corrupt_group_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            q=Continuation(Path(tmp),'question',b'code',{})
            group=[{'evidence_id':'e1','text':'exact acquired text','occurrences':[]}]
            q.save(group,{'items':[]})
            groups,holds=q.replay_groups([{**group[0],'text':'different acquired text'}])
            self.assertEqual(groups,[])
            self.assertEqual(holds[0]['reason'],'CURRENT_SOURCE_OR_SELECTION_CHANGED')
            path=next((q.root/'groups').glob('*.json'))
            value=json.loads(path.read_text());value['source_group'][0]['text']='corrupt'
            atomic(path,value)
            with self.assertRaisesRegex(ValueError,'INVALID_SOURCE_GROUP_BINDING'):
                q.replay_groups(group)

    def test_legacy_prompt_recovers_only_an_existing_valid_payload_without_overwriting_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent=Path(tmp)
            q=Continuation(parent/'research_continuation','question',b'code',{})
            group=[{'evidence_id':'e1','text':'exact acquired text','occurrences':[]}]
            q.save(group,{'items':[]})
            batch=q.path(group);before=batch.read_bytes()
            for p in (q.root/'groups').glob('*.json'):p.unlink()
            shard=parent/'semantic_reanalysis_123/shards/shard_0'
            (shard/'research_answer/model_responses').mkdir(parents=True)
            atomic(shard/'shard_summary.json',{'count':1,'index':0})
            atomic(shard/'research_answer/progress.json',{'evidence':group})
            (shard/'research_answer/model_responses/1-evidence_extractor.prompt.txt').write_text(
                'RULES\nEVIDENCE_JSON:\n'+json.dumps([{'evidence_id':'e1'}])+'\nMore instructions')
            report=recover(parent,'123',q)
            self.assertEqual(report['unique_examined_excerpts'],1)
            self.assertEqual(report['new_extraction_calls'],0)
            self.assertEqual(batch.read_bytes(),before)
            self.assertEqual(len(q.replay_groups(group)[0]),1)


class DifferentRankingMerge(unittest.TestCase):
    def test_merge_replays_saved_groups_when_batch_boundaries_change(self):
        import semantic_research_answer as engine
        from test_semantic_shards import fixture, Caller, CONFIG, BASE_ENV, PLACES
        with tempfile.TemporaryDirectory() as tmp:
            fixture(tmp)
            env={**BASE_ENV,'PCT_SEMANTIC_BATCH_CHARS':'3000','PCT_SEMANTIC_SHARD':'0/1'}
            with patch.dict(os.environ,env):
                shard=engine.execute(tmp,'Synthetic question',caller=Caller(),config=CONFIG,
                                     output_root=Path(tmp)/'shard',provenance_root=tmp)
            original_collect=engine.collect
            def changed_order(*args):
                rows,excluded=original_collect(*args)
                return list(reversed(rows)),excluded
            caller=Caller(forbid=('evidence_extractor',))
            with patch.dict(os.environ,{**env,'PCT_SEMANTIC_SHARD':'','PCT_SEMANTIC_MERGE':'1'}),patch.object(engine,'collect',changed_order):
                merged=engine.execute(tmp,'Synthetic question',caller=caller,config=CONFIG,
                                      output_root=Path(tmp)/'merged',provenance_root=tmp)
            self.assertEqual(len(merged['evidence']),len(PLACES))
            self.assertEqual(len(merged['claims']),len(PLACES))
            self.assertEqual(merged['research_funnel']['examined']['remaining'],0)
            self.assertEqual({c['claim_id'] for c in merged['claims']},{c['claim_id'] for c in shard['claims']})
            self.assertNotIn('evidence_extractor',caller.calls)


class CoverageGenerations(unittest.TestCase):
    def test_legacy_larger_total_does_not_claim_zero_progress_in_a_new_generation(self):
        from continuation_rounds import record
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            atomic(root/'research_continuation/rounds.json',{'schema':'research-continuation-rounds-v1',
                'rounds':[{'round':1,'examined':115,'remaining':144,'new_supported_claims':0}]})
            atomic(root/'research_continuation/active.json',{'queue':'new/queue.json'})
            atomic(root/'research_continuation/new/queue.json',{'total':121,'completed':89,'status':'PENDING',
                'items':[{'evidence_id':str(i),'status':'EXAMINED'} for i in range(89)]})
            ledger=record(root,{},2,env={'PCT_CONTINUATION_MAX_ROUNDS':'10'})
            self.assertIsNone(ledger['rounds'][-1]['new_examined'])
            self.assertNotEqual(ledger['stop_reason'],'NO_NEW_EXCERPTS_READ')
            ledger=record(root,{},3,env={'PCT_CONTINUATION_MAX_ROUNDS':'10'})
            self.assertEqual(ledger['rounds'][-1]['new_examined'],0)
            self.assertEqual(ledger['stop_reason'],'NO_NEW_EXCERPTS_READ')


if __name__=='__main__':unittest.main()
