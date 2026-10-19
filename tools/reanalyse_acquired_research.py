"""Real model reanalysis of immutable acquired sources, separately from discovery."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
from semantic_research_answer import execute, read, render
from research_geographic_findings import build as geographic
from research_validation_report import build as validate


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run-id',required=True);args=parser.parse_args()
    job=os.environ['GITHUB_RUN_ID']
    if not re.fullmatch(r'\d+',args.run_id) or not re.fullmatch(r'\d+',job):
        raise ValueError('NUMERIC_RUN_IDS_REQUIRED')
    parent=Path('evidence/runs')/args.run_id
    dest=parent/('semantic_reanalysis_'+job)
    dest.mkdir(exist_ok=False)
    manifests=sorted(parent.glob('*/run_manifest/manifest.json'))
    request=read(manifests[0])['normalized_request']
    question=request['target']+' ('+request.get('date_range','')+')'
    receipt={'parent_run_id':args.run_id,'analysis_run_id':job,
             'execution_type':'REAL_MODEL_REANALYSIS_OF_ACQUIRED_SOURCES_NOT_NEW_DISCOVERY',
             'software_revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
             'original_lane_outputs_modified':False}
    (dest/'execution_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    answer=execute(parent,question,output_root=dest)
    answer['execution_receipt']=receipt
    out=dest/'research_answer';out.mkdir(exist_ok=True)
    for filename,value in [('answer.json',answer),('geographic_findings.json',geographic(answer))]:
        (out/filename).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    (out/'answer.md').write_text(render(answer))
    report=validate(parent,analysis_root=dest)
    (out/'validation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'counts':report['counts'],'blockers':report['blockers']}))
    if report['status']=='INCOMPLETE':raise SystemExit(1)


if __name__=='__main__':main()
