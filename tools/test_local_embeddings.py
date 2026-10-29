import os
import tempfile
import unittest

import hybrid_retrieval as h
import local_embeddings as le
from test_hybrid_retrieval import PROSE, row

REAL_DIR = os.environ.get('PCT_EMBED_MODEL_DIR', '')


class Fallback(unittest.TestCase):
    def setUp(self):
        h._EMBEDDERS.clear()

    def test_auto_without_model_dir_uses_char_ngrams(self):
        _, backend, note = h.vector_scores('Κίμωλος', ['Κιμώλου', 'Naxos'], h.settings({}))
        self.assertEqual((backend, note), ('char-ngram-tfidf', None))

    def test_missing_or_incomplete_model_dir_falls_back_and_says_so(self):
        with tempfile.TemporaryDirectory() as d:
            open(os.path.join(d, 'model.onnx'), 'wb').write(b'x')  # wrong size: not ready
            self.assertFalse(le.model_ready(d))
            for env in ({'PCT_EMBED_MODEL_DIR': d}, {'PCT_EMBED_BACKEND': 'onnx-e5'}):
                h._EMBEDDERS.clear()
                vec, backend, note = h.vector_scores('Κίμωλος', ['Κιμώλου', 'Naxos'], h.settings(env))
                self.assertEqual((backend, note), ('char-ngram-tfidf', 'EMBED_MODEL_DIR_MISSING'))
                self.assertGreater(vec[0], vec[1])

    def test_embedder_failure_falls_back(self):
        def boom(xs):
            raise RuntimeError('x')
        h._EMBEDDERS['D'] = (boom, None)
        _, backend, note = h.vector_scores('a', ['b'], h.settings({'PCT_EMBED_MODEL_DIR': 'D'}))
        self.assertEqual((backend, note), ('char-ngram-tfidf', 'ONNX_EMBED_FAILED:RuntimeError'))

    def test_onnx_backend_reported_as_neural_and_max_docs_keeps_everything(self):
        h._EMBEDDERS['D'] = (lambda xs: [[1.0, float(i)] for i, _ in enumerate(xs)], None)
        items = [{'row': row(f'e{i}', PROSE), 'score': 10 - i, 'index': i, 'reasons': []} for i in range(5)]
        out, rep = h.fuse(items, 'q', [], [], env={'PCT_EMBED_MODEL_DIR': 'D', 'PCT_EMBED_MAX_DOCS': '3'})
        self.assertEqual((rep['vector_backend'], rep['neural_embeddings'], rep['embedded_docs']), ('onnx-e5', True, 3))
        self.assertEqual(sorted(s['row']['evidence_id'] for s in out), [f'e{i}' for i in range(5)])


class E5Contract(unittest.TestCase):
    def test_query_and_passage_prefixes(self):
        emb = le.E5Embedder.__new__(le.E5Embedder)
        seen = []
        emb.encode = lambda xs: seen.extend(xs) or [[0.0]] * len(xs)
        emb(['πειρατές', 'corsaires', 'corsari'])
        self.assertEqual(seen, ['query: πειρατές', 'passage: corsaires', 'passage: corsari'])

    def test_unstable_batch_is_decided_by_median_of_three(self):
        import numpy as np
        outs = iter([np.array([1.0]), np.array([1.5]), np.array([1.0])])
        emb = le.E5Embedder.__new__(le.E5Embedder)
        emb.np = np
        emb.sess = type('S', (), {'run': lambda self, _o, _f: [next(outs)]})()
        self.assertEqual(emb._stable_run({}).tolist(), [1.0]); self.assertEqual(emb.unstable_batches, 1)

    def test_pinned_revision_and_size_budget(self):
        self.assertRegex(le.REVISION, r'^[0-9a-f]{40}$')
        self.assertLess(sum(size for _, _, size in le.FILES.values()), 500 * 1024 * 1024)
        for _, sha, _ in le.FILES.values():
            self.assertRegex(sha, r'^[0-9a-f]{64}$')


@unittest.skipUnless(le.model_ready(REAL_DIR), 'local e5 model not downloaded')
class RealModel(unittest.TestCase):
    def test_cross_language_piracy_beats_unrelated(self):
        h._EMBEDDERS.clear()
        texts = ['Piratae ad insulam Cimolum hiemabant.', "I corsari si rifugiavano all'Argentiera.",
                 'La récolte du vin à Bordeaux.']
        vec, backend, note = h.vector_scores('πειρατές στην Κίμωλο', texts, h.settings({'PCT_EMBED_MODEL_DIR': REAL_DIR}))
        self.assertEqual((backend, note), ('onnx-e5', None))
        self.assertGreater(vec[0], vec[2]); self.assertGreater(vec[1], vec[2])

    def test_reproducible_run_to_run(self):
        h._EMBEDDERS.clear()
        texts = [PROSE + (' Kimolos' if i % 7 == 0 else '') + ' %d' % i for i in range(40)]
        cfg = h.settings({'PCT_EMBED_MODEL_DIR': REAL_DIR})
        self.assertEqual(h.vector_scores('Kimolos corsairs', texts, cfg)[0], h.vector_scores('Kimolos corsairs', texts, cfg)[0])


if __name__ == '__main__':
    unittest.main()
