"""Use explicitly bound SSH credentials for the reviewed existing-host package.

No credential values or remote output are persisted. Missing bindings prevent
any SSH invocation; this does not assert that differently named secrets do not
exist in GitHub.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile

BUNDLE='2ed5af390ca793a501698bc01b286b323aad6141'
REQUIRED=('PCT_PLESK_SSH_HOST','PCT_PLESK_SSH_USER','PCT_PLESK_SSH_PRIVATE_KEY',
          'PCT_PLESK_SSH_KNOWN_HOSTS','PCT_APP_ROOT')

def readiness(env):
    present={name:bool(env.get(name,'').strip()) for name in REQUIRED}
    return {'schema':'nabou-existing-host-deployment-v1','checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'run_id':env.get('GITHUB_RUN_ID'),'bundle_revision':BUNDLE,
            'binding_presence':present,'missing_workflow_bindings':[name for name,yes in present.items() if not yes],
            'scope':'EXPLICIT_DEPLOYMENT_BINDINGS_ONLY_NOT_ALL_GITHUB_SECRET_NAMES',
            'credential_values_recorded':False,'ssh_invoked':False,'production_changed':False,
            'status':'READY_FOR_EXISTING_HOST_PRECHECK' if all(present.values()) else 'BLOCKED_DEPLOYMENT_BINDINGS_NOT_BOUND'}

def execute(env,runner=subprocess.run):
    report=readiness(env)
    if report['missing_workflow_bindings']:return report
    host=env['PCT_PLESK_SSH_HOST'];user=env['PCT_PLESK_SSH_USER'];port=env.get('PCT_PLESK_SSH_PORT','22') or '22'
    if not (re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]*',host) and
            re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.-]*',user) and port.isdigit() and 1<=int(port)<=65535):
        report['status']='BLOCKED_INVALID_SSH_TARGET_CONFIGURATION';return report
    script=Path(__file__).with_name('deploy_nabou_evidence_plesk.sh').read_bytes()
    if ('COMMIT='+BUNDLE).encode() not in script:raise ValueError('DEPLOYMENT_BUNDLE_REVISION_MISMATCH')
    report['deployment_script_sha256']=hashlib.sha256(script).hexdigest()
    with tempfile.TemporaryDirectory(prefix='nabou-reviewed-deployment-') as folder:
        key=Path(folder)/'key';known=Path(folder)/'known_hosts'
        key.write_text(env['PCT_PLESK_SSH_PRIVATE_KEY'].rstrip()+'\n');key.chmod(0o600)
        known.write_text(env['PCT_PLESK_SSH_KNOWN_HOSTS'].rstrip()+'\n');known.chmod(0o600)
        command=['ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
                 '-o','UserKnownHostsFile='+str(known),'-o','ConnectTimeout=20','-p',port,'-i',str(key),
                 user+'@'+host,'env PCT_APP_ROOT='+shlex.quote(env['PCT_APP_ROOT'])+' sh -s']
        report['ssh_invoked']=True
        try:
            result=runner(command,input=script,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=900,check=False)
        except subprocess.TimeoutExpired:
            report.update(status='REMOTE_DEPLOYMENT_TIMED_OUT',production_changed='UNKNOWN_INSPECT_EXISTING_HOST_BACKUP');return report
        except OSError:
            report.update(status='LOCAL_SSH_CLIENT_UNAVAILABLE',ssh_invoked=False,production_changed=False);return report
        report['remote_exit_code']=result.returncode
        if result.returncode==0 and b'PRODUCTION_HTTP_ACCEPTANCE_NOT_YET_VERIFIED' in result.stdout:
            report.update(status='FILES_INSTALLED_RESTART_REQUESTED_HTTP_VALIDATION_REQUIRED',production_changed=True)
        else:
            error=result.stderr.decode('utf-8',errors='replace')
            reason=('SSH_SERVER_IDENTITY_NOT_VERIFIED' if re.search(r'Host key verification failed|REMOTE HOST IDENTIFICATION|No .*host key',error,re.I) else
                    'SSH_AUTHENTICATION_NOT_ACCEPTED' if re.search(r'Permission denied|invalid format|sign_and_send_pubkey',error,re.I) else
                    'SSH_CONNECTION_UNAVAILABLE' if re.search(r'Could not resolve|timed out|Connection refused|No route to host',error,re.I) else
                    'REMOTE_LAYOUT_UNSUPPORTED' if 'unexpected repository/application layout' in error else
                    'REMOTE_PRECHECK_OR_INSTALLATION_FAILED')
            report.update(status=reason,production_changed=False if reason.startswith('SSH_') else 'UNKNOWN_INSPECT_EXISTING_HOST_BACKUP')
    return report

def main():
    report=execute(os.environ)
    dest=Path('evidence/production_deploy')/os.environ['GITHUB_RUN_ID'];dest.mkdir(parents=True,exist_ok=True)
    (dest/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))
    if report['status']!='FILES_INSTALLED_RESTART_REQUESTED_HTTP_VALIDATION_REQUIRED':raise SystemExit(1)

if __name__=='__main__':main()
