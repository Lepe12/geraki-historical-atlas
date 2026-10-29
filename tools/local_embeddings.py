"""Local multilingual sentence embeddings for hybrid retrieval (CPU, free).

Model: intfloat/multilingual-e5-small (MIT), ONNX int8 export published as
Xenova/multilingual-e5-small, pinned to an immutable revision and verified by
SHA-256. About 135 MB on disk (118 MB model + 17 MB tokenizer). XLM-R
vocabulary: covers Greek, Latin, Italian and French.

Runtime: onnxruntime + tokenizers only (no torch, no paid API, no network at
inference). If the model directory or either package is missing, the caller
(hybrid_retrieval.py) falls back to character n-gram similarity.

Download (CI cache step, or once by hand):
  python3 tools/local_embeddings.py --download DIR
"""
import argparse
import hashlib
import math
import os
import pathlib
import sys
import urllib.request

MODEL_ID = 'Xenova/multilingual-e5-small'
REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78'
FILES = {
    'onnx/model_quantized.onnx': ('model.onnx', 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193', 118308185),
    'tokenizer.json': ('tokenizer.json', '0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39', 17082730),
}
BACKEND = 'onnx-multilingual-e5-small'
MAX_TOKENS = 256
BATCH = 16


def _sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def model_ready(directory):
    d = pathlib.Path(directory or '')
    return bool(directory) and all((d / local).is_file() and (d / local).stat().st_size == size
                                   for local, _sha, size in FILES.values())


def download(directory):
    d = pathlib.Path(directory)
    d.mkdir(parents=True, exist_ok=True)
    for remote, (local, sha, size) in FILES.items():
        target = d / local
        if target.is_file() and target.stat().st_size == size and _sha256(target) == sha:
            continue
        url = f'https://huggingface.co/{MODEL_ID}/resolve/{REVISION}/{remote}'
        tmp = target.with_suffix(target.suffix + '.part')
        with urllib.request.urlopen(url, timeout=120) as resp, open(tmp, 'wb') as out:
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
        got = _sha256(tmp)
        if got != sha:
            tmp.unlink()
            raise SystemExit(f'SHA256_MISMATCH {remote}')
        tmp.replace(target)
    return d


class E5Embedder:
    """Callable: list[str] -> list[list[float]] (L2-normalised mean pooling).

    The first text is the query ("query: "), the rest are passages
    ("passage: "), as multilingual-e5 expects."""

    def __init__(self, directory, max_tokens=MAX_TOKENS, threads=None):
        import numpy as np
        import onnxruntime as ort
        from tokenizers import Tokenizer
        d = pathlib.Path(directory)
        self.np = np
        self.tok = Tokenizer.from_file(str(d / 'tokenizer.json'))
        self.tok.enable_truncation(max_length=max_tokens)
        self.tok.enable_padding(pad_id=self.tok.token_to_id('<pad>') or 1, pad_token='<pad>')
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = int(threads or min(4, os.cpu_count() or 1))
        opts.inter_op_num_threads = 1
        self.sess = ort.InferenceSession(str(d / 'model.onnx'), opts, providers=['CPUExecutionProvider'])
        self.inputs = {i.name for i in self.sess.get_inputs()}

    def _stable_run(self, feed):
        # onnxruntime's int8 CPU kernels very occasionally return a slightly
        # different result for identical input (seen on the box, ~1 batch in
        # 30). Reproducible reading order matters here, so each batch is run
        # twice; on disagreement a third run decides (element-wise median).
        np = self.np
        a = self.sess.run(None, feed)[0]
        b = self.sess.run(None, feed)[0]
        if np.array_equal(a, b):
            return a
        self.unstable_batches = getattr(self, 'unstable_batches', 0) + 1
        return np.median(np.stack([a, b, self.sess.run(None, feed)[0]]), axis=0)

    def encode(self, texts):
        np = self.np
        out = []
        for start in range(0, len(texts), BATCH):
            enc = self.tok.encode_batch(texts[start:start + BATCH])
            ids = np.array([e.ids for e in enc], dtype=np.int64)
            mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
            feed = {'input_ids': ids, 'attention_mask': mask}
            if 'token_type_ids' in self.inputs:
                feed['token_type_ids'] = np.zeros_like(ids)
            hidden = self._stable_run(feed)
            m = mask[..., None].astype(hidden.dtype)
            pooled = (hidden * m).sum(1) / np.clip(m.sum(1), 1e-9, None)
            pooled /= np.clip(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-12, None)
            out.extend(pooled.tolist())
        return out

    def __call__(self, texts):
        if not texts:
            return []
        return self.encode(['query: ' + texts[0], *('passage: ' + t for t in texts[1:])])


def load(directory):
    """(embedder or None, note)."""
    if not model_ready(directory):
        return None, 'EMBED_MODEL_DIR_MISSING'
    try:
        return E5Embedder(directory), None
    except Exception as exc:  # noqa: BLE001 - caller falls back and reports why
        return None, 'ONNX_EMBEDDER_UNAVAILABLE:' + type(exc).__name__


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--download', metavar='DIR', required=True)
    args = ap.parse_args(argv)
    download(args.download)
    print('EMBED_MODEL_READY', BACKEND, REVISION[:12], 'ok' if model_ready(args.download) else 'incomplete')
    return 0 if model_ready(args.download) else 1


if __name__ == '__main__':
    sys.exit(main())
