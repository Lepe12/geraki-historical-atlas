"""Read-only explicit FTPS diagnosis; no unverified TLS or credential output."""
import datetime
import ftplib
import hashlib
import json
import os
from pathlib import Path
import posixpath
import re
import socket
import ssl

REASONS={9:'CERTIFICATE_NOT_YET_VALID',10:'CERTIFICATE_EXPIRED',18:'SELF_SIGNED_LEAF',
         19:'SELF_SIGNED_CHAIN',20:'ISSUER_CERTIFICATE_UNAVAILABLE',21:'LEAF_SIGNATURE_UNVERIFIABLE',
         62:'HOSTNAME_MISMATCH',64:'IP_ADDRESS_MISMATCH'}

def read_storage_metadata(ftp):
    """Read only the known import receipt/code hashes; never private configs."""
    result={'database_query_performed_by_this_probe':False,'code_files':[]}
    def fetch(path,limit=65536):
        chunks=[];size=0
        def add(chunk):
            nonlocal size
            size+=len(chunk)
            if size>limit:raise ValueError('METADATA_SIZE_LIMIT')
            chunks.append(chunk)
        ftp.retrbinary('RETR '+path,add)
        return b''.join(chunks)
    receipt='/piratecartography-system/pct-research-storage-last.json'
    try:
        raw=json.loads(fetch(receipt));summary={}
        if not isinstance(raw,dict):raise ValueError('INVALID_RECEIPT_SHAPE')
        if raw.get('status') in ('PASS','PARTIAL_BLOCKED','BUSY'):summary['status']=raw['status']
        if isinstance(raw.get('source_commit'),str) and re.fullmatch(r'[a-f0-9]{40}',raw['source_commit']):summary['source_commit']=raw['source_commit']
        for key in ('imported_runs','unchanged_runs','blocked_runs'):
            if type(raw.get(key)) is int and 0<=raw[key]<=1_000_000:summary[key]=raw[key]
        if type(raw.get('evidence_schema_installed')) is bool:summary['evidence_schema_installed']=raw['evidence_schema_installed']
        if raw.get('evidence_migration_status') in ('PASS','NOT_REQUESTED','BLOCKED'):summary['evidence_migration_status']=raw['evidence_migration_status']
        summary['recent_runs']=[]
        for run in (raw.get('recent_runs') if isinstance(raw.get('recent_runs'),list) else [])[:10]:
            if not isinstance(run,dict) or not re.fullmatch(r'\d+',str(run.get('run_id',''))):continue
            item={'run_id':str(run['run_id'])}
            if re.fullmatch(r'[a-f0-9]{40}',str(run.get('source_commit',''))):item['source_commit']=run['source_commit']
            if str(run.get('document_count','')).isdigit():item['document_count']=int(run['document_count'])
            if re.fullmatch(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}',str(run.get('imported_at',''))):item['imported_at_utc']=run['imported_at']
            summary['recent_runs'].append(item)
        summary['evidence_counts_by_recent_run']=[]
        for run in (raw.get('evidence_counts_by_recent_run') if isinstance(raw.get('evidence_counts_by_recent_run'),list) else [])[:10]:
            if not isinstance(run,dict) or not re.fullmatch(r'\d+',str(run.get('run_id',''))):continue
            if all(type(run.get(key)) is int and run[key]>=0 for key in ('sources','attestations','citations')):
                summary['evidence_counts_by_recent_run'].append({key:run[key] for key in ('run_id','sources','attestations','citations')})
        result['recorded_import_summary']=summary
        try:
            timestamp=ftp.sendcmd('MDTM '+receipt)
            if re.fullmatch(r'213 \d{14}',timestamp):result['receipt_modified_utc_yyyymmddhhmmss']=timestamp[4:]
        except ftplib.all_errors:pass
    except (ValueError,OSError,ftplib.Error):result['recorded_import_summary_status']='UNAVAILABLE'
    try:
        raw=json.loads(fetch('/piratecartography-system/pct-evidence-schema-last.json'))
        if not isinstance(raw,dict) or raw.get('schema')!='nabou-evidence-schema-installation-v1':raise ValueError('INVALID_SCHEMA_RECEIPT')
        migration={'schema':raw['schema']}
        if raw.get('status') in ('PASS','BLOCKED'):migration['status']=raw['status']
        if raw.get('schema_version')=='evidence-v2':migration['schema_version']=raw['schema_version']
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}T[0-9:+-]+',str(raw.get('completed_utc',''))):migration['completed_utc']=raw['completed_utc']
        for key in ('backup_created','historical_verification_promoted'):
            if type(raw.get(key)) is bool:migration[key]=raw[key]
        for key in ('failed_stage','error_type','reason'):
            if re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{1,100}',str(raw.get(key,''))):migration[key]=raw[key]
        for key in ('schema_sha256','backup_sha256','request_sha256'):
            if re.fullmatch(r'[a-f0-9]{64}',str(raw.get(key,''))):migration[key]=raw[key]
        result['recorded_evidence_schema_installation']=migration
    except (ValueError,OSError,ftplib.Error):result['recorded_evidence_schema_status']='UNAVAILABLE'
    for name in ('pct_research_store.php','historical_evidence.php','historical_evidence_schema.sql','evidence_schema_request.php'):
        row={'file':name,'available':False}
        try:
            data=fetch('/piratecartography-gateway/tools/storage/'+name,limit=2_000_000)
            row.update(available=True,sha256=hashlib.sha256(data).hexdigest())
        except (ValueError,OSError,ftplib.Error):pass
        result['code_files'].append(row)
    return result

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
            if not actual.intersection(expected):
                row['status']='ALIAS_NOT_PROVEN_SAME_SERVER'
            else:
                peer=factory(timeout=12,context=ssl.create_default_context())
                # Pin the actual connection to the configured server. DNS may
                # also return other pool/IPv6 addresses; never follow those.
                peer.connect(host,port);peer.host=alias;peer.auth()
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
        result['public_dns_hostname']=hostname
        expected={row[4][0] for row in socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)}
        actual={row[4][0] for row in socket.getaddrinfo(hostname,port,type=socket.SOCK_STREAM)}
        if not actual.intersection(expected):
            result['status']='REVERSE_DNS_NOT_FORWARD_CONFIRMED';return result
        result.update(public_dns_hostname=hostname,forward_confirmed_same_server=True)
        peer=factory(timeout=12,context=ssl.create_default_context())
        peer.connect(host,port);peer.host=hostname;peer.auth()
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
        name=env.get('PCT_FTPS_TLS_SERVER_NAME','').strip().rstrip('.')
        if name:
            original={r[4][0] for r in socket.getaddrinfo(env['PCT_FTPS_HOST'],21,type=socket.SOCK_STREAM)}
            named={r[4][0] for r in socket.getaddrinfo(name,21,type=socket.SOCK_STREAM)}
            if not original.intersection(named):raise ValueError('TLS_NAME_NOT_BOUND_TO_CONFIGURED_SERVER')
            ftp.host=name
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
        result['storage_metadata']=read_storage_metadata(ftp)
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
