"""Measured single-runner vs four-runner use of the existing engine on public OCR."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import tarfile
import time
from research_continuation import atomic,digest
from first_pass_semantics import file_hash,question_of,read_shard,unpack

FIXTURE=Path('data/research_benchmarks/first_pass_speed.json')


def fixture():
    raw=FIXTURE.read_bytes();value=json.loads(raw)
    if value['schema']!='first-pass-speed-sample-v1' or len(value['records'])!=4:raise ValueError('INVALID_SPEED_SAMPLE')
    for row in value['records']:
        if digest(row['record'])!=row['record_sha256']:raise ValueError('SAMPLE_RECORD_CHECKSUM_MISMATCH')
    return value,hashlib.sha256(raw).hexdigest()


def workspace(repo,run):
    from first_pass_semantics import root_of
    return root_of(repo,run)


def prepare(repo,run,output):
    data,sha=fixture();root=workspace(repo,run);lane=root/'travellers'
    (lane/'library_acquisition').mkdir(parents=True,exist_ok=True)
    findings=[];derivations=[]
    for i,row in enumerate(data['records']):
        record=row['record'];text=record['text'];source=record['occurrences'][0]
        name=f'sonnini-excerpt-{i+1}.txt';path=lane/'library_acquisition'/name;path.write_text(text)
        findings.append({'finding_id':record['evidence_id'],'file':name,'url':source['url'],'title':source['title'],
            'source_bibliography':record['source_bibliography'],'source_text_sha256':file_hash(path),
            'evidence_excerpt':text,'years_in_scope':record.get('years_in_scope',[]),'date_basis':record.get('date_basis'),
            'uncertainties':record.get('uncertainties',[])+['DERIVED_PUBLIC_OCR_EXCERPT_NOT_ORIGINAL_INSPECTION'],
            'locator':{'start_char':0,'end_char':len(text),'start_line':1,'end_line':text.count('\n')+1}})
        derivations.append({'file':name,'sha256':file_hash(path),'parent_record_sha256':row['record_sha256'],
            'parent_run':data['parent_run'],'parent_analysis':data['analysis_run'],
            'parent_source_occurrences':record['occurrences'],'parent_progress_path':row['parent_progress_path'],
            'parent_progress_sha256':row['parent_progress_sha256'],'original_inspected':False})
    atomic(lane/'structured_output/extracted_findings.json',{'findings':findings})
    atomic(lane/'run_manifest/manifest.json',{'normalized_request':data['request']})
    atomic(root/'derivation.json',{'scope':data['scope'],'fixture_sha256':sha,'sources':derivations})
    from semantic_research_answer import execute
    os.environ['PCT_SEMANTIC_WRITE_READING_PLAN']=str(root/'first_pass/reading_plan.json')
    answer=execute(root,question_of(root),config={'configured':False,'missing':['PROBE_PREPARATION_NO_INFERENCE']})
    os.environ.pop('PCT_SEMANTIC_WRITE_READING_PLAN',None)
    if answer['calls'] or answer.get('model_used'):raise ValueError('PREPARATION_CALLED_MODEL')
    if answer['coverage']['unique_passages']!=4 or answer['coverage']['reading_batches']!=4:
        raise ValueError('PROBE_REQUIRES_EXACTLY_FOUR_BATCHES:'+str(answer['coverage']))
    if list((root/'research_continuation').glob('*/batches/*.json')):raise ValueError('PROBE_MUST_START_WITHOUT_MODEL_CACHE')
    output.mkdir(parents=True,exist_ok=True)
    with tarfile.open(output/'seed.tgz','w:gz') as tar:tar.add(root,arcname=f'evidence/runs/{run}')
    atomic(output/'seed.json',{'sha256':file_hash(output/'seed.tgz'),'fixture_sha256':sha,
        'question':question_of(root),'plan_sha256':file_hash(root/'first_pass/reading_plan.json')})


def restore(repo,input_path):
    meta=json.loads((input_path/'seed.json').read_text())
    if file_hash(input_path/'seed.tgz')!=meta['sha256']:raise ValueError('PROBE_INPUT_CHECKSUM_MISMATCH')
    with tarfile.open(input_path/'seed.tgz','r:gz') as tar:
        # The seed is generated from four repository-controlled public OCR
        # records; still reject traversal and links on every receiver.
        for m in tar.getmembers():
            p=Path(m.name)
            if p.is_absolute() or '..' in p.parts or not (m.isfile() or m.isdir()):raise ValueError('UNSAFE_PROBE_SEED')
        tar.extractall(repo,filter='data')


def run(mode,repo,run,output,start,index=None,incoming=None):
    from semantic_research_answer import execute,configuration,render
    root=workspace(repo,run);data,sha=fixture()
    if not configuration()['configured']:raise ValueError('REAL_MODEL_EXECUTION_NOT_CONFIGURED')
    os.environ['PCT_SEMANTIC_READING_PLAN']=str(root/'first_pass/reading_plan.json')
    if mode=='read':
        read_shard(repo,run,index,4)
        atomic(root/f'first_pass/shards/shard_{index}/timing.json',{'start':start,'end':time.time(),'cpu_cache_tag':os.getenv('NABOU_CPU_CACHE_TAG')})
        return
    if mode=='merge':
        summary=unpack(repo,run,4,incoming)
        if summary['missing_shards'] or summary['transport_missing']:raise ValueError('INCOMPLETE_PROBE_SHARDS')
        os.environ['PCT_SEMANTIC_MERGE']='1';os.environ['PCT_SEMANTIC_SHARD']=''
        starts=[json.loads(p.read_text())['start'] for p in (root/'first_pass/shards').glob('shard_*/timing.json')]
        start=min(starts)
    else:
        os.environ['PCT_SEMANTIC_MERGE']='0';os.environ['PCT_SEMANTIC_SHARD']=''
    answer=execute(root,question_of(root))
    ended=time.time()
    calls=list(answer['calls'])
    if mode=='merge':
        for p in (root/'first_pass/shards').glob('shard_*/research_answer/answer.json'):
            calls+=json.loads(p.read_text()).get('calls',[])
    quality={'all_four_excerpts_examined':answer['research_funnel']['examined']['remaining']==0 and len(answer['evidence'])==4,
             'reviewed_answer_present':bool(answer['answer_sections']) and answer['status']=='MODEL_ANSWER_PENDING_HUMAN_REVIEW',
             'merge_performed_no_new_extraction':mode!='merge' or not any(c['role']=='evidence_extractor' and not c.get('replayed') for c in answer['calls'])}
    output.mkdir(parents=True,exist_ok=True)
    atomic(output/'answer.json',answer);(output/'answer.md').write_text(render(answer))
    report={'schema':'first-pass-speed-result-v1','profile':'parallel' if mode=='merge' else 'serial',
            'fixture_sha256':sha,'question':question_of(root),'plan_sha256':file_hash(root/'first_pass/reading_plan.json'),
            'start':start,'end':ended,'elapsed_seconds':round(ended-start,2),'quality':quality,
            'cpu_cache_tag':os.getenv('NABOU_CPU_CACHE_TAG'),'runtime_setup_included':True,'new_source_discovery':False,
            'new_model_calls':sum(not c.get('replayed') for c in calls),
            'new_extraction_calls':sum(c['role']=='evidence_extractor' and not c.get('replayed') for c in calls),
            'claims':len(answer['claims']),'paragraphs':len(answer['answer_sections']),
            'status':answer['status'],'historical_verified':False}
    atomic(output/'timing.json',report)
    with tarfile.open(output/'workspace.tgz','w:gz') as tar:tar.add(root,arcname=f'evidence/runs/{run}')
    print(json.dumps(report,ensure_ascii=False),flush=True)


def compare(incoming,output):
    values=[json.loads(p.read_text()) for p in incoming.glob('*/timing.json')]
    by_profile={v['profile']:v for v in values}
    if set(by_profile)!={'serial','parallel'} or len(values)!=2:raise ValueError('PROBE_RESULTS_MISSING')
    a,b=by_profile['serial'],by_profile['parallel']
    if (a['fixture_sha256'],a['plan_sha256'],a['question'])!=(b['fixture_sha256'],b['plan_sha256'],b['question']):raise ValueError('PROBE_INPUTS_NOT_IDENTICAL')
    ratio=b['elapsed_seconds']/a['elapsed_seconds']
    valid=all(all(v['quality'].values()) for v in values)
    report={'schema':'first-pass-speed-comparison-v1','results':by_profile,'parallel_to_serial_ratio':round(ratio,4),
            'reduction_percent':round((1-ratio)*100,1) if valid else None,'speedup':round(1/ratio,2) if valid else None,
            'both_quality_checks_passed':valid,'measurement_valid':valid,
            'scope':'FOUR_PUBLIC_OCR_EXCERPTS_SAME_QWEN3_8B_INCLUDES_RUNTIME_SETUP_AND_PARALLEL_HANDOFF_NOT_DISCOVERY',
            'historical_verified':False}
    atomic(output/'comparison.json',report)
    print(json.dumps(report,ensure_ascii=False,indent=2))


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('mode',choices=['prepare','restore','serial','read','merge','compare','clock'])
    p.add_argument('--repo',type=Path,default=Path('probe-work'));p.add_argument('--run-id',default=os.getenv('GITHUB_RUN_ID','123'))
    p.add_argument('--output',type=Path);p.add_argument('--input',type=Path);p.add_argument('--incoming',type=Path)
    p.add_argument('--start',type=Path);p.add_argument('--index',type=int)
    a=p.parse_args()
    if a.mode=='clock':atomic(a.output,{'start':time.time()})
    elif a.mode=='prepare':prepare(a.repo,a.run_id,a.output)
    elif a.mode=='restore':restore(a.repo,a.input)
    elif a.mode=='compare':compare(a.incoming,a.output)
    else:run(a.mode,a.repo,a.run_id,a.output,json.loads(a.start.read_text())['start'],a.index,a.incoming)

if __name__=='__main__':main()
