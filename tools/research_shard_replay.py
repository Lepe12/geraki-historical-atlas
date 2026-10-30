"""Recover source-bound extraction groups from preserved shard prompts.

No inference, source acquisition, claim approval or historical verification.
Original payloads remain unchanged; sidecars make their original grouping
available even when a later vector ranking produces different batch boundaries.
"""
import hashlib
import json
from pathlib import Path
import re


def recover(parent,analysis_id,queue):
    if not re.fullmatch(r'[0-9]+',str(analysis_id)):
        raise ValueError('NUMERIC_REPLAY_ANALYSIS_REQUIRED')
    source=Path(parent)/('semantic_reanalysis_'+str(analysis_id))
    shards=sorted((source/'shards').glob('shard_*'))
    if not shards:
        raise ValueError('PRESERVED_SHARDS_REQUIRED')
    recovered={};receipts=[];missing=[];counts=set()
    for shard in shards:
        summary=json.loads((shard/'shard_summary.json').read_text())
        counts.add(summary['count'])
        progress_path=shard/'research_answer/progress.json'
        progress_bytes=progress_path.read_bytes()
        progress=json.loads(progress_bytes)
        by_id={r['evidence_id']:r for r in progress['evidence']}
        for prompt in sorted((shard/'research_answer/model_responses').glob('*-evidence_extractor.prompt.txt')):
            raw=prompt.read_bytes()
            text=raw.decode('utf-8')
            if 'EVIDENCE_JSON:\n' not in text:
                raise ValueError('SHARD_EXTRACTION_PROMPT_INVALID')
            rows,_=json.JSONDecoder().raw_decode(text.split('EVIDENCE_JSON:\n',1)[1].lstrip())
            group=[by_id[r['evidence_id']] for r in rows]
            key=queue.binding(group)
            if key in recovered:
                continue
            if queue.load(group) is None:
                missing.append({'source_sha256':key,'reason':'NO_VALID_PRESERVED_EXTRACTION'})
                continue
            queue.register_group(group)
            recovered[key]=group
            receipts.append({'source_sha256':key,
                'prompt_path':str(prompt.relative_to(parent)),
                'prompt_sha256':hashlib.sha256(raw).hexdigest(),
                'progress_path':str(progress_path.relative_to(parent)),
                'progress_sha256':hashlib.sha256(progress_bytes).hexdigest()})
    if len(counts)!=1 or counts!={len(shards)}:
        raise ValueError('INCOMPLETE_OR_INCONSISTENT_PRESERVED_SHARDS')
    if not recovered:
        raise ValueError('NO_REPLAYABLE_SHARD_EXTRACTIONS')
    return {'schema':'source-bound-shard-recovery-v1','analysis_id':str(analysis_id),
            'shard_count':len(shards),'recovered_batches':len(recovered),
            'unique_examined_excerpts':len({r['evidence_id'] for g in recovered.values() for r in g}),
            'receipts':receipts,'missing_extractions':missing,
            'new_extraction_calls':0,'historical_verified':False}
