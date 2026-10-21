"""Evaluate saved production reports offline; no HTTP, tokens or mutations."""
import argparse
import json
from pathlib import Path

def acceptance(report):
    technical=all(c.get('passed') for c in report.get('checks',[])) and bool(report.get('checks'))
    auth=report.get('oidc_event_auth_negative_control',{}).get('passed',False)
    observations=report.get('public_route_observations',[])
    public=bool(observations) and all(
        (row.get('http_status')==200 and row.get('reported_health_status')=='PASS' if row.get('endpoint')=='/health' else row.get('http_status')==401)
        for row in observations)
    return {'technical_status':'PASS' if technical and auth else 'FAILED',
            'public_status':'PASS' if public else 'FAILED',
            'status':'PASS' if technical and auth and public else 'BLOCKED_PRODUCTION_ACCEPTANCE'}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('report');args=parser.parse_args()
    result=acceptance(json.loads(Path(args.report).read_text()))
    print(json.dumps(result))
    if result['status']!='PASS':raise SystemExit(1)
