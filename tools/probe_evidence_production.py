"""Persist actual production HTTP results without tokens, documents or response bodies."""
import hashlib
import datetime
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request


def request(url, method='GET', body=None, headers=None):
    try:
        req=urllib.request.Request(url,data=body,method=method,headers=headers or {})
        try:response=urllib.request.urlopen(req,timeout=20)
        except urllib.error.HTTPError as exc:response=exc
        with response:
            raw=response.read(1_000_000)
            receipt={'http_status':response.code,'response_sha256':hashlib.sha256(raw).hexdigest()}
            try:return receipt,json.loads(raw)
            except ValueError:return receipt,{}
    except (OSError,ValueError):return {'http_status':None,'error':'NETWORK_OR_PROTOCOL_FAILURE'},{}


from production_acceptance import acceptance

def main():
    base='https://pct-live.piratecartography.com/pct-api/live'
    report={'schema':'nabou-production-evidence-smoke-v2','run_id':os.environ['GITHUB_RUN_ID'],
            'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'source_revision':os.environ['GITHUB_SHA'],'base_url':base,'checks':[]}
    # The repository also contains an older www production gate. Observe both
    # public routes without credentials before attributing404 to deployment.
    # An alias returning a web page is not proof of a working research API.
    report['public_route_observations']=[]
    for origin in ('https://pct-live.piratecartography.com',
                   'https://www.piratecartography.com','https://piratecartography.com'):
        for endpoint in ('/health','/knowledge/evidence?source_id=src-fake'):
            result,data=request(origin+'/pct-api/live'+endpoint)
            report['public_route_observations'].append({'origin':origin,'endpoint':endpoint,
                **result,'response_schema':data.get('schema') if isinstance(data,dict) else None,
                'reported_health_status':data.get('status') if endpoint=='/health' and isinstance(data,dict) else None,
                'reported_backend_revision':str(data.get('revision',''))[:120] if endpoint=='/health' and isinstance(data,dict) else None,
                'credentials_sent':False,'method':'GET'})
    for method,endpoint in [('GET','/knowledge/evidence?source_id=src-fake'),
                            ('POST','/knowledge/upload'),('POST','/knowledge/review')]:
        result,_=request(base+endpoint,method,b'{}' if method=='POST' else None,{'Content-Type':'application/json'})
        report['checks'].append({'method':method,'endpoint':endpoint,'expected_http':401,
                                 **result,'passed':result['http_status']==401})
    oidc={'method':'POST','endpoint':'/knowledge/agent-search','expected_http':200,'passed':False}
    parts=urllib.parse.urlsplit(os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'])
    params=[(k,v) for k,v in urllib.parse.parse_qsl(parts.query) if k!='audience']
    params.append(('audience','piratecartography-command-center'))
    uri=urllib.parse.urlunsplit((parts.scheme,parts.netloc,parts.path,urllib.parse.urlencode(params),parts.fragment))
    token_receipt,value=request(uri,headers={'Authorization':'Bearer '+os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    if token_receipt['http_status']==200 and value.get('value'):
        # Deliberately invalid event schema: verify the existing OIDC gate
        # without adding an event or changing the live research mission.
        auth_receipt,auth_body=request(base+'/events','POST',
            json.dumps({'project':'piratecartography','schema':'nabou-auth-diagnostic-invalid-event'}).encode(),
            {'Authorization':'Bearer '+value['value'],'Content-Type':'application/json'})
        known_errors={'invalid_event','invalid_token','invalid_alg','invalid_issuer_or_audience',
                      'expired_or_not_yet_valid','wrong_repository','wrong_ref','unknown_kid',
                      'bad_signature','body_too_large','not_found','missing_oidc'}
        error=auth_body.get('error') if isinstance(auth_body,dict) else None
        report['oidc_event_auth_negative_control']={**auth_receipt,
            'backend_error_code':error if error in known_errors else 'UNCLASSIFIED_ERROR_NOT_RECORDED',
            'expected_http':400,'expected_error':'invalid_event',
            'passed':auth_receipt['http_status']==400 and error=='invalid_event',
            'event_schema_deliberately_invalid':True,'research_event_creation_requested':False}
        result,data=request(base+oidc['endpoint'],'POST',json.dumps({'query':'nabou-production-smoke-no-real-person'}).encode(),
                            {'Authorization':'Bearer '+value['value'],'Content-Type':'application/json'})
        oidc.update(result,passed=result['http_status']==200 and data.get('schema')=='nabou-agent-learning-evidence-v1' and data.get('verified_count')==0)
    else:oidc.update(error='GITHUB_OIDC_TOKEN_NOT_ISSUED',http_status=None)
    report['checks'].append(oidc)
    report.update(acceptance(report))
    dest=Path('evidence/production_smoke')/report['run_id'];dest.mkdir(parents=True)
    (dest/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    if report['status']!='PASS':raise SystemExit(1)


if __name__=='__main__':main()
