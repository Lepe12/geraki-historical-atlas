"""Record the actual existing FTPS deploy outcome; never record login values."""
import datetime
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys

REQUIRED=('PCT_FTPS_HOST','PCT_FTPS_USER','PCT_FTPS_PASSWORD')

def execute(env=None, runner=subprocess.run):
    env=dict(os.environ if env is None else env)
    report={'schema':'nabou-ftps-deployment-v1',
            'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'source_revision':env.get('GITHUB_SHA'),
            'bindings_present':{k:bool(env.get(k,'').strip()) for k in REQUIRED},
            'credential_values_recorded':False,'connection_attempted':False,
            'production_changed':False,'database_migration_executed':False,
            'historical_research_acceptance':False}
    if not all(report['bindings_present'].values()):
        report['status']='BLOCKED_FTPS_BINDINGS_NOT_BOUND';return report
    root=Path(__file__).resolve().parents[2]
    names=('historical-evidence.js','pdf-evidence.py','pdf-evidence.js','app.js')
    report['local_payload_sha256']={name:hashlib.sha256((root/'server/command-center-live'/name).read_bytes()).hexdigest() for name in names}
    report['connection_attempted']=True
    try:
        result=runner([sys.executable,str(Path(__file__).with_name('deploy_ftps.py'))],
                      env=env,capture_output=True,text=True,timeout=500)
    except subprocess.TimeoutExpired:
        report.update(status='DEPLOYMENT_TIMEOUT_INSPECT_PRODUCTION',production_changed='UNKNOWN');return report
    except OSError as error:
        report.update(status='DEPLOYMENT_PROCESS_UNAVAILABLE',error_type=type(error).__name__);return report
    output=result.stdout or ''
    report['process_exit_code']=result.returncode
    report['rollback_needs_manual_check']='ROLLBACK NEEDS MANUAL CHECK:' in output
    if result.returncode==0 and 'DEPLOYED: four verified backend files' in output:
        report.update(status='FILES_INSTALLED_HTTP_AND_DATABASE_VALIDATION_REQUIRED',production_changed=True,
                      uploaded_files_hash_checked=True,passenger_restart_requested=True)
    else:
        # Failure after mutation may have invoked rollback; never infer unchanged.
        report.update(status='FTPS_DEPLOYMENT_FAILED',production_changed='UNKNOWN')
        for error_type in ('SSLCertVerificationError','SSLError','gaierror','TimeoutError',
                           'ConnectionRefusedError','error_perm','error_temp','RuntimeError'):
            if 'DEPLOY FAILED: '+error_type in output:
                report['error_type']=error_type;break
        if report.get('error_type')=='SSLCertVerificationError':
            # Data-channel TLS can also fail later. Only control-channel failure
            # proves that no credentials or application mutations were sent.
            phase=re.search(r'DEPLOY_FAILURE_PHASE: ([A-Z_]+)',output)
            if phase:
                report['failed_phase']=phase.group(1)
                if phase.group(1) in ('CONNECT','CONTROL_TLS_LOGIN'):report['production_changed']=False
            match=re.search(r'TLS_VERIFY_CODE: (\d+)',output)
            if match:report['tls_verify_code']=int(match.group(1))
    report['limits']=['BACKEND_FILES_ONLY_NOT_MARIADB_MIGRATION','HTTP_AND_OIDC_VALIDATION_REQUIRED',
                      'NO_HISTORICAL_VERIFICATION_PROMOTION']
    return report

def main():
    report=execute()
    run=os.environ['GITHUB_RUN_ID']
    if not run.isdigit():raise ValueError('NUMERIC_RUN_ID_REQUIRED')
    dest=Path('evidence/production_ftps')/run;dest.mkdir(parents=True,exist_ok=True)
    (dest/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    if report['status']!='FILES_INSTALLED_HTTP_AND_DATABASE_VALIDATION_REQUIRED':raise SystemExit(1)

if __name__=='__main__':main()
