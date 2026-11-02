"""Use the existing semantic engine in parallel on the initial research pass."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tarfile
from research_continuation import atomic, digest


def file_hash(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def freeze(path, records, queue, ranking, request=None):
    value={'schema':'initial-semantic-reading-plan-v1','generation':queue.root.name,
           'request_sha256':digest(request or {}),
           'order':[r['evidence_id'] for r in records],
           'sources':{r['evidence_id']:queue.source_binding(r) for r in records},
           'ranking':ranking,'historical_verified':False}
    if len(value['order'])!=len(value['sources']):raise ValueError('DUPLICATE_PLAN_EVIDENCE_ID')
    atomic(path,{**value,'sha256':digest(value)})


def apply_plan(path, records, queue, request=None):
    value=json.loads(Path(path).read_text());checksum=value.pop('sha256')
    if digest(value)!=checksum or value.get('schema')!='initial-semantic-reading-plan-v1':raise ValueError('READING_PLAN_CHECKSUM_MISMATCH')
    current={r['evidence_id']:r for r in records}
    order=value['order']
    if (value['generation']!=queue.root.name or value['request_sha256']!=digest(request or {}) or len(current)!=len(records)
        or len(order)!=len(set(order)) or set(current)!=set(order)
        or {k:queue.source_binding(r) for k,r in current.items()}!=value['sources']):
        raise ValueError('READING_PLAN_SOURCE_OR_CONFIGURATION_CHANGED')
    return [current[k] for k in order],value['ranking']


def root_of(repo, run):
    if not re.fullmatch(r'[0-9]+',str(run)):raise ValueError('NUMERIC_RUN_ID_REQUIRED')
    return Path(repo)/'evidence/runs'/str(run)


def question_of(root):
    from semantic_research_answer import read
    for p in sorted(root.glob('*/run_manifest/manifest.json')):
        request=read(p).get('normalized_request') or {}
        if request.get('target'):
            from reanalyse_acquired_research import question_of as question
            return question(request)
    for p in sorted(root.glob('*/research_dossier/answer.json')):
        value=read(p);question=value.get('question') or value.get('target')
        if question:return question
    return 'Historical research'


def prepare(repo, run, requested):
    root=root_of(repo,run);dest=root/'first_pass';dest.mkdir(parents=True,exist_ok=True)
    if requested not in (1,2,4):raise ValueError('INVALID_INITIAL_SHARD_COUNT')
    shards=requested
    if os.getenv('PCT_EVAL_FAST_MODE')=='true' or os.getenv('PCT_LLM_PROVIDER')=='disabled':shards=1
    if shards>1:
        from semantic_research_answer import execute
        os.environ['PCT_SEMANTIC_WRITE_READING_PLAN']=str(dest/'reading_plan.json')
        try:answer=execute(root,question_of(root),config={'configured':False,'missing':['PLANNING_ONLY_NO_INFERENCE']})
        finally:os.environ.pop('PCT_SEMANTIC_WRITE_READING_PLAN',None)
        if answer.get('model_used') or answer.get('calls'):raise ValueError('PLAN_MUST_NOT_CALL_MODEL')
        # Avoid paying four runtime setups for a tiny or empty corpus.
        batches=answer.get('coverage',{}).get('pending_reading_batches',0)
        shards=1 if batches<2 else min(requested,2 if batches<4 else 4)
    report={'schema':'initial-semantic-execution-v1','run_id':str(run),'requested_shards':requested,
            'shards':shards,'matrix':list(range(shards)) if shards>1 else [],'historical_verified':False}
    atomic(dest/'execution.json',report)
    if os.getenv('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a') as out:
            out.write('shards='+str(shards)+'\nmatrix='+json.dumps(report['matrix'])+'\n')
    return report


def read_shard(repo,run,index,count):
    if not 0<=index<count or count not in (2,4):raise ValueError('INVALID_INITIAL_SHARD')
    root=root_of(repo,run)
    os.environ['PCT_SEMANTIC_SHARD']=f'{index}/{count}'
    os.environ['PCT_SEMANTIC_MERGE']='0'
    os.environ['PCT_SEMANTIC_READING_PLAN']=str(root/'first_pass/reading_plan.json')
    from semantic_research_answer import execute
    from reanalyse_acquired_research import shard_summary
    dest=root/'first_pass/shards'/f'shard_{index}'
    answer=execute(root,question_of(root),output_root=dest,provenance_root=root)
    atomic(dest/'research_answer/answer.json',answer)
    summary=shard_summary(answer,index,count)
    atomic(dest/'shard_summary.json',summary)
    return summary


def allowed(path,run,index):
    prefix=f'evidence/runs/{run}/'
    p=PurePosixPath(path)
    if p.is_absolute() or '..' in p.parts or str(p)!=path:return False
    return bool(path.startswith(prefix+f'first_pass/shards/shard_{index}/') or
                re.fullmatch(re.escape(prefix)+r'research_continuation/[a-f0-9]{64}/(?:batches|groups|responses|replays)/.+\.json',path))


def pack(repo,run,index,count,output):
    repo=Path(repo);root=root_of(repo,run);output=Path(output)
    if not 0<=index<count or count not in (2,4):raise ValueError('INVALID_INITIAL_SHARD')
    output.mkdir(parents=True,exist_ok=True)
    files=sorted(p for base in [root/'research_continuation',root/'first_pass/shards'/f'shard_{index}']
                 for p in base.rglob('*') if p.is_file() and allowed(p.relative_to(repo).as_posix(),run,index))
    if any(p.is_symlink() for p in files):raise ValueError('SHARD_SYMLINK_FORBIDDEN')
    entries=[{'path':p.relative_to(repo).as_posix(),'sha256':file_hash(p),'bytes':p.stat().st_size} for p in files]
    archive=output/'shard.tgz'
    with tarfile.open(archive,'w:gz') as tar:
        for p,e in zip(files,entries):tar.add(p,arcname=e['path'],recursive=False)
    manifest={'schema':'initial-semantic-shard-transport-v1','run_id':str(run),'index':index,'count':count,
              'plan_sha256':file_hash(root/'first_pass/reading_plan.json'),
              'archive_sha256':file_hash(archive),'files':entries}
    atomic(output/'manifest.json',manifest)
    return manifest


def unpack(repo,run,count,incoming):
    repo=Path(repo);root=root_of(repo,run);incoming=Path(incoming)
    if count not in (2,4):raise ValueError('INVALID_INITIAL_SHARD_COUNT')
    plan_sha=file_hash(root/'first_pass/reading_plan.json');loaded=[];seen=set();contents={}
    # Validate all transport bytes before changing the current checkpoint.
    for manifest_file in sorted(incoming.glob('*/manifest.json')):
        m=json.loads(manifest_file.read_text());i=m['index']
        if (m.get('schema')!='initial-semantic-shard-transport-v1' or m['run_id']!=str(run)
            or m['count']!=count or type(i) is not int or not 0<=i<count or i in seen or m['plan_sha256']!=plan_sha):
            raise ValueError('SHARD_TRANSPORT_BINDING_MISMATCH')
        archive=manifest_file.parent/'shard.tgz'
        if file_hash(archive)!=m['archive_sha256']:raise ValueError('SHARD_ARCHIVE_CHECKSUM_MISMATCH')
        entries={e['path']:e for e in m['files']}
        if len(entries)!=len(m['files']):raise ValueError('DUPLICATE_SHARD_FILE')
        with tarfile.open(archive,'r:gz') as tar:
            members=tar.getmembers()
            if len(members)!=len(entries) or {v.name for v in members}!=set(entries):raise ValueError('SHARD_FILE_SET_MISMATCH')
            for member in members:
                if not member.isfile() or not allowed(member.name,run,i):raise ValueError('UNSAFE_SHARD_PATH')
                e=entries[member.name]
                with tar.extractfile(member) as stream:sha=hashlib.file_digest(stream,'sha256').hexdigest()
                if member.size!=e['bytes'] or sha!=e['sha256']:raise ValueError('SHARD_FILE_CHECKSUM_MISMATCH')
                if member.name in contents and contents[member.name]!=sha:raise ValueError('CONFLICTING_SHARD_CHECKPOINT')
                destination=repo/member.name
                if any(p.is_symlink() for p in [destination,*destination.parents]):raise ValueError('SHARD_DESTINATION_SYMLINK')
                if destination.exists() and file_hash(destination)!=sha:raise ValueError('EXISTING_CHECKPOINT_CONFLICT')
                contents[member.name]=sha
        seen.add(i);loaded.append((archive,m))
    for archive,m in loaded:
        with tarfile.open(archive,'r:gz') as tar:
            for e in m['files']:
                destination=repo/e['path'];destination.parent.mkdir(parents=True,exist_ok=True)
                temporary=destination.with_name(destination.name+'.transport-tmp')
                with tar.extractfile(e['path']) as source,temporary.open('wb') as out:
                    import shutil
                    shutil.copyfileobj(source,out)
                if file_hash(temporary)!=e['sha256']:raise ValueError('SHARD_WRITE_READBACK_MISMATCH')
                temporary.replace(destination)
    from reanalyse_acquired_research import merge_summary
    report=merge_summary(root/'first_pass',count)
    report.update(transport_received=sorted(seen),transport_missing=sorted(set(range(count))-seen),plan_sha256=plan_sha)
    atomic(root/'first_pass/merge.json',report)
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('mode',choices=['prepare','read','pack','unpack'])
    p.add_argument('--repo',type=Path,default=Path('.'));p.add_argument('--run-id',required=True)
    p.add_argument('--count',type=int,default=4);p.add_argument('--index',type=int)
    p.add_argument('--output',type=Path);p.add_argument('--incoming',type=Path)
    a=p.parse_args()
    if a.mode=='prepare':result=prepare(a.repo,a.run_id,a.count)
    elif a.mode=='read':result=read_shard(a.repo,a.run_id,a.index,a.count)
    elif a.mode=='pack':result=pack(a.repo,a.run_id,a.index,a.count,a.output)
    else:result=unpack(a.repo,a.run_id,a.count,a.incoming)
    print(json.dumps({k:v for k,v in result.items() if k!='files'},ensure_ascii=False))


if __name__=='__main__':main()
