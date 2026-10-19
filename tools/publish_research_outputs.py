"""Publish only the output delta onto current main, without merging code history.

Uses a separate Git index. A rejected push rebuilds the tree on the new main.
The runner checkout and concurrent writers' unrelated files are preserved.
"""
import json,os,subprocess,tempfile
from pathlib import Path,PurePosixPath
from research_execution_policy import from_environment

ALLOWED=('evidence/','command-center/live/','mariadb_storage_queue/','storage_queue/','jarvis_escalation_requests/')

def git(*args,env=None,input=None):
    return subprocess.check_output(['git',*args],env=env,input=input,stderr=subprocess.PIPE)

def shared_output(path,incoming,parent):
    """Preserve a newer live run and merge history when research jobs overlap."""
    if path not in ('command-center/live/latest.json','command-center/live/index.json'):return incoming
    try:current=json.loads(git('show',parent+':'+path))
    except subprocess.CalledProcessError:return incoming
    proposed=json.loads(git('cat-file','blob',incoming))
    if path.endswith('/latest.json'):
        old,new=str(current.get('run_id','')),str(proposed.get('run_id',''))
        return None if old.isdigit() and new.isdigit() and int(old)>int(new) else incoming
    runs={str(r['run_id']):r for r in current.get('runs',[])}
    for row in proposed.get('runs',[]):
        key=str(row['run_id']);previous=runs.get(key,{})
        if str(row.get('generated_utc',''))>=str(previous.get('generated_utc','')):runs[key]=row
    merged={**current,**proposed,'runs':sorted(runs.values(),key=lambda r:int(r['run_id']) if str(r['run_id']).isdigit() else 0,reverse=True)}
    return git('hash-object','-w','--stdin',input=(json.dumps(merged,ensure_ascii=False,indent=2)+'\n').encode()).decode().strip()

def publish(attempts=5):
    if not from_environment()['production_writes_allowed']:
        raise ValueError('EXPERIMENT_PRODUCTION_WRITE_FORBIDDEN')
    # Call after creating the output commit. No branch history is replayed.
    rows=git('diff-tree','--no-commit-id','--name-status','-r','--no-renames','HEAD').decode().splitlines()
    changes=[]
    for row in rows:
        status,path=row.split('\t',1)
        if status not in ('A','M') or not path.startswith(ALLOWED) or '..' in PurePosixPath(path).parts:
            raise ValueError('NON_OUTPUT_CHANGE_FORBIDDEN:'+path)
        mode,kind,oid=git('ls-tree','HEAD','--',path).decode().split('\t')[0].split()
        if mode!='100644' or kind!='blob':raise ValueError('REGULAR_OUTPUT_FILES_ONLY')
        changes.append((path,mode,oid))
    if not changes:raise ValueError('NO_OUTPUT_COMMIT')
    for attempt in range(attempts):
        git('fetch','--quiet','origin','main')
        parent=git('rev-parse','refs/remotes/origin/main').decode().strip()
        with tempfile.TemporaryDirectory(prefix='nabou-publisher-') as temporary:
            env={**os.environ,'GIT_INDEX_FILE':str(Path(temporary)/'index')}
            git('read-tree',parent,env=env)
            applied=[]
            for path,mode,oid in changes:
                resolved=shared_output(path,oid,parent)
                if resolved is None:continue
                applied.append((path,mode,resolved))
                git('update-index','--add','--cacheinfo',mode,resolved,path,env=env)
            tree=git('write-tree',env=env).decode().strip()
        if tree==git('rev-parse',parent+'^{tree}').decode().strip():
            commit=parent
        else:
            commit=git('commit-tree',tree,'-p',parent,'-m','Publish research outputs '+os.getenv('GITHUB_RUN_ID','local')).decode().strip()
            pushed=subprocess.run(['git','push','origin',commit+':refs/heads/main'],capture_output=True)
            if pushed.returncode:continue
        # Read back the published object identity for every file.
        git('fetch','--quiet','origin','main')
        head=git('rev-parse','refs/remotes/origin/main').decode().strip()
        for path,mode,oid in applied:
            actual=git('rev-parse',head+':'+path).decode().strip()
            if actual!=oid:
                if path=='command-center/live/latest.json':
                    a=json.loads(git('cat-file','blob',actual));b=json.loads(git('cat-file','blob',oid))
                    if str(a.get('run_id','')).isdigit() and str(b.get('run_id','')).isdigit() and int(a['run_id'])>int(b['run_id']):continue
                if path=='command-center/live/index.json':
                    a=json.loads(git('cat-file','blob',actual));b=json.loads(git('cat-file','blob',oid))
                    if {str(r['run_id']) for r in b.get('runs',[])}<={str(r['run_id']) for r in a.get('runs',[])}:continue
                raise ValueError('PUBLICATION_READBACK_MISMATCH:'+path)
        receipt={'status':'SUCCEEDED','commit':commit,'readback_commit':head,'files':len(applied),'retained_newer_shared_outputs':len(changes)-len(applied),'attempts':attempt+1,'run_id':os.getenv('GITHUB_RUN_ID','')}
        Path('publication_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
        print(json.dumps(receipt));return receipt
    raise RuntimeError('PUBLICATION_REJECTED_AFTER_RETRIES')

if __name__=='__main__':publish()
