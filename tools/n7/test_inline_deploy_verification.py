import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec=importlib.util.spec_from_file_location('inline_deploy',Path(__file__).with_name('deploy_inline_correction.py'))
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

class Response(io.BytesIO):
    status=200

class VerificationTest(unittest.TestCase):
    expected=b'N7_CHAT_CORRECTION_CONFIRM_V1 N7_NONBLOCKING_QUEUE_WATCH_v1'

    def test_stale_asset_retried_with_unique_url_and_exact_hash(self):
        urls=[]
        def fetch(request,**kwargs):
            url=request if isinstance(request,str) else request.full_url
            if '/app.js?' in url:
                urls.append(url)
                return Response(b'old asset' if len(urls)==1 else self.expected)
            if url.endswith('/approved-lessons'):
                raise HTTPError(url,401,'Unauthorized',{},None)
            return Response(b'{"modelConfigured":true}')
        with patch.object(deploy.urllib.request,'urlopen',side_effect=fetch),patch.object(deploy.time,'sleep'):
            deploy.public_verify(self.expected)
        self.assertEqual(len(urls),2)
        self.assertNotEqual(urls[0],urls[1])

    def test_persistent_mismatch_still_fails(self):
        with patch.object(deploy.urllib.request,'urlopen',side_effect=lambda *a,**k:Response(b'wrong')),patch.object(deploy.time,'sleep'):
            with self.assertRaisesRegex(RuntimeError,'N7_PUBLIC_JS_MISMATCH'):
                deploy.public_verify(self.expected)

    def test_correct_hash_does_not_bypass_required_markers(self):
        with patch.object(deploy.urllib.request,'urlopen',side_effect=lambda *a,**k:Response(b'wrong')):
            with self.assertRaisesRegex(RuntimeError,'N7_PREVIOUS_UI_INTEGRATION_MISSING'):
                deploy.public_verify(b'wrong')

if __name__=='__main__':unittest.main()
