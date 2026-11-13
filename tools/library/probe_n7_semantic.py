#!/usr/bin/env python3
"""N7_HYBRID_SEARCH_V1: read-only production check after installation.

Sends real historical questions through the existing signed library bridge and reports, per question,
how many results came from lexical / semantic retrieval with title and printed page, and checks the
public model file and that the authenticated index route refuses anonymous access.
"""
import hashlib, json, sys, time, urllib.error, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from n7_semantic_fetch_pages import post
from import_gutenberg_public_domain import ftp_key

QUESTIONS = ['Πώς ζούσαν οι σκλάβοι κωπηλάτες στις γαλέρες;', 'Πού κρατούσαν τους χριστιανούς αιχμαλώτους στο Αλγέρι;',
             'Η ναυμαχία της Ναυπάκτου το 1571', 'Κέρκυρα', 'Stampalia']

def main():
    key = ftp_key(); report = []
    for q in QUESTIONS:
        t = time.time(); status, data = post(key, 'search', {'query': q}); ms = round((time.time() - t) * 1000)
        if status != 200: raise SystemExit(f'SEARCH_HTTP_{status}')
        m = data['matches']
        report.append({'query': q, 'ms': ms, 'results': len(m),
                       'semantic': sum('semantic' in str(x.get('retrieval', '')) for x in m),
                       'top': [(x.get('title', '')[:50], x.get('printed_page'), x.get('retrieval')) for x in m[:3]]})
    spec = json.loads((Path(__file__).resolve().parents[1] / 'n7' / 'semantic-model.json').read_text())
    with urllib.request.urlopen('https://bot.piratecartography.com/n7-model/transformers.min.js', timeout=30) as r:
        model_ok = hashlib.sha256(r.read()).hexdigest() == spec['files']['transformers.min.js']['sha256']
    types = {}
    for rel in ('ort/ort-wasm-simd-threaded.jsep.mjs', 'ort/ort-wasm-simd-threaded.jsep.wasm'):
        req = urllib.request.Request('https://bot.piratecartography.com/n7-model/' + rel, method='HEAD')
        with urllib.request.urlopen(req, timeout=30) as r: types[rel] = r.headers.get('Content-Type', '')
    mime_ok = 'javascript' in types['ort/ort-wasm-simd-threaded.jsep.mjs'] and 'wasm' in types['ort/ort-wasm-simd-threaded.jsep.wasm']
    try:
        urllib.request.urlopen('https://bot.piratecartography.com/api/library/semantic/manifest.json', timeout=20); index_private = False
    except urllib.error.HTTPError as e:
        index_private = e.code == 401
    print(json.dumps({'questions': report, 'public_runtime_file_verified': model_ok, 'mime_types': types, 'mime_ok': mime_ok, 'index_requires_login': index_private}, ensure_ascii=False, indent=1))
    if not any(r['semantic'] for r in report[:3]): raise SystemExit('SEMANTIC_RESULTS_MISSING')

if __name__ == '__main__':
    main()
