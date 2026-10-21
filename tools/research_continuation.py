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
        self.root=Path(root)/digest([question,hashlib.sha256(code).hexdigest(),configuration])

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

    def receipt(self,group):
        return {'batch_path':str(self.path(group)),'source_sha256':self.binding(group),
                'payload_sha256':self.load(group)['payload_sha256'],
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

    def inventory(self,records,selected,deferred):
        pending={r['evidence_id']:r['reason'] for r in deferred}
        completed={r['evidence_id'] for group in selected if self.completed(group) for r in group}
        atomic(self.root/'queue.json',{'schema':'research-continuation-v1',
            'status':'COMPLETE' if len(completed)==len(records) else ('BLOCKED' if pending and all(v=='PARAGRAPH_EXCEEDS_MODEL_BATCH' for v in pending.values()) else 'PENDING'),
            'total':len(records),'completed':len(completed),
            'items':[{'evidence_id':r['evidence_id'],'source_sha256':digest(r),
                'status':'EXAMINED' if r['evidence_id'] in completed else 'PENDING',
                'reason':pending.get(r['evidence_id'],'AWAITING_EXTRACTION') if r['evidence_id'] not in completed else None}
                for r in records]})
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
