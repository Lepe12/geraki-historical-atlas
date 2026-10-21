"""Continue bibliography in dedicated copies, preserving original lane artifacts."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess


def advance(parent):
    parent=Path(parent).resolve();tools=Path(__file__).resolve().parent
    for lane in sorted(parent.iterdir()):
        if lane.name.startswith('citation_continuation_'):continue
        manifest=lane/'run_manifest/manifest.json'
        report=lane/'library_acquisition/acquisition_report.json'
        if not manifest.exists() or not report.exists():continue
        source=json.loads(report.read_text())
        if not any(r.get('status')=='TEXT_ACQUIRED' for r in source.get('results',[])):continue
        dest=parent/('citation_continuation_'+lane.name)
        if not dest.exists():
            dest.mkdir()
            for folder in ('library_acquisition','citation_chase_candidates','run_manifest'):
                if (lane/folder).exists():shutil.copytree(lane/folder,dest/folder)
        request=json.loads(manifest.read_text())['normalized_request']
        (dest/'continuation_request.json').write_text(json.dumps(request,ensure_ascii=False))
        env={**os.environ,'PCT_REQUEST_FILE':str(dest/'continuation_request.json'),
             'PCT_TARGET':'','PCT_RESEARCH_LANE':lane.name,'PYTHONPATH':str(tools),
             'PCT_ACQUISITION_BUDGET_SECONDS':'60','PCT_CONTINUE_CITATIONS_ONLY':'1',
             'PCT_CITATION_QUERY_LIMIT':'6'}
        for script in ('acquire_library_candidate.py','event_first_search.py'):
            subprocess.run(['python3',str(tools/script)],cwd=dest,env=env,check=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--run-id',required=True);args=parser.parse_args()
    if not re.fullmatch(r'\d+',args.run_id):raise ValueError('NUMERIC_RUN_ID_REQUIRED')
    advance(Path('evidence/runs')/args.run_id)
