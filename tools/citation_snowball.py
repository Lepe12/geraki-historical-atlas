"""Citation chaining (snowballing) from an expert seed bibliography.

Seeds come only from data/research_seeds/seed_bibliography.v1.json, filled by
the historian. For each seed: backward chaining (works it references) and
forward chaining (works citing it) through the public OpenAlex API, with the
Semantic Scholar Graph API as fallback. No key needed; OPENALEX_API_KEY and
PCT_OPENALEX_MAILTO are used if set (never logged). A 429/403 is recorded as
RATE_LIMITED/BLOCKED and the run stops for that source; it is never bypassed.

Every candidate is kept, with the seed and relation that produced it and the
request terms it matches; matching is a reading priority, not a verdict.

  python3 tools/citation_snowball.py --request request.json --out snowball.json
"""
import argparse
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEEDS = ROOT / 'data/research_seeds/seed_bibliography.v1.json'
OPENALEX = 'https://api.openalex.org'
S2 = 'https://api.semanticscholar.org/graph/v1'
POLICY = 'seed-citation-chaining-v1'
TITLE_MATCH = 0.9


class SourceStop(Exception):
    def __init__(self, status):
        super().__init__(status); self.status = status


def fold(v):
    t = unicodedata.normalize('NFD', str(v or ''))
    return ''.join(c for c in t if not unicodedata.combining(c)).casefold().replace('ς', 'σ')


def words(v):
    return re.findall(r'[^\W_]+', fold(v))


def similarity(a, b):
    a, b = set(words(a)), set(words(b))
    return len(a & b) / max(len(a | b), 1)


def http_get(url, timeout=30):
    req = urllib.request.Request(url, headers={'User-Agent': 'NABOU-research/1.0 (citation chaining)'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            raise SourceStop('RATE_LIMITED')
        if exc.code in (401, 403):
            raise SourceStop('BLOCKED_%d' % exc.code)
        if exc.code == 404:
            return None
        raise SourceStop('HTTP_%d' % exc.code)
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise SourceStop('UNREACHABLE:' + type(exc).__name__)


class OpenAlex:
    name = 'openalex'

    def __init__(self, get=http_get, env=None):
        env = os.environ if env is None else env
        self.get, self.extra = get, {}
        if env.get('PCT_OPENALEX_MAILTO'):
            self.extra['mailto'] = env['PCT_OPENALEX_MAILTO']
        if env.get('OPENALEX_API_KEY'):
            self.extra['api_key'] = env['OPENALEX_API_KEY']

    def url(self, path, **params):
        params.update(self.extra)
        return OPENALEX + path + ('?' + urllib.parse.urlencode(params) if params else '')

    @staticmethod
    def work(w):
        return {'id': (w.get('id') or '').rsplit('/', 1)[-1], 'title': w.get('display_name') or w.get('title'),
                'year': w.get('publication_year'), 'doi': (w.get('doi') or '').replace('https://doi.org/', '') or None,
                'authors': [a.get('author', {}).get('display_name') for a in w.get('authorships', [])][:6],
                'url': w.get('id'), 'references': [r.rsplit('/', 1)[-1] for r in w.get('referenced_works', [])]}

    def resolve(self, seed):
        if seed.get('openalex'):
            w = self.get(self.url('/works/' + seed['openalex']))
            return self.work(w) if w else None
        if seed.get('doi'):
            w = self.get(self.url('/works/doi:' + seed['doi']))
            return self.work(w) if w else None
        params = {'search': seed['title'], 'per-page': 10}
        if seed.get('year'):
            params['filter'] = 'publication_year:%s' % seed['year']
        res = (self.get(self.url('/works', **params)) or {}).get('results', [])
        return exact_title(seed, [self.work(w) for w in res])

    def backward(self, work, limit):
        ids, out = work['references'][:limit], []
        for i in range(0, len(ids), 50):
            res = self.get(self.url('/works', filter='openalex_id:' + '|'.join(ids[i:i + 50]), **{'per-page': 50}))
            out += [self.work(w) for w in (res or {}).get('results', [])]
        return out

    def forward(self, work, limit):
        res = self.get(self.url('/works', filter='cites:' + work['id'], **{'per-page': min(200, limit)}))
        return [self.work(w) for w in (res or {}).get('results', [])][:limit]


class SemanticScholar:
    name = 'semantic_scholar'
    FIELDS = 'title,year,externalIds,authors,url'

    def __init__(self, get=http_get):
        self.get = get

    @staticmethod
    def work(p):
        ext = p.get('externalIds') or {}
        return {'id': p.get('paperId'), 'title': p.get('title'), 'year': p.get('year'), 'doi': ext.get('DOI'),
                'authors': [a.get('name') for a in p.get('authors') or []][:6], 'url': p.get('url'), 'references': []}

    def resolve(self, seed):
        if seed.get('doi'):
            p = self.get('%s/paper/DOI:%s?fields=%s' % (S2, urllib.parse.quote(seed['doi']), self.FIELDS))
            return self.work(p) if p else None
        q = urllib.parse.urlencode({'query': seed['title'], 'limit': 10, 'fields': self.FIELDS})
        res = (self.get('%s/paper/search?%s' % (S2, q)) or {}).get('data', [])
        return exact_title(seed, [self.work(p) for p in res])

    def _edges(self, work, kind, key, limit):
        res = self.get('%s/paper/%s/%s?fields=%s&limit=%d' % (S2, work['id'], kind, self.FIELDS, min(limit, 1000)))
        return [self.work(e[key]) for e in (res or {}).get('data', []) if e.get(key)]

    def backward(self, work, limit):
        return self._edges(work, 'references', 'citedPaper', limit)

    def forward(self, work, limit):
        return self._edges(work, 'citations', 'citingPaper', limit)


def exact_title(seed, works):
    """Only a near-exact title (and author surname, year if given) counts."""
    best = None
    for w in works:
        if similarity(seed['title'], w['title']) < TITLE_MATCH:
            continue
        if seed.get('author') and not any(fold(seed['author']).split()[-1] in fold(a) for a in w['authors'] if a):
            continue
        if seed.get('year') and w.get('year') and abs(int(seed['year']) - int(w['year'])) > 1:
            continue
        best = best or w
    return best


def request_terms(request):
    terms = [request.get('target', ''), *(request.get('aliases') or []), *(request.get('search_name_variants') or [])]
    try:
        from search_priority import search_name_variants
        terms += search_name_variants(request.get('target', ''), request.get('aliases') or [])
    except Exception:  # noqa: BLE001 - variants are optional here
        pass
    topic = ['pirat', 'corsai', 'corsar', 'korsan', 'πειρατ', 'κουρσ', 'levant', 'archipel']
    return sorted({fold(t) for t in terms if isinstance(t, str) and len(t.strip()) >= 3}), topic


def snowball(seeds, request=None, sources=None, max_back=200, max_forward=200, pause=0.2):
    request = request or {}
    names, topic = request_terms(request)
    report = {'policy': POLICY, 'role': 'CANDIDATE_LEADS_NOT_EVIDENCE', 'seeds_total': len(seeds),
              'seed_file': str(SEEDS.relative_to(ROOT)), 'seeds': [], 'source_status': {}, 'candidates': [], 'deleted': 0}
    if not seeds:
        report['status'] = 'NO_SEEDS_PROVIDED'
        report['note'] = 'Fill data/research_seeds/seed_bibliography.v1.json (seeds chosen by the historian).'
        return report
    sources = sources or [OpenAlex(), SemanticScholar()]
    seen = {}
    for seed in seeds:
        entry = {'seed': {k: seed.get(k) for k in ('doi', 'openalex', 'title', 'author', 'year')}, 'status': 'UNRESOLVED'}
        for src in sources:
            if report['source_status'].get(src.name, 'OK') != 'OK':
                continue
            try:
                work = src.resolve(seed)
                if not work:
                    continue
                entry.update(status='RESOLVED', source=src.name, work={k: work[k] for k in ('id', 'title', 'year', 'doi')})
                for relation, fn, limit in (('REFERENCED_BY_SEED', src.backward, max_back), ('CITES_SEED', src.forward, max_forward)):
                    found = fn(work, limit)
                    entry[relation.lower()] = len(found)
                    for w in found:
                        key = (w.get('doi') or '').lower() or fold(w.get('title'))
                        if not key:
                            continue
                        c = seen.get(key)
                        if not c:
                            text = fold(' '.join(filter(None, [w.get('title') or ''])))
                            hits = [t for t in names if t in text] + [t for t in topic if t in text]
                            c = seen[key] = {**{k: w.get(k) for k in ('title', 'year', 'doi', 'authors', 'url')},
                                             'source': src.name, 'source_id': w.get('id'), 'via': [],
                                             'matched_request_terms': hits,
                                             'reading_priority': 'MATCHES_REQUEST' if hits else 'NO_TERM_MATCH_IN_TITLE'}
                        c['via'].append({'seed': work['title'], 'relation': relation})
                    time.sleep(pause)
                break
            except SourceStop as stop:
                report['source_status'][src.name] = stop.status
        report['seeds'].append(entry)
    cands = list(seen.values())
    cands.sort(key=lambda c: (c['reading_priority'] != 'MATCHES_REQUEST', -len(c['via']), str(c['title'])))
    report['candidates'] = cands
    report['status'] = 'OK' if any(s['status'] == 'RESOLVED' for s in report['seeds']) else 'NO_SEED_RESOLVED'
    report['counts'] = {'resolved_seeds': sum(s['status'] == 'RESOLVED' for s in report['seeds']), 'candidates': len(cands),
                        'matching_request': sum(c['reading_priority'] == 'MATCHES_REQUEST' for c in cands)}
    return report


def as_discovery_candidates(report):
    """Same shape as repository discovery rows, for the acquisition queue."""
    return [{'repository': 'Citation chain (%s)' % c['source'], 'discovery_repository': 'citation_snowball',
             'identifier': c.get('doi') or c.get('source_id'), 'title': c.get('title'), 'date': c.get('year'),
             'url': ('https://doi.org/' + c['doi']) if c.get('doi') else c.get('url'),
             'snowball_via': c['via'], 'snowball_priority': c['reading_priority']} for c in report.get('candidates', [])]


def load_seeds(path=SEEDS, topic=None):
    seeds = json.loads(Path(path).read_text(encoding='utf-8')).get('seeds', [])
    seeds = [s for s in seeds if isinstance(s, dict) and (s.get('doi') or s.get('openalex') or s.get('title'))]
    if topic:
        seeds = [s for s in seeds if not s.get('topics') or any(fold(topic) in fold(t) or fold(t) in fold(topic) for t in s['topics'])]
    return seeds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seeds', default=str(SEEDS))
    ap.add_argument('--request')
    ap.add_argument('--out', required=True)
    ap.add_argument('--topic', help='only seeds whose topics match (seeds without topics always count)')
    ap.add_argument('--max-back', type=int, default=200)
    ap.add_argument('--max-forward', type=int, default=200)
    a = ap.parse_args()
    request = json.loads(Path(a.request).read_text()) if a.request else {}
    report = snowball(load_seeds(a.seeds, a.topic), request, max_back=a.max_back, max_forward=a.max_forward)
    report['discovery_candidates'] = as_discovery_candidates(report)
    Path(a.out).write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n')
    print(report['status'], report.get('counts', {}), report['source_status'])


if __name__ == '__main__':
    main()
