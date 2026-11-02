"""Actual canonical-engine synthesis comparison on retained public-source work."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tarfile
import time
from research_continuation import atomic,digest

PARENT='41437163921'
RESULT='evidence/configuration/'+PARENT+'/first-pass-speed/measured-results/first-pass-speed-result-parallel-'+PARENT


def run(repo,profile,output):
    source=repo/RESULT
    expected=json.loads((source/'answer.json').read_text())
    archive=source/'workspace.tgz'
    target=Path('synthesis-work')
    if target.exists():shutil.rmtree(target)
    target.mkdir()
    with tarfile.open(archive,'r:gz') as tar:
        for m in tar.getmembers():
            p=Path(m.name)
            if p.is_absolute() or '..' in p.parts or not (m.isfile() or m.isdir()) or not m.name.startswith('evidence/runs/'+PARENT):raise ValueError('UNSAFE_SYNTHESIS_SEED')
        tar.extractall(target,filter='data')
    root=target/'evidence/runs'/PARENT
    # Keep extraction and claim-review receipts. Force BOTH profiles to perform
    # real final work: no prior synthesis or final-answer review may be replayed.
    cleared=0
    for p in (root/'research_continuation').glob('*/responses/*.json'):
        value=json.loads(p.read_text());result=value.get('result',{})
        content=result.get('content','')
        if result.get('role')=='synthesis' or 'section_decisions' in content or 'supported_section_indexes' in content:
            p.unlink();cleared+=1
    os.environ.update(PCT_SYNTHESIS_MODE=profile,PCT_SEMANTIC_MERGE='1',PCT_SEMANTIC_SHARD='',
        PCT_SEMANTIC_READING_PLAN=str(root/'first_pass/reading_plan.json'))
    from first_pass_semantics import question_of
    import semantic_research_answer as engine
    if not engine.configuration()['configured']:raise ValueError('REAL_MODEL_REQUIRED')
    started=time.time();answer=engine.execute(root,question_of(root));elapsed=time.time()-started
    actual=[c for c in answer['calls'] if not c.get('replayed')]
    before={c['claim_id']:(c['statement'],c['quote'],c['source_occurrences']) for c in expected['claims']}
    after={c['claim_id']:(c['statement'],c['quote'],c['source_occurrences']) for c in answer['claims']}
    quality={'same_current_validated_claims_and_provenance':before==after,
        'all_four_sources_examined':answer['research_funnel']['examined']['remaining']==0 and len(answer['evidence'])==4,
        'reviewed_answer_present':answer['status']=='MODEL_ANSWER_PENDING_HUMAN_REVIEW' and bool(answer['answer_sections']),
        'real_final_review':any(c['role']=='adversarial_reviewer' for c in actual),
        'no_new_extraction':not any(c['role']=='evidence_extractor' for c in actual),
        'no_new_claim_review':answer['coverage']['new_claim_review_calls']==0}
    if profile=='reviewed_claims':quality['no_rewrite_call']=not any(c['role']=='synthesis' for c in actual)
    report={'profile':profile,'elapsed_seconds':round(elapsed,2),'quality':quality,
        'new_calls':[{'role':c['role'],'elapsed_seconds':c.get('elapsed_seconds'),'usage':c.get('usage')} for c in actual],
        'input_archive_sha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest(),
        'validated_claims_sha256':digest(before),'cpu_cache_tag':os.getenv('NABOU_CPU_CACHE_TAG'),
        'runtime_setup_included':False,'reading_reused':True,'historical_verified':False,
        'cleared_final_response_cache_entries':cleared}
    output.mkdir(parents=True,exist_ok=True)
    atomic(output/'timing.json',report);atomic(output/'answer.json',answer)
    (output/'answer.md').write_text(engine.render(answer))
    # Preserve prompts and raw model responses, including the unchanged final
    # review protocol, for independent inspection of this actual execution.
    shutil.copytree(root/'research_answer/model_responses',output/'model_responses',dirs_exist_ok=True)
    if profile=='reviewed_claims':
        # Negative control: same real final-review prompt and original quotations,
        # but one paragraph asserts an invented dated pirate base.
        prompts=[root/'research_answer'/c['prompt_file'] for c in actual if c['role']=='adversarial_reviewer']
        prompt=prompts[-1].read_text();prefix,raw=prompt.split('FINAL_ANSWER_JSON:\n',1);payload=json.loads(raw)
        payload['sections']=payload['sections'][:1]
        invented=' In 1644 pirates established a permanent base on Argentiera.'
        payload['sections'][0]['text']+=invented
        import research_response_schema as schemas
        from llm_client import call
        control_prompt=prefix+'FINAL_ANSWER_JSON:\n'+json.dumps(payload,ensure_ascii=False)
        result=call('adversarial_reviewer',control_prompt,response_schema=schemas.final_review(1))
        review=engine.normalize_final_review(engine.parse(result),payload['sections'])
        passed=bool(review and 0 not in review['supported_section_indexes'] and review['flagged_sections'])
        atomic(output/'negative-control.json',{'passed':passed,'invented_span':invented,'review':review,'response':result,'historical_verified':False})
        (output/'negative-control.prompt.txt').write_text(control_prompt)
    print(json.dumps(report),flush=True)


def compare(incoming,output):
    values={v['profile']:v for p in incoming.glob('*/timing.json') for v in [json.loads(p.read_text())]}
    a,b=values['model'],values['reviewed_claims']
    control=json.loads(next(incoming.glob('*/negative-control.json')).read_text())
    same=all(a[k]==b[k] for k in ('input_archive_sha256','validated_claims_sha256','cpu_cache_tag'))
    valid=same and control['passed'] and all(all(v['quality'].values()) for v in values.values())
    ratio=b['elapsed_seconds']/a['elapsed_seconds']
    atomic(output/'comparison.json',{'schema':'reviewed-claim-synthesis-speed-v1','results':values,
        'same_inputs_and_cpu':same,'negative_control_passed':control['passed'],'measurement_valid':valid,
        'reduction_percent':round((1-ratio)*100,1) if valid else None,'speedup':round(1/ratio,2) if valid else None,
        'scope':'SYNTHESIS_AND_FINAL_REVIEW_ONLY_READING_REUSED_SETUP_EXCLUDED','historical_verified':False})


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['run','compare']);p.add_argument('--repo',type=Path,default=Path('.'))
    p.add_argument('--profile',choices=['model','reviewed_claims']);p.add_argument('--output',type=Path,required=True);p.add_argument('--incoming',type=Path)
    a=p.parse_args()
    if a.mode=='run':run(a.repo,a.profile,a.output)
    else:compare(a.incoming,a.output)
