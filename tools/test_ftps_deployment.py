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

class FtpsDeploymentTests(unittest.TestCase):
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

    def test_untrusted_certificate_blocks_before_login_without_exposing_error(self):
        ftp=Mock();ftp.connect.side_effect=ssl.SSLCertVerificationError('PRIVATE_FIXTURE')
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
