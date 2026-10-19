"""Resolve one structured question and execution policy before any source calls."""
import argparse,hashlib,json,os,re,sys
from pathlib import Path
from research_execution_policy import from_environment
from research_stage import record
from request_context import load_request
from request_identity import write_identity
from orchestrator.research_query import split_research_query

INSTRUCTION=re.compile(r'^(?:investigate|assess|determine whether|identify a|evaluate a|given a|reconcile|resolve a|research a|for a contested)\b',re.I)


def validate_question(req):
    target=str(req.get('target') or '').strip();question=str(req.get('purpose') or target).strip()
    if not target:raise ValueError('BLOCKED_INPUT_TARGET_REQUIRED')
    if INSTRUCTION.search(target):
        raise ValueError('BLOCKED_INPUT_INSTRUCTION_USED_AS_TARGET')
    if not question:raise ValueError('BLOCKED_INPUT_QUESTION_REQUIRED')
    return req


def validate_case(case):
    if not case.get('execution_ready'):raise ValueError('BLOCKED_INPUT:'+str(case.get('blocked_reason') or 'CASE_NOT_BOUND'))
    validate_question(case)
    if not case.get('acceptance_checks'):raise ValueError('BLOCKED_INPUT_ACCEPTANCE_CHECKS_REQUIRED')
    for material in case.get('required_materials') or []:
        if not material.get('identifier'):raise ValueError('BLOCKED_INPUT_MATERIAL_IDENTIFIER_REQUIRED')
    return case


def prepare(require_semantic=False,case_id='',case_file='config/research-baseline-v2.json'):
    policy=from_environment();record('execution_receipts','prepare','policy','SUCCEEDED',policy=policy)
    _,req,ctx=load_request()
    target,dates,purpose=split_research_query(ctx['target'],ctx['date_range'],ctx['purpose'])
    normalized={**req,'target':target,'aliases':ctx['aliases'],'date_range':dates,'purpose':purpose}
    validate_question(normalized)
    if os.getenv('PCT_SEMANTIC_QUERY_EXPANSION')=='1':
        from research_semantic_queries import expand
        normalized['semantic_query_expansion']=expand(normalized)
    case=None
    if case_id:
        registry=json.loads(Path(case_file).read_text());case=next((c for c in registry['cases'] if c['id']==case_id),None)
        if not case:raise ValueError('BLOCKED_INPUT_UNKNOWN_CASE')
        validate_case(case)
        if any(normalized.get(k)!=case.get(k,[] if k=='aliases' else '') for k in ('target','aliases','date_range','purpose')):
            raise ValueError('BLOCKED_INPUT_CASE_BINDING_MISMATCH')
        normalized.update({k:case[k] for k in ('target_context',) if case.get(k)})
        record('execution_receipts','prepare','case_binding','SUCCEEDED',case_id=case_id,
               case_file_sha256=hashlib.sha256(Path(case_file).read_bytes()).hexdigest(),
               independent_evaluation_ready=case.get('independent_evaluation_ready',False))
    Path('resolved_research_request.json').write_text(json.dumps(normalized,ensure_ascii=False,indent=2)+'\n')
    os.environ['PCT_TARGET']='';os.environ['PCT_REQUEST_FILE']='resolved_research_request.json'
    identity=write_identity()
    record('execution_receipts','prepare','input','SUCCEEDED',request_sha256=identity['request_sha256'])
    # Names and status only: no credential values or endpoints in receipts.
    from semantic_research_answer import configuration
    config=configuration()
    record('execution_receipts','prepare','semantic_configuration','SUCCEEDED' if config['configured'] else 'BLOCKED',missing=config['missing'])
    if require_semantic and not config['configured']:raise ValueError('BLOCKED_CONFIGURATION_SEMANTIC_MODELS_REQUIRED')
    outputs={**policy,'request_file':'resolved_research_request.json','request_sha256':identity['request_sha256'],
             'research_job_id':identity['research_job_id'],'target':target,'aliases':'|'.join(ctx['aliases']),
             'date_range':dates,'purpose':purpose,'target_type':(normalized.get('target_context') or {}).get('type','auto')}
    destination=os.getenv('GITHUB_OUTPUT')
    if destination:
        with open(destination,'a') as stream:
            for key,value in outputs.items():
                if isinstance(value,(dict,list)):continue
                value=str(value).lower() if isinstance(value,bool) else str(value or '')
                if '\n' in value or '\r' in value:
                    import uuid
                    marker=uuid.uuid4().hex;stream.write(f'{key}<<{marker}\n{value}\n{marker}\n')
                else:stream.write(f'{key}={value}\n')
    Path('execution_policy.json').write_text(json.dumps(policy,indent=2)+'\n')
    return outputs


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--require-semantic',action='store_true');p.add_argument('--case-id',default='');p.add_argument('--case-file',default='config/research-baseline-v2.json');a=p.parse_args()
    try:prepare(a.require_semantic,a.case_id,a.case_file)
    except (ValueError,SystemExit) as error:
        record('execution_receipts','prepare','preflight','BLOCKED',reason=str(error))
        print('RESEARCH_PREFLIGHT_BLOCKED',str(error),file=sys.stderr);sys.exit(1)
