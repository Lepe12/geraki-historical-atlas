import contextlib
import importlib.util
import io
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
