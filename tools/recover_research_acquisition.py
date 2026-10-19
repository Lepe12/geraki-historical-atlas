"""Reacquire fresh discovery leads with repaired transports, preserving originals."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from research_relevance import assess,identity

def recover(run_id):
    if not re.fullmatch(r'\d+',run_id):raise ValueError('NUMERIC_PARENT_RUN_REQUIRED')
    repo=Path.cwd();tools=repo/'tools';parent=repo/'evidence/runs'/run_id
    manifests=sorted(parent.glob('*/run_manifest/manifest.json'))
    if not manifests:raise ValueError('PARENT_RESEARCH_REQUEST_NOT_FOUND')
    request=json.loads(manifests[0].read_text())['normalized_request']
    ctx={k:request.get(k,[] if k=='aliases' else '') for k in ('target','aliases','date_range','purpose')}
    ident=identity(request,ctx);selected={}
    for path in parent.glob('*/citation_chase_candidates/repository_candidates.json'):
        for item in json.loads(path.read_text()).get('selected',[]):
            url=str(item.get('digital_url') or item.get('url') or '')
            if not ('/server/api/core/items/' in url or item.get('image_url') or (item.get('fulltext_hit') and '/iiif/image/' in url)):
                continue
            assessment=assess(item,ident)
            if assessment['status']=='PRIORITY':selected[url]={**item,'relevance_assessment':assessment}
    rows=sorted(selected.values(),key=lambda r:(not bool(r.get('fulltext_hit')),-r['relevance_assessment']['research_value']['score']))[:12]
    job=os.getenv('GITHUB_RUN_ID','local')
    dest=parent/('acquisition_recovery_'+job)
    if dest.exists():raise ValueError('RECOVERY_OUTPUT_ALREADY_EXISTS')
    with tempfile.TemporaryDirectory(prefix='nabou-acquisition-recovery-') as temporary:
        work=Path(temporary);(work/'request.json').write_text(json.dumps(request,ensure_ascii=False))
        (work/'citation_chase_candidates').mkdir()
        (work/'citation_chase_candidates/repository_candidates.json').write_text(json.dumps({'selected':rows},ensure_ascii=False))
        env={**os.environ,'PCT_TARGET':'','PCT_REQUEST_FILE':str(work/'request.json'),
             'PCT_RESEARCH_LANE':'acquisition_recovery','PCT_LLM_PROVIDER':'disabled',
             'PCT_MAX_ACQUISITION_CANDIDATES':'12','PCT_ACQUISITION_BATCHES':'1',
             'PCT_ACQUISITION_BUDGET_SECONDS':'240','PCT_CITATION_QUERY_LIMIT':'1',
             'PYTHONPATH':str(tools)+':'+str(tools/'orchestrator')}
        for script in ('acquire_library_candidate.py','event_first_search.py','run_manifest.py'):
            subprocess.run(['python3',str(tools/script)],cwd=work,env=env,check=True)
        dest.mkdir(parents=True)
        for folder in ('library_acquisition','structured_output','research_dossier','event_first_hits','run_manifest'):
            if (work/folder).exists():shutil.copytree(work/folder,dest/folder)
        receipt={'schema':'nabou-acquisition-recovery-v1','parent_research_run_id':run_id,
                 'execution_run_id':job,'type':'REACQUISITION_FROM_FRESH_DISCOVERY_NOT_NEW_BLIND_SEARCH',
                 'candidate_count':len(rows),'selection_limit':12,
                 'source_revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
                 'original_lane_outputs_modified':False}
        (dest/'recovery_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
        print(json.dumps(receipt))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--run-id',required=True);args=parser.parse_args();recover(args.run_id)
