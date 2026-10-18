"""Local-only shallow/full-history comparison. Never pushes or edits the source repo."""
import argparse,json,subprocess,tempfile
from pathlib import Path


def reproduce(repo,main_ref,experiment_ref):
    repo=Path(repo).resolve();scratch=Path(tempfile.mkdtemp(prefix='nabou-storage-diagnosis-'));remote=scratch/'remote.git'
    def git(cwd,*args,check=True):
        p=subprocess.run(['git','-C',str(cwd),*args],capture_output=True,text=True,timeout=180)
        if check and p.returncode:raise RuntimeError('Git diagnostic failed: '+p.stderr[:500])
        return p
    commits={label:git(repo,'rev-parse',ref).stdout.strip() for label,ref in [('main',main_ref),('experiment',experiment_ref)]}
    git(scratch,'clone','--bare','--shared',str(repo),str(remote))
    for name,commit in commits.items():git(remote,'update-ref','refs/heads/'+name,commit)
    outcomes=[]
    for shallow in (True,False):
        runner=scratch/('shallow' if shallow else 'full')
        if shallow:
            runner.mkdir();git(runner,'init');git(runner,'remote','add','origin',str(remote));git(runner,'fetch','--depth=2','origin','experiment')
            revision='FETCH_HEAD'
        else:
            git(scratch,'clone','--shared','--no-checkout',str(remote),str(runner));revision='origin/experiment'
        git(runner,'config','user.name','Local diagnostic');git(runner,'config','user.email','diagnostic@example.invalid')
        git(runner,'sparse-checkout','init','--no-cone')
        git(runner,'sparse-checkout','set','--no-cone','/data/naboux_memory.json','/data/audit_simulated_evidence.json')
        git(runner,'checkout','--detach',revision)
        file=runner/'data/audit_simulated_evidence.json';file.parent.mkdir(exist_ok=True);file.write_text('{"synthetic_local_diagnostic":true}\n')
        git(runner,'add','data/audit_simulated_evidence.json');git(runner,'commit','-m','Synthetic local evidence')
        result=git(runner,'pull','--rebase','origin','main',check=False)
        conflicts=[l for l in (result.stdout+'\n'+result.stderr).splitlines() if 'CONFLICT' in l or 'Could not apply' in l]
        outcomes.append({'history':'DEPTH_2' if shallow else 'FULL','exit_code':result.returncode,'conflicts':conflicts,
                         'memory_conflict_reproduced':any('naboux_memory.json' in l for l in conflicts)})
        if result.returncode:git(runner,'rebase','--abort',check=False)
    return {'schema':'nabou-local-storage-reproduction-v1','source_commits':commits,'scratch':str(scratch),
            'source_repository_edited':False,'external_network_used':False,'push_performed':False,'outcomes':outcomes}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--repo',default='.');p.add_argument('--main-ref',default='origin/main')
    p.add_argument('--experiment-ref',default='origin/experiment/darwin-nabou');p.add_argument('--output',required=True);a=p.parse_args()
    result=reproduce(a.repo,a.main_ref,a.experiment_ref)
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False,indent=2))
