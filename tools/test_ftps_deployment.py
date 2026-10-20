import contextlib
import ftplib
import importlib.util
import io
import json
import os
from pathlib import Path
import runpy
import ssl
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('ftps_runner',ROOT/'gateway/run_ftps_deployment.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
diag_spec=importlib.util.spec_from_file_location('ftps_diagnostics',ROOT/'gateway/diagnose_ftps.py')
diagnostics=importlib.util.module_from_spec(diag_spec);diag_spec.loader.exec_module(diagnostics)

class FtpsDeploymentTests(unittest.TestCase):
    def test_storage_request_is_activated_last_and_failed_activation_restores_legacy_cli(self):
        prefix='/piratecartography-gateway/tools/storage/'
        for fail in (False,True):
            class FakeFtp:
                def __init__(self):self.files={prefix+'pct_research_store.php':b'legacy importer'};self.activations=[]
                def connect(self,*args):pass
                def login(self,*args):pass
                def prot_p(self):pass
                def cwd(self,path):self.directory=path
                def pwd(self):return '/piratecartography-gateway/server/command-center-live'
                def nlst(self,path=None):return ['pct_research_store.php'] if self.directory==prefix.rstrip('/') else ['package.json','public','tmp','knowledge-data']
                def retrbinary(self,command,callback):
                    path=command[5:]
                    if path not in self.files:raise ftplib.error_perm('550 absent')
                    callback(self.files[path])
                def storbinary(self,command,stream):self.files[command[5:]]=stream.read()
                def rename(self,source,target):
                    if '.nabou-ftps-' in source:
                        if target.endswith('.evidence-schema-install-request.json'):
                            if fail:raise ftplib.error_perm('550 isolated activation failure')
                            request=json.loads(self.files[source])
                            import hashlib
                            for name,sha in request['code_sha256'].items():
                                assert hashlib.sha256(self.files[prefix+name]).hexdigest()==sha
                        self.activations.append(target)
                    self.files[target]=self.files.pop(source)
                def delete(self,path):self.files.pop(path,None)
                def quit(self):pass
            ftp=FakeFtp();output=io.StringIO()
            env={name:'PRIVATE_FIXTURE' for name in module.REQUIRED}
            env.update(PCT_FTPS_PAYLOAD='evidence_storage',PCT_FTPS_STORAGE_CONFIRMATION='INSTALL-EXISTING-EVIDENCE-SCHEMA',
                       PCT_FTPS_APP_ROOT='/piratecartography-gateway/server/command-center-live',PCT_FTPS_TLS_SERVER_NAME='',
                       GITHUB_SHA='a'*40)
            with patch.dict(os.environ,env),patch('ftplib.FTP_TLS',return_value=ftp),contextlib.redirect_stdout(output):
                if fail:
                    with self.assertRaises(SystemExit):runpy.run_path(str(ROOT/'gateway/deploy_ftps.py'),run_name='__main__')
                else:runpy.run_path(str(ROOT/'gateway/deploy_ftps.py'),run_name='__main__')
            self.assertFalse(any('restart.txt' in path or 'httpdocs' in path for path in ftp.files))
            self.assertNotIn('PRIVATE_FIXTURE',output.getvalue())
            if fail:
                self.assertEqual(ftp.files[prefix+'pct_research_store.php'],b'legacy importer')
                self.assertNotIn(prefix+'historical_evidence.php',ftp.files)
                self.assertNotIn(prefix+'.evidence-schema-install-request.json',ftp.files)
            else:
                self.assertEqual(ftp.activations[-1],prefix+'.evidence-schema-install-request.json')
                self.assertIn('STORAGE_FILES_STAGED_AWAITING_EXISTING_HOST_LOCAL_CRON',output.getvalue())

    def test_storage_receipt_observer_retains_only_nonsecret_metadata(self):
        ftp=Mock()
        raw=b'{"status":"PASS","source_commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","imported_runs":2,"password":"PRIVATE_FIXTURE","unexpected":"PRIVATE_FIXTURE"}'
        ftp.retrbinary.side_effect=lambda command,callback:callback(raw)
        ftp.sendcmd.return_value='213 20261020190000'
        report=diagnostics.read_storage_metadata(ftp)
        self.assertEqual(report['recorded_import_summary']['imported_runs'],2)
        self.assertFalse(report['database_query_performed_by_this_probe'])
        self.assertNotIn('PRIVATE_FIXTURE',str(report))
        self.assertEqual(ftp.retrbinary.call_count,6)
        self.assertEqual(report['recorded_evidence_schema_status'],'UNAVAILABLE')

    def test_storage_file_transfer_never_claims_database_migration_executed(self):
        runner=Mock(return_value=SimpleNamespace(returncode=0,stdout='STORAGE_FILES_STAGED_AWAITING_EXISTING_HOST_LOCAL_CRON'))
        env={name:'PRIVATE_FIXTURE' for name in module.REQUIRED}
        env.update(PCT_FTPS_PAYLOAD='evidence_storage',PCT_FTPS_STORAGE_CONFIRMATION='INSTALL-EXISTING-EVIDENCE-SCHEMA')
        report=module.execute(env,runner)
        self.assertEqual(report['status'],'STORAGE_FILES_STAGED_AWAITING_HOST_LOCAL_MIGRATION')
        self.assertFalse(report['database_migration_executed'])
        self.assertFalse(report['passenger_restart_requested'])

    def test_explicit_tls_name_is_verified_on_the_original_server(self):
        ftp=Mock();output=io.StringIO()
        env={name:'PRIVATE_FIXTURE' for name in module.REQUIRED}
        env.update(PCT_FTPS_HOST='192.0.2.1',PCT_FTPS_TLS_SERVER_NAME='node.example.invalid')
        address=lambda ip:(2,1,6,'',(ip,21))
        def stop_before_authentication(*args,**kwargs):
            self.assertEqual(ftp.host,'node.example.invalid')
            raise RuntimeError('STOP_ISOLATED_TEST_BEFORE_AUTHENTICATION')
        ftp.login.side_effect=stop_before_authentication
        with patch.dict(os.environ,env),patch('ftplib.FTP_TLS',return_value=ftp) as factory, \
             patch('socket.getaddrinfo',side_effect=[[address('192.0.2.1')],[address('192.0.2.1')]]), \
             contextlib.redirect_stdout(output):
            with self.assertRaises(SystemExit):runpy.run_path(str(ROOT/'gateway/deploy_ftps.py'),run_name='__main__')
        ftp.connect.assert_called_once_with('192.0.2.1',21)
        ftp.storbinary.assert_not_called()
        self.assertEqual(factory.call_args.kwargs['context'].verify_mode,ssl.CERT_REQUIRED)
        self.assertNotIn('PRIVATE_FIXTURE',output.getvalue())

    def test_canonical_probe_accepts_dual_stack_dns_but_pins_original_server_without_login(self):
        ftp=Mock();factory=Mock(return_value=ftp)
        address=lambda ip:(2,1,6,'',(ip,21))
        with patch('socket.gethostbyaddr',return_value=('node.example.invalid',[],['192.0.2.1'])), \
             patch('socket.getaddrinfo',side_effect=[[address('192.0.2.1')],[address('192.0.2.1'),address('2001:db8::1')]]):
            report=diagnostics.diagnose_canonical_hostname('192.0.2.1',21,factory)
        self.assertEqual(report['status'],'CANONICAL_HOSTNAME_TLS_VERIFIED_NOT_AUTHENTICATED')
        ftp.connect.assert_called_once_with('192.0.2.1',21)
        self.assertEqual(ftp.host,'node.example.invalid')
        ftp.auth.assert_called_once();ftp.login.assert_not_called()
        self.assertEqual(factory.call_args.kwargs['context'].verify_mode,ssl.CERT_REQUIRED)
    def test_missing_bindings_do_not_attempt_network(self):
        runner=Mock(side_effect=AssertionError('must not run'))
        report=module.execute({},runner)
        runner.assert_not_called()
        self.assertFalse(report['connection_attempted'])
        self.assertEqual(report['status'],'BLOCKED_FTPS_BINDINGS_NOT_BOUND')

    def test_timeout_reports_unknown_production_state_without_values(self):
        runner=Mock(side_effect=subprocess.TimeoutExpired('deploy',500))
        report=module.execute({name:'PRIVATE_FIXTURE' for name in module.REQUIRED},runner)
        self.assertEqual(report['production_changed'],'UNKNOWN')
        self.assertNotIn('PRIVATE_FIXTURE',str(report))

    def test_file_upload_success_is_not_database_or_research_acceptance(self):
        runner=Mock(return_value=SimpleNamespace(returncode=0,stdout='DEPLOYED: four verified backend files'))
        report=module.execute({name:'PRIVATE_FIXTURE' for name in module.REQUIRED},runner)
        self.assertTrue(report['production_changed'])
        self.assertFalse(report['database_migration_executed'])
        self.assertFalse(report['historical_research_acceptance'])

    def test_late_tls_failure_does_not_claim_production_was_unchanged(self):
        for phase,expected in [('CONTROL_TLS_LOGIN',False),('RESTART','UNKNOWN')]:
            runner=Mock(return_value=SimpleNamespace(returncode=1,stdout=
                'DEPLOY FAILED: SSLCertVerificationError\nDEPLOY_FAILURE_PHASE: '+phase+'\nTLS_VERIFY_CODE: 62\n'))
            report=module.execute({name:'PRIVATE_FIXTURE' for name in module.REQUIRED},runner)
            self.assertEqual(report['production_changed'],expected)
            self.assertEqual(report['tls_verify_code'],62)

    def test_untrusted_certificate_blocks_before_login_without_exposing_error(self):
        error=ssl.SSLCertVerificationError('PRIVATE_FIXTURE');error.verify_code=62
        ftp=Mock();ftp.connect.side_effect=error
        output=io.StringIO()
        with patch.dict(os.environ,{name:'PRIVATE_FIXTURE' for name in module.REQUIRED}), \
             patch('ftplib.FTP_TLS',return_value=ftp) as factory, contextlib.redirect_stdout(output):
            with self.assertRaises(SystemExit):runpy.run_path(str(ROOT/'gateway/deploy_ftps.py'),run_name='__main__')
        context=factory.call_args.kwargs['context']
        self.assertEqual(context.verify_mode,ssl.CERT_REQUIRED)
        self.assertTrue(context.check_hostname)
        ftp.login.assert_not_called()
        self.assertNotIn('PRIVATE_FIXTURE',output.getvalue())

if __name__=='__main__':unittest.main()
