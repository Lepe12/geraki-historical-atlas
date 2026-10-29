import time
import unittest

from hybrid_retrieval import char_ngram_vectors, fuse, proximity_rerank, rrf, vector_scores, settings
from excerpt_ranking import rank

PROSE = ('The travellers describe the harbour, the inhabitants and the trade of the island in some detail, '
         'with notes on the anchorage, the winds and the provisions available to passing ships.')


def row(eid, text):
    return {'evidence_id': eid, 'text': text, 'occurrences': [{'title': 'T'}]}


class Parts(unittest.TestCase):
    def test_rrf_rewards_agreement(self):
        order, score = rrf([['a', 'b', 'c'], ['b', 'a', 'c']], k=60)
        self.assertEqual(order[-1], 'c'); self.assertAlmostEqual(score['a'], score['b'])
        self.assertEqual(rrf([['a', 'b'], ['b', 'a']])[0], ['a', 'b'])  # tie broken by lexical order

    def test_char_ngrams_match_declension_and_spelling(self):
        vec, backend, _ = vector_scores('Κίμωλος Argentière', ['της Κιμώλου οι κάτοικοι', 'Argentiera porto', 'Naxos wine'],
                                        settings({}))
        self.assertEqual(backend, 'char-ngram-tfidf')
        self.assertGreater(vec[0], vec[2]); self.assertGreater(vec[1], vec[2])

    def test_vectors_are_normalised(self):
        v = char_ngram_vectors(['corsaires', 'pirates'])[0]
        self.assertAlmostEqual(sum(x * x for x in v.values()), 1.0, places=6)

    def test_optional_model_backend_falls_back_without_model_file(self):
        _, backend, note = vector_scores('q', ['a b c'], settings({'PCT_EMBED_BACKEND': 'llama-cpp-gguf',
                                                                       'PCT_EMBED_MODEL_PATH': '/nonexistent.gguf'}))
        self.assertEqual((backend, note), ('char-ngram-tfidf', 'EMBED_MODEL_PATH_MISSING'))

    def test_custom_embed_function_is_used(self):
        vec, backend, _ = vector_scores('q', ['x', 'y'], settings({}), embed_fn=lambda xs: [[1, 0], [1, 0], [0, 1]])
        self.assertEqual(backend, 'custom'); self.assertGreater(vec[0], vec[1])

    def test_proximity_reranker(self):
        near, _ = proximity_rerank('Les corsaires mouillaient à Kimolos', ['kimolo'], ['corsai'])
        far, _ = proximity_rerank('Kimolos ' + 'mot ' * 60 + 'corsaires', ['kimolo'], ['corsai'])
        self.assertGreater(near, far)
        held, parts = proximity_rerank('x', ['kimolo'], ['corsai'], place='AMBIGUOUS_NO_CONTEXT')
        self.assertLess(held, 0); self.assertEqual(parts['place_context'], 'AMBIGUOUS_NO_CONTEXT')


class InRanking(unittest.TestCase):
    # These pin the default (char-ngram) backend; the e5 model has its own tests.
    def setUp(self):
        import os
        self._dir = os.environ.pop('PCT_EMBED_MODEL_DIR', None)

    def tearDown(self):
        import os
        if self._dir is not None:
            os.environ['PCT_EMBED_MODEL_DIR'] = self._dir

    def test_report_and_nothing_dropped(self):
        records = [row('e%d' % i, ('Kimolos corsaires ' if i % 4 == 0 else '') + PROSE + ' %d' % i) for i in range(12)]
        ordered, report = rank(records, 'Κίμωλος', ['Kimolos'], '', 'ρόλο κουρσάρων')
        self.assertEqual(len(ordered), 12); self.assertEqual(report['dropped'], 0)
        h = report['hybrid']
        self.assertTrue(h['applied']); self.assertEqual(h['paid_api_calls'], 0)
        self.assertEqual(h['vector_backend'], 'char-ngram-tfidf'); self.assertFalse(h['neural_embeddings'])
        self.assertIn('rrf', report['scores'][0])

    def test_vector_side_lifts_ocr_variant_bm25_misses(self):
        # 'Kimoli' (Italian) shares no BM25 stem with the request, but its n-grams match.
        records = [row('plain', PROSE + ' Naxos.'), row('ocr', 'I corsari a Kimoli. ' + PROSE)]
        ordered, _ = rank(records, 'Kimolos', [], '', 'corsairs', gazetteer='/nonexistent')
        self.assertEqual(ordered[0]['evidence_id'], 'ocr')

    def test_homonyms_stay_last_and_disable_switch(self):
        records = [row('alps', "Argentière glacier Chamonix Mont Blanc Savoie guides. " + PROSE),
                   row('aegean', "Argentière près de Milo, Archipel. " + PROSE)]
        ordered, _ = rank(records, 'Κίμωλος', ["l'Argentière"], '', 'ρόλο κουρσάρων')
        self.assertEqual([r['evidence_id'] for r in ordered], ['aegean', 'alps'])
        scored = [{'row': r, 'index': i, 'score': 0, 'reasons': []} for i, r in enumerate(records)]
        same, rep = fuse(scored, 'q', [], [], env={'PCT_HYBRID_RETRIEVAL': '0'})
        self.assertFalse(rep['applied']); self.assertIs(same, scored)

    def test_deterministic_and_fast_enough(self):
        records = [row('e%d' % i, PROSE + (' Kimolos' if i % 7 == 0 else '') + ' %d' % i) for i in range(1500)]
        t = time.monotonic(); a = rank(records, 'Kimolos', [], '', 'corsairs')[0]
        self.assertLess(time.monotonic() - t, 60)
        self.assertEqual([r['evidence_id'] for r in a], [r['evidence_id'] for r in rank(records, 'Kimolos', [], '', 'corsairs')[0]])


if __name__ == '__main__':
    unittest.main()
