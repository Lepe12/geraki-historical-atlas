#!/usr/bin/env python3
"""N7_HYBRID_SEARCH_V1: read library pages for OFFLINE indexing through the existing signed bridge.

Only the existing routes are used: POST n7/library/search (to discover source ids) and POST
n7/library/page (to read each page). Nothing is written to the library. Output JSONL records
{source_id, scan_index, text}; a record is kept only if sha256(text) equals the stored text_sha256.
Coverage is checked against the source_count the library itself reports; an incomplete discovery
fails unless --allow-partial is given. Page text stays in the runner; only vectors are deployed.
Usage: n7_semantic_fetch_pages.py OUT.jsonl [--allow-partial]
Env: PCT_FTPS_HOST/USER/PASSWORD[/PORT/TLS_SERVER_NAME] (to read the signing key, as the importer does)
"""
import argparse, hashlib, hmac, json, sys, time, urllib.error, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_gutenberg_public_domain import ftp_key  # same key retrieval as the reviewed importer

ENDPOINT = 'https://pct-live.piratecartography.com/pct-api/live/n7/library/'
# Frequent words in the library's languages: each search returns at most 30 pages, so many probes.
PROBES = ('the and of to in that was with his for from by they were this which had as not at '
          'και του της την το τα των στο στην με για από που ήταν ως δεν οι ο η '
          'di che la il per non della del de la el los que en y les des le et du une est '
          'ship ships fleet island galleys sea corsairs Turks Venice Algiers Malta king pope').split()

def post(key, kind, obj):
    body = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
    ts = str(int(time.time()))
    mac = hmac.new(key, ts.encode() + b'.' + body, hashlib.sha256).hexdigest()
    req = urllib.request.Request(ENDPOINT + kind, data=body, method='POST', headers={
        'Content-Type': 'application/json', 'X-N7-Library-Ts': ts, 'X-N7-Library-Signature': mac,
        'User-Agent': 'N7-Semantic-Index/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read(3_000_000))
    except urllib.error.HTTPError as e:
        return e.code, None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('--allow-partial', action='store_true')
    ap.add_argument('--max-gap', type=int, default=30)
    a = ap.parse_args()
    key = ftp_key()
    sources, reported = set(), None
    for word in (w for w in PROBES if 2 <= len(w) <= 150):  # the library rejects shorter queries
        status, data = post(key, 'search', {'query': word})
        if status == 400: continue
        if status != 200 or not data: raise SystemExit(f'SEARCH_FAILED_{status}')
        reported = data.get('source_count', reported)
        sources.update(m['source_id'] for m in data.get('matches', []))
    print(json.dumps({'discovered_sources': len(sources), 'reported_sources': reported}))
    if reported is not None and len(sources) < reported and not a.allow_partial:
        raise SystemExit('INCOMPLETE_SOURCE_DISCOVERY: rerun with more probes or --allow-partial')
    pages = skipped = 0
    with open(a.out, 'w', encoding='utf-8') as out:
        for sid in sorted(sources):
            scan, gap = 1, 0
            while gap < a.max_gap:
                status, data = post(key, 'page', {'source_id': sid, 'scan_index': scan})
                scan += 1
                if status == 404: gap += 1; continue
                if status != 200 or not data: raise SystemExit(f'PAGE_FAILED_{status}')
                gap = 0
                p = data['page']; text = p.get('ocr_text') or ''
                if not text.strip() or hashlib.sha256(text.encode()).hexdigest() != p.get('text_sha256'):
                    skipped += 1; continue
                out.write(json.dumps({'source_id': sid, 'scan_index': p['scan_index'], 'text': text}, ensure_ascii=False) + '\n')
                pages += 1
    print(json.dumps({'status': 'N7_SEMANTIC_PAGES_FETCHED', 'sources': len(sources), 'pages': pages, 'skipped_empty_or_unverified': skipped}))

if __name__ == '__main__':
    main()
