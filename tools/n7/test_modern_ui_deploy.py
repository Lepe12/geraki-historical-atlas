import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('deploy_modern',Path(__file__).with_name('deploy_modern_ui.py'))
deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)

class PatchTests(unittest.TestCase):
    def source(self):
        html='<html><head><title>Old</title><meta name="theme-color" content="#08111d"><link rel="stylesheet" href="/style.css?old=1"></head><body>'
        html+=''.join('<div id="'+x+'"></div>' for x in ['loginform','application','new','conversations','taskview','messages','chat','message','send'])
        html+='<script src="/app.js?old=2" defer></script><script src="/n7-library-ui.js" defer></script></body></html>'
        app='// N7_OWNER_MEMORY_UI_V1\n// N7_CHAT_CORRECTION_CONFIRM_V1\n// N7_NONBLOCKING_QUEUE_WATCH_v1\nconst existingFeature="preserved";'
        return {'index.html':html.encode(),'app.js':app.encode(),'style.css':b'.existing-feature{display:block}'}

    def test_preserves_existing_source_and_external_modules(self):
        original=self.source();result=deploy.patch_assets(original)
        self.assertEqual(set(result),{'app.js','style.css','index.html'})
        self.assertTrue(result['app.js'].startswith(original['app.js']))
        self.assertTrue(result['style.css'].startswith(original['style.css']))
        self.assertIn(b'/n7-library-ui.js',result['index.html'])
        self.assertIn(b'app.js?n7modern=',result['index.html'])
        self.assertIn(b'style.css?n7modern=',result['index.html'])
        self.assertIn(b'#faf9f6',result['index.html'])
        self.assertIn(b'N7_MODERN_LIGHT_UI_V1',result['app.js'])

    def test_missing_feature_and_duplicate_assets_abort_before_writes(self):
        original=self.source();original['app.js']=b'const unknown=true;'
        with self.assertRaisesRegex(RuntimeError,'PREVIOUS_UI_MISSING'):deploy.patch_assets(original)
        original=self.source();original['index.html']+=b'<script src="/app.js"></script>'
        with self.assertRaisesRegex(RuntimeError,'REFERENCE_NOT_UNIQUE'):deploy.patch_assets(original)

    def test_already_installed_is_not_duplicated(self):
        current=deploy.patch_assets(self.source())
        self.assertEqual(deploy.patch_assets(current),current)

    def test_unreviewed_tail_is_not_replaced(self):
        current=deploy.patch_assets(self.source());current['app.js']+=b'\n// concurrent feature\n'
        with self.assertRaisesRegex(RuntimeError,'UNREVIEWED_SOURCE'):deploy.patch_assets(current)

if __name__=='__main__':unittest.main()
