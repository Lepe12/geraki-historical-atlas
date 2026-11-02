import unittest
from research_cpu_cache import cache_tag

class NativeCache(unittest.TestCase):
    def test_cpu_features_and_model_isolate_native_wheels(self):
        a='model name : AMD EPYC A\nflags : sse avx avx2\n'
        self.assertEqual(cache_tag(a),cache_tag('model name : AMD EPYC A\nflags : avx2 avx sse\n'))
        self.assertNotEqual(cache_tag(a),cache_tag('model name : AMD EPYC A\nflags : sse avx avx2 avx512f\n'))
        self.assertNotEqual(cache_tag(a),cache_tag('model name : Intel Xeon\nflags : sse avx avx2\n'))

    def test_unknown_capabilities_are_never_shared(self):
        self.assertNotEqual(cache_tag(''),cache_tag(''))

if __name__=='__main__':unittest.main()
