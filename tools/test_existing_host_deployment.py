import importlib.util
from pathlib import Path
import unittest
import json
import shlex
from types import SimpleNamespace
from unittest.mock import Mock

spec=importlib.util.spec_from_file_location('existing_host_deploy',Path(__file__).parent/'gateway/deploy_existing_evidence_host.py')
deployment=importlib.util.module_from_spec(spec);spec.loader.exec_module(deployment)

class ExistingHostDeploymentTests(unittest.TestCase):
    def test_missing_bindings_prevent_ssh_and_do_not_claim_other_secrets_are_absent(self):
        runner=Mock(side_effect=AssertionError('SSH must not execute'))
        report=deployment.execute({},runner)
        runner.assert_not_called()
        self.assertEqual(report['status'],'BLOCKED_DEPLOYMENT_BINDINGS_NOT_BOUND')
        self.assertEqual(set(report['missing_workflow_bindings']),set(deployment.REQUIRED))
        self.assertFalse(report['ssh_invoked']);self.assertFalse(report['production_changed'])
        self.assertFalse(report['credential_values_recorded'])

    def test_ssh_command_requires_pinned_host_identity_and_quotes_remote_root(self):
        # Simulated subprocess only. This test makes no remote connection.
        env={name:'fixture-only' for name in deployment.REQUIRED}
        env.update(PCT_PLESK_SSH_HOST='example.invalid',PCT_PLESK_SSH_USER='fixture',
                   PCT_APP_ROOT="/fixture folder/'$(must-not-execute)'/server/command-center-live")
        def runner(command,**kwargs):
            self.assertIn('StrictHostKeyChecking=yes',command)
            self.assertIn('BatchMode=yes',command)
            self.assertEqual(shlex.split(command[-1]),['env','PCT_APP_ROOT='+env['PCT_APP_ROOT'],'sh','-s'])
            key=Path(command[command.index('-i')+1])
            self.assertEqual(key.stat().st_mode&0o777,0o600)
            self.assertIn(('COMMIT='+deployment.BUNDLE).encode(),kwargs['input'])
            return SimpleNamespace(returncode=0,stdout=b'PRODUCTION_HTTP_ACCEPTANCE_NOT_YET_VERIFIED',stderr=b'')
        report=deployment.execute(env,runner)
        self.assertEqual(report['status'],'FILES_INSTALLED_RESTART_REQUESTED_HTTP_VALIDATION_REQUIRED')
        self.assertNotIn('fixture-only',json.dumps(report))
