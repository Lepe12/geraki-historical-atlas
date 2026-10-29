"""Hybrid retrieval for the reading order: lexical BM25 + vector similarity,
fused with Reciprocal Rank Fusion (RRF), then a reranker on the top-K.

Reading order only: nothing is deleted, verified or promoted.

Vector backends (no paid API, no download in the pipeline):
  char-ngram-tfidf  default. Character 3-5-grams on accent-folded text,
                    TF-IDF weighted, cosine. Not a neural model: it is
                    robust to OCR damage, declension and spelling across
                    Greek/French/Italian/Latin (Κιμώλου ~ Κίμωλος,
                    Argentiera ~ Argentière), which is what the corpus needs.
  llama-cpp-gguf    optional local multilingual embedding model, used only
                    when PCT_EMBED_MODEL_PATH points to a GGUF file already
                    on disk and llama-cpp-python is installed (it is in the
                    research-model action). Falls back to char-ngram on any
                    error, and says so in the report.

Reranker (deterministic, model-free "cross" scorer on query+excerpt pairs):
name/topic proximity in the same sentence window, gazetteer place-context
status (place_context.py), and in-window years. No cross-encoder model is
configured in this project; the slot is pluggable (rerank_fn).

Env: PCT_HYBRID_RETRIEVAL=0 off; PCT_RRF_K (60); PCT_RERANK_TOP (50);
PCT_EMBED_BACKEND (char-ngram-tfidf|llama-cpp-gguf); PCT_EMBED_MODEL_PATH.
"""
import math
import os
import re
import unicodedata

POLICY = 'hybrid-bm25-vector-rrf-rerank-v1'
NGRAMS = (3, 4, 5)
MAX_CHARS = 4000
PROXIMITY_WINDOW = 25


def fold(value):
    text = unicodedata.normalize('NFD', str(value or ''))
    return ''.join(c for c in text if not unicodedata.combining(c)).casefold().replace('ς', 'σ').replace('ſ', 's')


def settings(env=None):
    env = os.environ if env is None else env
    return {'enabled': str(env.get('PCT_HYBRID_RETRIEVAL', '1')).strip().lower() not in ('0', 'false', 'no', 'off'),
            'rrf_k': max(1, int(env.get('PCT_RRF_K', '60'))),
            'rerank_top': max(0, int(env.get('PCT_RERANK_TOP', '50'))),
            'backend': str(env.get('PCT_EMBED_BACKEND', 'char-ngram-tfidf')).strip(),
            'model_path': str(env.get('PCT_EMBED_MODEL_PATH', '')).strip()}


# ------------------------------------------------------------------ vectors
def _grams(text):
    words = re.findall(r'[^\W\d_]{2,}', fold(text)[:MAX_CHARS])
    out = {}
    for w in words:
        w = ' %s ' % w
        for n in NGRAMS:
            for i in range(max(1, len(w) - n + 1)):
                g = w[i:i + n]
                out[g] = out.get(g, 0) + 1
    return out


def char_ngram_vectors(texts):
    grams = [_grams(t) for t in texts]
    n = len(grams) or 1
    df = {}
    for g in grams:
        for k in g:
            df[k] = df.get(k, 0) + 1
    vecs = []
    for g in grams:
        v = {k: (1 + math.log(c)) * math.log(1 + n / df[k]) for k, c in g.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vecs.append({k: x / norm for k, x in v.items()})
    return vecs


def _cos_sparse(a, b):
    if len(a) > len(b):
        a, b = b, a
    return sum(x * b.get(k, 0.0) for k, x in a.items())


def _cos_dense(a, b):
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return sum(x * y for x, y in zip(a, b)) / (na * nb)


def vector_scores(query, texts, cfg, embed_fn=None):
    """(scores, backend_used, note)."""
    if embed_fn is None and cfg['backend'] == 'llama-cpp-gguf':
        if cfg['model_path'] and os.path.isfile(cfg['model_path']):
            try:
                from llama_cpp import Llama
                model = Llama(model_path=cfg['model_path'], embedding=True, verbose=False)
                embed_fn = lambda xs: [model.embed(x[:MAX_CHARS]) for x in xs]
            except Exception as exc:  # noqa: BLE001 - fall back, report why
                note = 'LLAMA_CPP_UNAVAILABLE:' + type(exc).__name__
                return _char(query, texts), 'char-ngram-tfidf', note
        else:
            return _char(query, texts), 'char-ngram-tfidf', 'EMBED_MODEL_PATH_MISSING'
    if embed_fn is not None:
        vecs = embed_fn([query, *texts])
        vecs = [v[0] if v and isinstance(v[0], list) else v for v in vecs]
        return [_cos_dense(vecs[0], v) for v in vecs[1:]], 'custom' if cfg['backend'] != 'llama-cpp-gguf' else 'llama-cpp-gguf', None
    return _char(query, texts), 'char-ngram-tfidf', None


def _char(query, texts):
    vecs = char_ngram_vectors([query, *texts])
    return [_cos_sparse(vecs[0], v) for v in vecs[1:]]


# ---------------------------------------------------------------------- RRF
def rrf(rankings, k=60):
    """Reciprocal Rank Fusion of several orderings of the same ids."""
    score = {}
    for ranking in rankings:
        for r, key in enumerate(ranking):
            score[key] = score.get(key, 0.0) + 1.0 / (k + r + 1)
    first = {key: i for i, key in enumerate(rankings[0])} if rankings else {}
    return sorted(score, key=lambda key: (-score[key], first.get(key, 0), key)), score


# ------------------------------------------------------------------ rerank
def proximity_rerank(text, name_stems, topic_stems, window=None, place=None):
    """Deterministic pair score for (question, excerpt)."""
    words = re.findall(r'[^\W\d_]{2,}', fold(text))
    name_pos = [i for i, w in enumerate(words) if any(w.startswith(s) for s in name_stems)]
    topic_pos = [i for i, w in enumerate(words) if any(w.startswith(s) for s in topic_stems)]
    score, parts = 0.0, {}
    if name_pos and topic_pos:
        gap = min(abs(a - b) for a in name_pos for b in topic_pos)
        parts['name_topic_gap'] = gap
        if gap <= PROXIMITY_WINDOW:
            score += 2.0 * (1 - gap / (PROXIMITY_WINDOW + 1))
    if place is not None:
        parts['place_context'] = place
        score += {'ON_TARGET': 1.0, 'AMBIGUOUS_NO_CONTEXT': -1.5, 'OTHER_PLACE_HOMONYM': -3.0}.get(place, 0.0)
    if window:
        years = [int(y) for y in re.findall(r'(?<!\d)(1[0-9]\d{2})(?!\d)', text)]
        if any(window[0] <= y <= window[1] for y in years):
            score += 0.5; parts['year_in_window'] = True
    return round(score, 6), parts


def fuse(scored, query, name_stems, topic_stems, window=None, place_fn=None, env=None, embed_fn=None, rerank_fn=None):
    """Re-order lexically scored items ({'row','score',...}, best first).

    Items carrying an OTHER_PLACE_HOMONYM reason keep their place at the end."""
    cfg = settings(env)
    if not cfg['enabled'] or len(scored) < 2:
        return scored, {'policy': POLICY, 'applied': False, 'reason': 'DISABLED' if not cfg['enabled'] else 'TOO_FEW'}
    normal = [s for s in scored if not any(r.startswith('OTHER_PLACE_HOMONYM') for r in s.get('reasons', []))]
    homonyms = [s for s in scored if s not in normal]
    ids = [s['row']['evidence_id'] for s in normal]
    vec, backend, note = vector_scores(query, [s['row'].get('text') or '' for s in normal], cfg, embed_fn)
    by_id = {s['row']['evidence_id']: s for s in normal}
    for s, v in zip(normal, vec):
        s['vector'] = round(v, 6)
    vector_order = [s['row']['evidence_id'] for s in sorted(normal, key=lambda s: (-s['vector'], s['index']))]
    fused, rrf_score = rrf([ids, vector_order], cfg['rrf_k'])
    top, rest = fused[:cfg['rerank_top']], fused[cfg['rerank_top']:]
    rr = {}
    for eid in top:
        s = by_id[eid]
        place = place_fn(s['row'].get('text') or '') if place_fn else None
        rr[eid] = (rerank_fn or proximity_rerank)(s['row'].get('text') or '', name_stems, topic_stems, window, place)
    top = sorted(top, key=lambda e: (-(rr[e][0] + 1000 * rrf_score[e]), fused.index(e)))
    order = top + rest
    for eid in order:
        s = by_id[eid]
        s['rrf'] = round(rrf_score[eid], 6)
        if eid in rr:
            s['rerank'], s['rerank_parts'] = rr[eid]
    moved = sum(1 for a, b in zip(ids, order) if a != b)
    report = {'policy': POLICY, 'applied': True, 'vector_backend': backend, 'vector_note': note,
              'neural_embeddings': backend == 'llama-cpp-gguf', 'cross_encoder': 'deterministic-proximity-reranker' if rerank_fn is None else 'custom',
              'rrf_k': cfg['rrf_k'], 'rerank_top': min(cfg['rerank_top'], len(fused)), 'positions_changed': moved,
              'homonyms_kept_last': len(homonyms), 'paid_api_calls': 0}
    return [by_id[e] for e in order] + homonyms, report
