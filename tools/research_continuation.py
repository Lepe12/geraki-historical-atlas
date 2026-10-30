"""Durable source-bound extraction checkpoints; no historical verification."""
import hashlib
import json
import re
from pathlib import Path


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False).encode()).hexdigest()


def atomic(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    temporary.replace(path)


class Continuation:
    def __init__(self,root,question,code,configuration):
        actual=hashlib.sha256(code).hexdigest()
        registry=Path(__file__).with_name('research_checkpoint_compatibility.json')
        revisions=json.loads(registry.read_text()).get('raw_extraction_replay',{}) if registry.is_file() else {}
        previous=revisions.get(actual,{}).get('cache_code_sha256',actual)
        if not re.fullmatch(r'[a-f0-9]{64}',previous):raise ValueError('INVALID_EXTRACTION_CACHE_CODE_BINDING')
        self.actual_code_sha256=actual;self.cache_code_sha256=previous
        self.root=Path(root)/digest([question,previous,configuration])

    def binding(self,group):
        # Reanalysis writes new derived files under a new execution ID. Bind to
        # their checked bytes, locators and metadata, not the temporary prefix.
        def stable(value,key=None):
            if isinstance(value,dict):return {k:stable(v,k) for k,v in value.items()}
            if isinstance(value,list):return [stable(v,key) for v in value]
            if isinstance(value,str) and key in ('path','acquired_text_path'):
                return re.sub(r'^semantic_reanalysis_[0-9]+/derived_sources/','',value)
            return value
        return digest(stable(group))

    def path(self,group):
        return self.root/'batches'/(self.binding(group)+'.json')

    def load(self,group):
        path=self.path(group)
        if not path.exists():return None
        try:
            row=json.loads(path.read_text())
            if row['source_sha256']!=self.binding(group) or row['payload_sha256']!=digest(row['payload']):return None
            if not isinstance(row['payload'].get('items'),list):return None
            return row
        except (ValueError,KeyError,TypeError):return None

    def completed(self,group):
        return self.load(group) is not None

    def save(self,group,payload):
        atomic(self.path(group),{'source_sha256':self.binding(group),'payload':payload,
            'payload_sha256':digest(payload),'verified':False})
        self.register_group(group)

    def register_group(self,group):
        """Keep the exact source-bound group; ranking is not a cache identity."""
        if self.load(group) is None:
            raise ValueError('SOURCE_GROUP_HAS_NO_VALID_EXTRACTION')
        key=self.binding(group)
        atomic(self.root/'groups'/(key+'.json'),
               {'source_sha256':key,'source_group':group,'verified':False})

    def source_binding(self,record):
        # These fields are reading/prompt metadata, not acquired evidence.
        # Text, offsets, source checksums, bibliography and window identity
        # must still match the CURRENT source-validated collection exactly.
        return self.binding([{k:v for k,v in record.items()
                              if k not in ('sampling_features','screening','model_view')}])

    def replay_groups(self,records):
        current={r['evidence_id']:r for r in records}
        groups=[];holds=[]
        for path in sorted((self.root/'groups').glob('*.json')):
            row=json.loads(path.read_text())
            group=row.get('source_group')
            if not isinstance(group,list) or not group or self.binding(group)!=path.stem or row.get('source_sha256')!=path.stem:
                raise ValueError('INVALID_SOURCE_GROUP_BINDING')
            if self.load(group) is None:
                raise ValueError('INVALID_SOURCE_GROUP_EXTRACTION')
            if any(r.get('evidence_id') not in current or
                   self.source_binding(r)!=self.source_binding(current[r['evidence_id']]) for r in group):
                holds.append({'source_sha256':path.stem,'reason':'CURRENT_SOURCE_OR_SELECTION_CHANGED'})
                continue
            groups.append(group)
        return groups,holds

    def receipt(self,group):
        # A later model repair can replace the current batch payload. Preserve
        # the exact replay input before that happens, rather than invalidating
        # the answer's own provenance by pointing at the mutable current batch.
        row=self.load(group)
        snapshot=self.root/'replays'/self.binding(group)/(row['payload_sha256']+'.json')
        if not snapshot.exists():atomic(snapshot,row)
        return {'batch_path':str(snapshot),'source_sha256':self.binding(group),
                'payload_sha256':row['payload_sha256'],
                'historical_verification':False}

    def response_load(self,key):
        path=self.root/'responses'/(key+'.json')
        if not path.exists():return None
        try:
            row=json.loads(path.read_text())
            if digest(row['result'])!=row['result_sha256']:return None
            return row
        except (ValueError,KeyError,TypeError):return None

    def response_save(self,key,result):
        atomic(self.root/'responses'/(key+'.json'),{
            'result':result,'result_sha256':digest(result),'verified':False})

    def pending(self,phase):
        path=self.root/'queue.json'
        value=json.loads(path.read_text())
        atomic(path,{**value,'status':'PENDING','phase':phase})

    def inventory(self,records,selected,deferred,filtered=()):
        pending={r['evidence_id']:r['reason'] for r in deferred}
        completed={r['evidence_id'] for group in selected if self.completed(group) for r in group}
        atomic(self.root/'queue.json',{'schema':'research-continuation-v1',
            'status':'COMPLETE' if len(completed)==len(records) else ('BLOCKED' if pending and all(v=='PARAGRAPH_EXCEEDS_MODEL_BATCH' for v in pending.values()) else 'PENDING'),
            'total':len(records),'completed':len(completed),
            'items':[{'evidence_id':r['evidence_id'],'source_sha256':digest(r),
                'status':'EXAMINED' if r['evidence_id'] in completed else 'PENDING',
                'reason':pending.get(r['evidence_id'],'AWAITING_EXTRACTION') if r['evidence_id'] not in completed else None}
                for r in records]+[
                # Pre-filtered excerpts (excerpt_prefilter.py): listed, not
                # counted in total, never deleted; re-includable by env.
                {'evidence_id':f['evidence_id'],'status':'FILTERED','reason':f['status'],'detail':f.get('detail')}
                for f in filtered],
            'filtered':len(filtered)})
        atomic(self.root.parent/'active.json',{'queue':self.root.name+'/queue.json'})


def latest_analysis(root):
    """Load only a source-bound continuation published inside its parent run."""
    root=Path(root).resolve()
    try:
        pointer=json.loads((root/'research_continuation/latest.json').read_text())
        directory=(root/pointer['analysis_path']).resolve()
        if not directory.is_relative_to(root) or not re.fullmatch(r'semantic_reanalysis_[0-9]+',directory.name):return None
        answer=(directory/'research_answer/answer.json').read_bytes()
        validation=(directory/'research_answer/validation_report.json').read_bytes()
        if hashlib.sha256(answer).hexdigest()!=pointer['answer_sha256']:return None
        if hashlib.sha256(validation).hexdigest()!=pointer['validation_sha256']:return None
        return json.loads(answer),json.loads(validation)
    except (OSError,ValueError,KeyError,TypeError):return None


def effective_citation_backlogs(root):
    """Continuation receipts supersede the copied lane, without rewriting it."""
    root=Path(root)
    for lane in sorted(root.iterdir()):
        if not lane.is_dir() or lane.name.startswith('citation_continuation_'):continue
        original=lane/'library_acquisition/cited_work_continuation.json'
        continued=root/('citation_continuation_'+lane.name)/'library_acquisition/cited_work_continuation.json'
        selected=continued if continued.is_file() else original
        if selected.is_file():yield selected

