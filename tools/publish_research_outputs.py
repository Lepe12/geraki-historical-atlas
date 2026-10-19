"""Publish only the output delta onto current main, without merging code history.

Uses a separate Git index. A rejected push rebuilds the tree on the new main.
The runner checkout and concurrent writers' unrelated files are preserved.
"""
import json,os,subprocess,tempfile
from pathlib import Path,PurePosixPath
from research_execution_policy import from_environment

ALLOWED=('evidence/','command-center/live/','mariadb_storage_queue/','storage_queue/','jarvis_escalation_requests/')

def git(*args,env=None):
    return subprocess.check_output(['git',*args],env=env,stderr=subprocess.PIPE)

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
            for path,mode,oid in changes:git('update-index','--add','--cacheinfo',mode,oid,path,env=env)
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
        for path,mode,oid in changes:
            if git('rev-parse',head+':'+path).decode().strip()!=oid:
                raise ValueError('PUBLICATION_READBACK_MISMATCH:'+path)
        receipt={'status':'SUCCEEDED','commit':commit,'readback_commit':head,'files':len(changes),'attempts':attempt+1,'run_id':os.getenv('GITHUB_RUN_ID','')}
        Path('publication_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
        print(json.dumps(receipt));return receipt
    raise RuntimeError('PUBLICATION_REJECTED_AFTER_RETRIES')

if __name__=='__main__':publish()
