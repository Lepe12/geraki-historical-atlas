"""Execute one stage and preserve its actual exit status, separately from Git/HTTP."""
import argparse,datetime,json,os,re,subprocess,sys
from pathlib import Path
from research_execution_policy import from_environment


def record(root,role,stage,status,**details):
    if not all(re.fullmatch(r'[A-Za-z0-9_.-]+',s) for s in (role,stage)):raise ValueError('UNSAFE_STAGE_IDENTIFIER')
    path=Path(root)/role/(stage+'.json');path.parent.mkdir(parents=True,exist_ok=True)
    data={'schema':'pct-stage-receipt-v1','run_id':os.getenv('GITHUB_RUN_ID'), 'role':role,'stage':stage,
          'status':status,'recorded_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'source_sha':os.getenv('PCT_SOURCE_SHA') or os.getenv('GITHUB_SHA'),**details}
    previous=json.loads(path.read_text()) if path.is_file() else None
    data['previous_attempts']=[*(previous.get('previous_attempts',[]) if previous else []),
                               *([{k:v for k,v in previous.items() if k!='previous_attempts'}] if previous else [])]
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');return data


def execute(root,role,stage,command):
    record(root,role,stage,'RUNNING')
    try:
        result=subprocess.run(command,check=False)
        record(root,role,stage,'SUCCEEDED' if result.returncode==0 else 'FAILED',exit_code=result.returncode)
        return result.returncode
    except BaseException as error:
        record(root,role,stage,'FAILED',error=type(error).__name__)
        raise


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',default='execution_receipts');p.add_argument('--role',default=os.getenv('PCT_RESEARCH_LANE','prepare'))
    p.add_argument('--stage',required=True);p.add_argument('--record',choices=['SUCCEEDED','FAILED','BLOCKED','SKIPPED']);p.add_argument('command',nargs=argparse.REMAINDER)
    a=p.parse_args()
    if a.record:record(a.root,a.role,a.stage,a.record)
    else:
        command=a.command[1:] if a.command[:1]==['--'] else a.command
        if not command:p.error('stage command is required')
        sys.exit(execute(a.root,a.role,a.stage,command))
