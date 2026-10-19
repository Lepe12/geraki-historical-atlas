"""Live, read-only endpoint inspection. Never publish credentials or cookies."""
import concurrent.futures
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request

ENDPOINTS = {
    'openarchives': ['https://www.openarchives.gr/aggregator/', 'https://www.openarchives.gr/aggregator/search?query=corsair&language=en'],
    'nlg': ['https://digitalcollections.nlg.gr/', 'https://catalogue.nlg.gr/'],
    'anemi': ['https://anemi.lib.uoc.gr/', 'https://anemi.lib.uoc.gr/search.html'],
    'academia': ['https://www.academia.edu/search?q=corsair'],
    'google_books': ['https://www.googleapis.com/books/v1/volumes?q=corsair&maxResults=5'],
    'moreveneto': ['https://asve.arianna4.cloud/', 'https://moreveneto.archiviodistatovenezia.it/'],
    'sias': ['https://sias-archivi.cultura.gov.it/', 'https://sias.archivi.beniculturali.it/'],
    'boa': ['https://katalog.devletarsivleri.gov.tr/'],
    'pares': ['https://pares.cultura.gob.es/ParesBusquedas20/catalogo/find?texto=corsarios', 'https://pares.cultura.gob.es/ParesBusquedas20/catalogo/search'],
    'searchculture': ['https://www.searchculture.gr/aggregator/api/search.json?general_term=%CF%80%CE%B5%CE%B9%CF%81%CE%B1%CF%84%CE%B5%CE%AF%CE%B1&page=1&pageSize=5'],
}

def scrub(value):
    text = str(value)
    for name in ('SEARCHCULTURE_API_KEY', 'PCT_LLM_API_KEY', 'GITHUB_TOKEN'):
        key = os.getenv(name, '')
        if key:
            text = text.replace(key, 'REDACTED')
    return re.sub(r'(?i)(api_?key|access_token|token)=([^&\s]+)', r'\1=REDACTED', text)

def inspect(name, urls, dest):
    results = []
    for index, url in enumerate(urls):
        actual = url
        if name == 'searchculture' and os.getenv('SEARCHCULTURE_API_KEY'):
            actual += '&apiKey=' + urllib.parse.quote(os.environ['SEARCHCULTURE_API_KEY'])
        row = {'url': url, 'method': 'ANONYMOUS_HTTPS_GET' if actual == url else 'API_KEY_HTTPS_GET',
               'request_performed': True, 'http_status': None}
        try:
            req = urllib.request.Request(actual, headers={'User-Agent': 'NABOU-Historical-Research/4.0 (public catalogue inspection)', 'Accept': 'text/html,application/json,application/xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'en,el;q=0.9,it;q=0.8'})
            try:
                response = urllib.request.urlopen(req, timeout=25)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                raw = response.read(1_500_000)
                body = scrub(raw.decode('utf-8', 'replace'))
                row.update(http_status=response.code, final_url=scrub(response.geturl()), content_type=response.headers.get('Content-Type'), response_sha256=hashlib.sha256(raw).hexdigest(), response_bytes=len(raw))
            file = dest / f'{name}-{index}.response.txt'
            file.write_text(body)
            row['response_file'] = str(file)
            row['title'] = re.findall(r'(?is)<title[^>]*>(.*?)</title>', body)[:1]
            row['forms'] = re.findall(r'(?is)<form\b[^>]*>.*?</form>', body)[:5]
            row['scripts'] = re.findall(r'<script[^>]+src=["\']([^"\']+)', body)[:15]
            row['body_excerpt'] = ' '.join(re.sub('<[^>]+>', ' ', body).split())[:1200]
        except Exception as error:
            row.update(error_type=type(error).__name__, error=scrub(str(error)))
        results.append(row)
    return {'connector': name, 'attempts': results}

def model_probe():
    """Check GitHub's existing free inference permission; no paid provider setup."""
    key = os.getenv('GITHUB_TOKEN', '')
    url = 'https://models.github.ai/inference/chat/completions'
    row = {'provider': 'github_models', 'model': 'openai/gpt-4.1-mini', 'endpoint': url, 'http_status': None, 'request_performed': bool(key), 'paid_billing_configuration_changed': False}
    if not key:
        return {**row, 'status': 'TOKEN_NOT_AVAILABLE'}
    payload = {'model': row['model'], 'messages': [{'role': 'user', 'content': 'Return JSON only. Given the supplied quotation "In 1670 the vessel anchored at an unnamed island", extract the date and state whether the island can be identified. Never invent an island name. Keys: date, place, status.'}], 'max_tokens': 200, 'temperature': 0}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.load(response)
            row.update(http_status=response.status, status='COMPLETED', actual_model=data.get('model'), content=data['choices'][0]['message']['content'], usage=data.get('usage'))
    except urllib.error.HTTPError as error:
        row.update(http_status=error.code, status='UNAVAILABLE', error_body=scrub(error.read(1500).decode('utf-8','replace')))
    except Exception as error:
        row.update(status='FAILED', error_type=type(error).__name__)
    return row

def main():
    run = os.getenv('GITHUB_RUN_ID', 'local')
    dest = Path('evidence/engine_validation') / run
    dest.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        checks = list(pool.map(lambda item: inspect(*item, dest), ENDPOINTS.items()))
    report = {'schema': 'nabou-engine-live-probe-v1', 'run_id': run, 'checked_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'source_revision': os.getenv('GITHUB_SHA'), 'connectors': checks, 'semantic_probe': model_probe()}
    (dest / 'endpoint-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'run_id': run, 'connectors': [{ 'connector': c['connector'], 'http_statuses': [a['http_status'] for a in c['attempts']]} for c in checks], 'semantic_probe': report['semantic_probe']},ensure_ascii=False))

if __name__ == '__main__':
    main()
