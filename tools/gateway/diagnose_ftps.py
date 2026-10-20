"""Read-only explicit FTPS diagnosis; no unverified TLS or credential output."""
import datetime
import ftplib
import json
import os
from pathlib import Path
import posixpath
import socket
import ssl

REASONS={9:'CERTIFICATE_NOT_YET_VALID',10:'CERTIFICATE_EXPIRED',18:'SELF_SIGNED_LEAF',
         19:'SELF_SIGNED_CHAIN',20:'ISSUER_CERTIFICATE_UNAVAILABLE',21:'LEAF_SIGNATURE_UNVERIFIABLE',
         62:'HOSTNAME_MISMATCH',64:'IP_ADDRESS_MISMATCH'}

def diagnose_owner_aliases(host,port,factory):
    """Try only this existing site's DNS names, with no password or writes.

    An alias must resolve to the configured server and pass normal TLS hostname
    and chain validation. Certificate names are never adopted as trusted input.
    """
    results=[]
    try:expected={row[4][0] for row in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
    except OSError:return [{'status':'CONFIGURED_SERVER_DNS_UNAVAILABLE'}]
    for alias in ('ftp.piratecartography.com','piratecartography.com'):
        row={'owner_alias':alias,'authenticated':False,'production_changed':False}
        peer=None
        try:
            actual={entry[4][0] for entry in socket.getaddrinfo(alias,port,type=socket.SOCK_STREAM)}
            if not actual or not actual<=expected:
                row['status']='ALIAS_NOT_PROVEN_SAME_SERVER'
            else:
                peer=factory(timeout=12,context=ssl.create_default_context())
                peer.connect(alias,port);peer.auth()
                row['status']='TLS_VERIFIED_SAME_SERVER_OWNER_ALIAS'
        except ssl.SSLCertVerificationError as error:
            row.update(status='TLS_CERTIFICATE_REJECTED',tls_verify_code=error.verify_code,
                       tls_reason=REASONS.get(error.verify_code,'CERTIFICATE_VERIFICATION_FAILED'))
        except (OSError,ftplib.Error) as error:row.update(status='ALIAS_UNAVAILABLE',error_type=type(error).__name__)
        finally:
            if peer:
                try:peer.close()
                except Exception:pass
        results.append(row)
    return results

def diagnose_canonical_hostname(host,port,factory):
    """Inspect public reverse DNS and verified TLS, without sending credentials.

    This is a candidate for explicit deployment configuration, not automatic
    adoption of a certificate name or a change to the configured server.
    """
    result={'authenticated':False,'production_changed':False};peer=None
    try:
        hostname=socket.gethostbyaddr(host)[0].rstrip('.')
        expected={row[4][0] for row in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
        actual={row[4][0] for row in socket.getaddrinfo(hostname,port,type=socket.SOCK_STREAM)}
        if not actual or not actual<=expected:
            result['status']='REVERSE_DNS_NOT_FORWARD_CONFIRMED';return result
        result.update(public_dns_hostname=hostname,forward_confirmed_same_server=True)
        peer=factory(timeout=12,context=ssl.create_default_context())
        peer.connect(hostname,port);peer.auth()
        result['status']='CANONICAL_HOSTNAME_TLS_VERIFIED_NOT_AUTHENTICATED'
    except ssl.SSLCertVerificationError as error:
        result.update(status='TLS_CERTIFICATE_REJECTED',tls_verify_code=error.verify_code,
                      tls_reason=REASONS.get(error.verify_code,'CERTIFICATE_VERIFICATION_FAILED'))
    except (OSError,ftplib.Error) as error:result.update(status='CANONICAL_HOSTNAME_UNAVAILABLE',error_type=type(error).__name__)
    finally:
        if peer:
            try:peer.close()
            except Exception:pass
    return result

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
        if error.verify_code in (62,64):
            result['owner_alias_tls_probes']=diagnose_owner_aliases(env['PCT_FTPS_HOST'],int(env.get('PCT_FTPS_PORT') or '21'),factory)
            result['canonical_hostname_tls_probe']=diagnose_canonical_hostname(env['PCT_FTPS_HOST'],int(env.get('PCT_FTPS_PORT') or '21'),factory)
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
