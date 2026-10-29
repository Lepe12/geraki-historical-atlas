"""Query plan and PRISMA-S-style search log for lane discovery.

1. Combined Boolean queries: for sources whose query syntax is known to take
   Boolean OR, one query carries all name variants and all lane piracy terms,
   ("Kimolos" OR "Argentière" OR ...) AND (corsaires OR pirates OR ...), run
   first, so a single budgeted call covers what otherwise needs many.
   Only sources listed in OR_SYNTAX get it (default: Internet Archive, whose
   advanced search is Lucene); others can be opted in with PCT_OR_QUERY_SOURCES.
   PCT_OR_QUERIES=0 disables.
2. A search log per lane: for every source, the planned / run / deferred
   (planned but not reached this pass) / not-retried queries, hits, status
   and budget; plus a source register of project datasets and archives that
   are not searched automatically (with the reason) and a request list of
   login-only or key-only sources for the historian. Queries are never
   deleted: deferred ones stay in the queue for the next pass.
"""
import json
import os
from pathlib import Path

POLICY = 'prisma-s-query-plan-v1'
MAX_QUERY_CHARS = 900
OR_SYNTAX = {'Internet Archive': {'or': ' OR ', 'and': ' AND ', 'quote': '"', 'basis': 'Lucene syntax of archive.org advancedsearch'}}
REGISTER = Path(__file__).resolve().parents[1] / 'data/research_sources/source_register.v1.json'
NEEDS_HUMAN = ('API_KEY_REQUIRED', 'AUTH_OR_BROWSER_REQUIRED', 'ACCESS_BLOCKED', 'REMOTE_ACCESS_BLOCKED', 'REMOTE_RATE_LIMITED')


def or_sources(env=None):
    env = os.environ if env is None else env
    if str(env.get('PCT_OR_QUERIES', '1')).strip().lower() in ('0', 'false', 'off', 'no'):
        return {}
    extra = [s.strip() for s in str(env.get('PCT_OR_QUERY_SOURCES', '')).split(',') if s.strip()]
    out = dict(OR_SYNTAX)
    for s in extra:
        out.setdefault(s, {'or': ' OR ', 'and': ' AND ', 'quote': '"', 'basis': 'PCT_OR_QUERY_SOURCES opt-in'})
    return out


def _group(items, syntax, quote):
    q = syntax['quote'] if quote else ''
    parts = [q + i.replace(syntax['quote'], '') + q for i in items]
    return '(' + syntax['or'].join(parts) + ')' if len(parts) > 1 else parts[0]


def combined_queries(names, topic_terms, syntax, max_chars=MAX_QUERY_CHARS):
    """All names OR-ed, AND all topic terms OR-ed; split into several queries
    only when one would exceed max_chars. Names only when no topic terms."""
    names = [n for n in dict.fromkeys(str(n).strip() for n in names) if n and not n.startswith('__')]
    topic_terms = [t for t in dict.fromkeys(str(t).strip() for t in topic_terms) if t]
    if not names:
        return []
    topic = _group(topic_terms, syntax, quote=False) if topic_terms else ''
    room = max_chars - len(topic) - len(syntax['and']) - 2
    chunks, cur = [], []
    for n in names:
        trial = cur + [n]
        if cur and len(_group(trial, syntax, True)) > room:
            chunks.append(cur); cur = [n]
        else:
            cur = trial
    if cur:
        chunks.append(cur)
    return [(_group(c, syntax, True) + (syntax['and'] + topic if topic else '')) for c in chunks]


def with_combined_first(repo_name, repo_terms, names, topic_terms, env=None):
    """(queries, plan_note). Combined OR queries go first for OR-capable sources."""
    syntax = or_sources(env).get(repo_name)
    if not syntax:
        return list(repo_terms), {'combined_or': False}
    combo = combined_queries(names, topic_terms, syntax)
    return list(dict.fromkeys(combo + list(repo_terms))), {'combined_or': True, 'syntax_basis': syntax['basis'],
                                                           'combined_queries': combo}


def search_log(lane, attempts, planned, notes, budget_seconds, rounds_per_pass, register_path=REGISTER):
    """PRISMA-S-style log: what was planned, run, deferred, and why."""
    sources = []
    for a, plan in zip(attempts, planned):
        ran = [q['query'] for q in a.get('queries', [])]
        deferred = list(a.get('deferred_queries') or [])
        not_retried = list(a.get('remaining_queries_not_retried') or [])
        sources.append({'source': a['repository'], 'base_url': a.get('base_url'), 'status': a.get('status'),
                        'planned': len(plan), 'run': len(ran), 'deferred_to_next_pass': len(deferred),
                        'not_retried_after_block': len(not_retried), 'hits': a.get('hits', 0),
                        'queries_run': [{'query': q['query'], 'status': q['status'], 'hits': q.get('hits', 0)} for q in a.get('queries', [])],
                        **notes.get(a['repository'], {})})
    try:
        register = json.loads(Path(register_path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        register = {'sources': []}
    requests = [{'source': s['source'], 'status': s['status'], 'why': 'login, key or browser step needed; ask the historian or the archive'}
                for s in sources if s['status'] in NEEDS_HUMAN]
    requests += [{'source': r['name'], 'status': r['status'], 'why': r.get('why', '')} for r in register.get('sources', [])
                 if r.get('status') in ('LOGIN_ONLY', 'REQUEST_ACCESS')]
    return {'policy': POLICY, 'lane': lane, 'role': 'AUDIT_LOG_NOT_EVIDENCE',
            'budget': {'seconds': budget_seconds, 'rounds_per_pass': rounds_per_pass},
            'totals': {k: sum(s[k] for s in sources) for k in ('planned', 'run', 'deferred_to_next_pass', 'not_retried_after_block', 'hits')},
            'sources': sources,
            'not_searched_automatically': [r for r in register.get('sources', []) if lane in r.get('lanes', [lane])],
            'access_requests_for_historian': requests, 'deleted_queries': 0}
