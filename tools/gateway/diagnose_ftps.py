"""Read-only explicit FTPS diagnosis; no unverified TLS or credential output."""
import datetime
import ftplib
import json
import os
from pathlib import Path
import posixpath
import ssl

REASONS={9:'CERTIFICATE_NOT_YET_VALID',10:'CERTIFICATE_EXPIRED',18:'SELF_SIGNED_LEAF',
         19:'SELF_SIGNED_CHAIN',20:'ISSUER_CERTIFICATE_UNAVAILABLE',21:'LEAF_SIGNATURE_UNVERIFIABLE',
         62:'HOSTNAME_MISMATCH',64:'IP_ADDRESS_MISMATCH'}

def diagnose(env=None,factory=ftplib.FTP_TLS):
    env=dict(os.environ if env is None else env)
    required=('PCT_FTPS_HOST','PCT_FTPS_USER','PCT_FTPS_PASSWORD')
    result={'schema':'nabou-ftps-readonly-diagnostic-v1','checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'bindings_present':{key:bool(env.get(key,'').strip()) for key in required},
            'read_only':True,'production_changed':False,'credential_values_recorded':False,
            'tls_verification_required':True,'directories':[]}
    if not all(result['bindings_present'].values()):
        result['status']='BLOCKED_FTPS_BINDINGS_NOT_BOUND';return result
    ftp=factory(timeout=20,context=ssl.create_default_context())
    stage='CONNECT'
    try:
        ftp.connect(env['PCT_FTPS_HOST'],int(env.get('PCT_FTPS_PORT') or '21'))
        stage='AUTH_TLS_AND_LOGIN'
        ftp.login(env['PCT_FTPS_USER'],env['PCT_FTPS_PASSWORD']);ftp.prot_p()
        stage='READ_ONLY_DIRECTORY_PREFLIGHT'
        candidates=('/', '/server/command-center-live','/piratecartography-gateway/server/command-center-live')
        expected=('app.js','package.json','public','tmp','knowledge-data','historical-evidence.js','pdf-evidence.js')
        for target in candidates:
            row={'path':target,'accessible':False}
            try:
                ftp.cwd(target)
                names={posixpath.basename(x.rstrip('/')) for x in ftp.nlst()}
                row.update(accessible=True,expected_entries={name:name in names for name in expected})
            except ftplib.all_errors as error:row['error_type']=type(error).__name__
            result['directories'].append(row)
        result['status']='FTPS_AUTHENTICATED_READ_ONLY_DIAGNOSIS_COMPLETE'
    except ssl.SSLCertVerificationError as error:
        result.update(status='TLS_CERTIFICATE_REJECTED',failed_stage=stage,
                      tls_verify_code=error.verify_code,tls_reason=REASONS.get(error.verify_code,'CERTIFICATE_VERIFICATION_FAILED'))
    except (OSError,ValueError,ftplib.Error) as error:
        result.update(status='FTPS_DIAGNOSIS_FAILED',failed_stage=stage,error_type=type(error).__name__)
    finally:
        try:ftp.quit()
        except Exception:pass
    return result

def main():
    result=diagnose();print(json.dumps(result,indent=2))
    run=os.environ.get('GITHUB_RUN_ID')
    if run:
        if not run.isdigit():raise ValueError('NUMERIC_RUN_ID_REQUIRED')
        path=Path('evidence/production_ftps_diagnostics')/run;path.mkdir(parents=True,exist_ok=True)
        (path/'report.json').write_text(json.dumps(result,indent=2)+'\n')
    if result['status']!='FTPS_AUTHENTICATED_READ_ONLY_DIAGNOSIS_COMPLETE':raise SystemExit(1)

if __name__=='__main__':main()
