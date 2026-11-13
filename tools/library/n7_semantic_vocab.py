#!/usr/bin/env python3
"""N7_HYBRID_SEARCH_V1: vocabulary for query vectors (offline only).

Folded key -> [surface form to encode, weight]. Words come from the library pages themselves plus the
most frequent Greek and English words (wordfreq), so Greek questions about non-Greek books still map.
Weight = 7 - Zipf frequency (min 0.05): frequent function words contribute little.
Usage: n7_semantic_vocab.py PAGES.jsonl OUT.json [--greek N] [--english N]
"""
import argparse, json, re, unicodedata
from wordfreq import top_n_list, zipf_frequency

WORD = re.compile(r"[^\W\d_]{2,}")

def fold(s):
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').replace('ς', 'σ')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pages'); ap.add_argument('out')
    ap.add_argument('--greek', type=int, default=60000); ap.add_argument('--english', type=int, default=40000)
    a = ap.parse_args()
    vocab = {}
    for w in top_n_list('el', a.greek) + top_n_list('en', a.english):
        if WORD.fullmatch(w): vocab.setdefault(fold(w), w)
    with open(a.pages, encoding='utf-8') as f:
        for line in f:
            if line.strip():
                for w in WORD.findall(json.loads(line)['text']): vocab.setdefault(fold(w), w.lower())
    out = {k: [w, round(max(0.05, 7 - max(zipf_frequency(w, 'el'), zipf_frequency(w, 'en'))), 3)] for k, w in vocab.items()}
    with open(a.out, 'w', encoding='utf-8') as f: json.dump(out, f, ensure_ascii=False)
    print(json.dumps({'status': 'N7_SEMANTIC_VOCAB_BUILT', 'words': len(out)}))

if __name__ == '__main__':
    main()
