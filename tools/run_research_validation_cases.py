"""Dispatch declared research-workflow inputs and record actual four-case outcomes.

Runs inside authorized GitHub Actions. Unit/CI success is not research acceptance.
No ground-truth accuracy is invented when independent annotations are unavailable.
"""
import datetime
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

REPO='Lepe12/geraki-historical-atlas'
WORKFLOW='pct-parallel-multi-agent.yml'


def api(method,path,data=None):
    req=urllib.request.Request('https://api.github.com/repos/'+REPO+path,
        data=json.dumps(data).encode() if data is not None else None,method=method,
        headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json',
                 'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'NABOU-e2e-case-validation'})
    try:
        with urllib.request.urlopen(req,timeout=30) as response:
            raw=response.read();return response.status,json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raise RuntimeError('GITHUB_API_HTTP_'+str(exc.code)) from None


def checkpoint(dest,report):
    (dest/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')


def collect_result(dest,row):
    directory=dest/row['case_id'];directory.mkdir(exist_ok=True)
    env={**os.environ,'GH_TOKEN':os.environ['GITHUB_TOKEN']}
    result=subprocess.run(['gh','run','download',str(row['run_id']),'--repo',REPO,
                           '--name','research-semantic-answer-'+str(row['run_id']),'--dir',str(directory)],
                          env=env,capture_output=True,timeout=120)
    if result.returncode:return {'status':'RESEARCH_ARTIFACT_UNAVAILABLE','workflow_conclusion':row['workflow_conclusion']}
    reports=list(directory.rglob('validation_report.json'))
    if len(reports)!=1:return {'status':'RESEARCH_VALIDATION_REPORT_MISSING'}
    validation=json.loads(reports[0].read_text())
    return {'status':validation.get('status'),'counts':validation.get('counts'),
            'blockers':validation.get('blockers'),'semantic_calls':validation.get('semantic_calls',[]),
            'validation_report':str(reports[0]),'independent_accuracy_metrics':{
                'entity_resolution_precision':None,'entity_resolution_recall':None,'false_identity_merges':None,
                'citation_fidelity':None,'ocr_character_error_rate':None,
                'reason':'INDEPENDENT_GOLD_ANNOTATIONS_NOT_AVAILABLE; NO_AUTOMERGE_IS_A_POLICY_NOT_AN_ACCURACY_SCORE'}}


def main():
    if os.environ.get('GITHUB_REF')!='refs/heads/main':raise ValueError('MAIN_BRANCH_AUTHORIZED_DISPATCH_ONLY')
    job=os.environ['GITHUB_RUN_ID'];dest=Path('evidence/validation_cases')/job;dest.mkdir(parents=True)
    cases=json.loads(Path('docs/validation/historical-research-cases.json').read_text())['cases']
    policy=json.loads(Path('tools/orchestrator/jarvis_policy.json').read_text())['dispatch']
    if policy.get('kill_switch') or not policy.get('dispatch_enabled'):raise ValueError('RESEARCH_DISPATCH_DISABLED')
    lanes=policy['allowed_agents']
    report={'schema':'nabou-real-four-case-validation-v1','coordinator_run_id':job,'status':'RUNNING',
            'generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'coordinator_source_revision':os.environ.get('GITHUB_SHA'),
            'cases':[],'production_database_validation':'SEPARATE_NOT_IMPLIED',
            'independent_gold_status':'NOT_AVAILABLE; ACCURACY_AND_EXHAUSTIVE_RECALL_NOT_CLAIMED'}
    checkpoint(dest,report)
    for case in cases:
        request_id='validation-'+job+'-'+case['case_id']
        inputs={'request_id':request_id,'target':case['target'],'aliases':'|'.join(case['aliases']),
                'date_range':case['date_range'],'purpose':case['purpose'],'selected_agents':','.join(lanes),
                'require_semantic_analysis':'true'}
        status,_=api('POST','/actions/workflows/'+WORKFLOW+'/dispatches',{'ref':'main','inputs':inputs})
        report['cases'].append({'case_id':case['case_id'],'request_id':request_id,'inputs':inputs,
                                'dispatch_http':status,'status':'DISPATCH_ACCEPTED_NOT_EXECUTION_PROOF'})
        checkpoint(dest,report)
    deadline=time.monotonic()+75*60
    while time.monotonic()<deadline:
        _,data=api('GET','/actions/workflows/'+WORKFLOW+'/runs?event=workflow_dispatch&branch=main&per_page=100')
        runs={r['display_title']:r for r in data['workflow_runs']}
        for row in report['cases']:
            run=runs.get('Research '+row['request_id'])
            if not run:continue
            row.update(run_id=run['id'],run_url=run['html_url'],status=run['status'],workflow_conclusion=run['conclusion'])
            if run['status']=='completed' and 'research_result' not in row:
                row['research_result']=collect_result(dest,row)
        checkpoint(dest,report)
        if all('research_result' in row for row in report['cases']):break
        time.sleep(30)
    passed=all(row.get('research_result',{}).get('status')=='PROVISIONAL_RESEARCH_PIPELINE_PASSED' for row in report['cases'])
    report['status']='PROVISIONAL_PIPELINES_PASSED_ACCURACY_UNMEASURED' if passed else 'INCOMPLETE_RESEARCH_VALIDATION'
    checkpoint(dest,report);print(json.dumps({'status':report['status'],'cases':[{k:r.get(k) for k in ('case_id','run_id','status','workflow_conclusion','research_result')} for r in report['cases']]},ensure_ascii=False))
    if not passed:raise SystemExit(1)


if __name__=='__main__':
    try:main()
    except Exception as exc:
        destination=Path('evidence/validation_cases')/os.environ.get('GITHUB_RUN_ID','local')
        destination.mkdir(parents=True,exist_ok=True)
        file=destination/'report.json'
        value=json.loads(file.read_text()) if file.exists() else {'schema':'nabou-real-four-case-validation-v1'}
        value.update(status='BLOCKED_COORDINATOR',blocker=str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__)
        checkpoint(destination,value)
        raise SystemExit(value['blocker'])

