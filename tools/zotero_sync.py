#!/usr/bin/env python3
"""Export the sources NABOU//X cites in its published research outputs to Zotero.

Reads ``command-center/live/index.json`` and the run snapshots it lists. A source
counts as *cited* only when it appears in ``source_occurrences`` of a claim in
``research_answer.claims`` or ``evidence_package.assertions``. Discovered but
uncited sources are not exported.

Rules:
* Default mode is a dry run. Nothing is written unless ``--apply`` is given.
  A dry run with credentials only performs GET requests, to tell new items
  from existing ones.
* Metadata is copied from NABOU only. Fields NABOU does not have stay empty;
  nothing is guessed (creators are never split, dates are never completed).
* Each Zotero item carries a stable ``NABOU-source-id: ...`` line in ``extra``
  and each citation note a ``NABOU-citation-id: ...`` line, so reruns create
  nothing twice. Existing items are never overwritten; at most a missing case
  sub-collection is added to them.
* Items go into the collection ``NABOU//X`` and one sub-collection per case
  (the run's mission target, verbatim).

The API key is read from ZOTERO_API_KEY and is never printed or written.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

API = 'https://api.zotero.org'
ROOT_COLLECTION = 'NABOU//X'
SOURCE_MARK = 'NABOU-source-id'
CITATION_MARK = 'NABOU-citation-id'
SCHEMA = 'nabou-zotero-sync-v1'
BATCH = 50
# Connector / index labels that are not a holding repository or archive.
NOT_A_REPOSITORY = {'iiif', 'openalex scholarly works'}
EVIDENCE_URL = 'https://github.com/Lepe12/geraki-historical-atlas/tree/main/evidence/runs/{}'


# ---------------------------------------------------------------- extraction
def _values(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [v for v in value if v not in (None, '', [], {})]
    if value == '':
        return []
    return [value]


def clean_date(value):
    """Return NABOU's date as text, without completing or inventing parts."""
    vals = _values(value)
    if not vals:
        return ''
    text = str(vals[0]).strip()
    # Catalogue placeholders such as 1890-01-01T00:00:00Z only carry a year.
    m = re.fullmatch(r'(\d{4})-01-01(?:T00:00:00Z?)?', text)
    if m:
        return m.group(1)
    m = re.fullmatch(r'(\d{4}-\d{2}-\d{2})T[0-9:.]+Z?', text)
    if m:
        return m.group(1)
    return text


def clean_creators(value):
    kept, dropped = [], []
    for raw in _values(value):
        name = re.sub(r'\s+', ' ', str(raw)).strip()
        if not name:
            continue
        if re.match(r'(?i)https?://', name):
            dropped.append(name)
            continue
        kept.append(name)
    return kept, dropped


def clean_repository(value):
    text = re.sub(r'\s+Full Text$', '', str(value or '').strip())
    if not text or text.lower() in NOT_A_REPOSITORY:
        return ''
    return text


def source_key(url, title=''):
    """Stable identity of a cited source (work level, not page level)."""
    url = (url or '').strip()
    if url:
        parts = urllib.parse.urlsplit(url)
        host = parts.netloc.lower()
        if host.startswith('www.'):
            host = host[4:]
        if host == 'archive.org' or host.endswith('.archive.org'):
            m = re.match(r'/(?:details|download|stream|embed)/([^/?#]+)', parts.path)
            if m:
                return 'archive.org:' + m.group(1)
        if 'digitale-sammlungen.de' in host:
            m = re.search(r'(bsb\d{8})', parts.path)
            if m:
                return 'bsb:' + m.group(1)
        path = re.sub(r'/{2,}', '/', parts.path)
        return 'url:' + urllib.parse.urlunsplit((parts.scheme.lower(), host, path, parts.query, ''))
    if title:
        norm = re.sub(r'\s+', ' ', title).strip().lower()
        return 'title:' + hashlib.sha256(norm.encode('utf-8')).hexdigest()[:20]
    return ''


def occurrence_metadata(occ, pkg_source=None, discovery=None):
    ob = occ.get('source_bibliography') or {}
    pb = (pkg_source or {}).get('bibliography') or {}
    db = (discovery or {}).get('bibliography') or {}
    creators, dropped = clean_creators(ob.get('creator'))
    if not creators and not dropped:
        creators, dropped = clean_creators(pb.get('creators'))
    if not creators and not dropped:
        creators, dropped = clean_creators(db.get('creators'))
    date = clean_date(ob.get('date')) or clean_date(pb.get('publication_date')) or clean_date(db.get('publication_date'))
    first = lambda *vals: next((str(v).strip() for v in vals if v not in (None, '', [], {})), '')
    url = first(occ.get('url'), pb.get('url'), db.get('url'))
    doi = first(pb.get('doi'), db.get('doi'))
    m = re.match(r'(?i)https?://(?:dx\.)?doi\.org/(10\.[^?#\s]+)$', url)
    if not doi and m:
        doi = urllib.parse.unquote(m.group(1))  # the DOI is literally in NABOU's URL
    return {
        'title': first(occ.get('title'), pb.get('title'), db.get('title')),
        'creators': creators,
        'dropped_creators': dropped,
        'date': date,
        'url': url,
        'archive': first(pb.get('archive'), db.get('archive')) or clean_repository((discovery or {}).get('repository')),
        'call_number': first(pb.get('call_number'), db.get('call_number')),
        'container_title': first(pb.get('container_title'), db.get('container_title')),
        'doi': doi,
        'rights': first(ob.get('rights')),
    }


def _page(occ):
    loc = occ.get('locator') or {}
    return {
        'url': loc.get('url') or occ.get('url') or '',
        'printed_page': loc.get('printed_page'),
        'scan_indexes_0_based': list(loc.get('scan_indexes_0_based') or []),
        'pdf_pages_1_based': list(occ.get('pdf_pages_1_based') or []),
        'start_line': loc.get('start_line'),
        'end_line': loc.get('end_line'),
    }


def run_citations(run):
    """Yield one record per cited source occurrence in a published run."""
    mission = run.get('mission') or {}
    case = str(mission.get('target') or run.get('target') or 'Unspecified case').strip()
    run_id = str(run.get('run_id') or '')
    ep = run.get('evidence_package') or {}
    ra = run.get('research_answer') or {}
    passage_source = {p.get('passage_id'): p.get('source_id') for p in ep.get('passages') or [] if p.get('passage_id')}
    sources = {s.get('source_id'): s for s in ep.get('sources') or [] if s.get('source_id')}
    discoveries = {d.get('finding_id'): d for d in run.get('discoveries') or [] if d.get('finding_id')}
    synth = ra.get('synthesis_coverage') or {}
    fidelity_held = set(synth.get('fidelity_held_claim_ids') or [])
    relevance_held = set(synth.get('relevance_held_claim_ids') or [])
    for origin, claims in (('research_answer.claims', ra.get('claims')), ('evidence_package.assertions', ep.get('assertions'))):
        for claim in claims or []:
            claim_id = str(claim.get('claim_id') or '')
            holds = []
            if claim.get('fidelity_hold') or claim_id in fidelity_held:
                holds.append('fidelity_hold')
            if claim.get('relevance_hold') or claim_id in relevance_held:
                holds.append('relevance_hold')
            for occ in claim.get('source_occurrences') or []:
                pkg = sources.get(passage_source.get(f"{occ.get('lane')}:{occ.get('finding_id')}"))
                disc = discoveries.get(occ.get('finding_id'))
                meta = occurrence_metadata(occ, pkg, disc)
                key = source_key(meta['url'], meta['title'])
                if not key:
                    continue
                yield {
                    'case': case, 'run_id': run_id, 'claim_id': claim_id, 'origin': origin,
                    'statement': claim.get('statement') or '', 'quote': claim.get('quote') or '',
                    'verified': bool(claim.get('verified')), 'holds': holds,
                    'relevance_status': claim.get('relevance_status') or '',
                    'source_key': key, 'meta': meta, 'page': _page(occ),
                    'reported_archival_reference': ((occ.get('reported_archival_reference') or {}).get('display') or ''),
                }


def _richness(meta):
    return sum(1 for k in ('title', 'creators', 'date', 'url', 'archive', 'call_number', 'container_title', 'doi') if meta.get(k))


def merge_metadata(metas):
    ordered = sorted(metas, key=lambda m: (-_richness(m), json.dumps(m, sort_keys=True, ensure_ascii=False)))
    merged = dict(ordered[0])
    for other in ordered[1:]:
        for k, v in other.items():
            if not merged.get(k) and v:
                merged[k] = v
    return merged


def collect_sources(live_dir, cases=None, run_ids=None):
    live = Path(live_dir)
    index = json.loads((live / 'index.json').read_text(encoding='utf-8'))
    wanted_cases = set(cases or [])
    wanted_runs = set(str(r) for r in run_ids or [])
    works, skipped = {}, []
    for entry in index.get('runs') or []:
        run_id = str(entry.get('run_id') or '')
        if wanted_runs and run_id not in wanted_runs:
            continue
        if wanted_cases and str(entry.get('target') or '').strip() not in wanted_cases:
            continue
        path = live / 'runs' / f'{run_id}.json'
        if not path.exists():
            skipped.append(run_id)
            continue
        run = json.loads(path.read_text(encoding='utf-8'))
        for cit in run_citations(run):
            if wanted_cases and cit['case'] not in wanted_cases:
                continue
            work = works.setdefault(cit['source_key'], {'source_key': cit['source_key'], 'metas': [], 'cases': set(), 'citations': {}})
            work['metas'].append(cit['meta'])
            work['cases'].add(cit['case'])
            cid = citation_id(cit['run_id'], cit['claim_id'], cit['source_key'])
            entry_c = work['citations'].setdefault(cid, {k: cit[k] for k in ('case', 'run_id', 'claim_id', 'statement', 'quote', 'verified', 'holds', 'relevance_status')} | {'citation_id': cid, 'origins': [], 'pages': [], 'reported_archival_references': []})
            if cit['origin'] not in entry_c['origins']:
                entry_c['origins'].append(cit['origin'])
            if cit['page'] not in entry_c['pages']:
                entry_c['pages'].append(cit['page'])
            ref = cit['reported_archival_reference']
            if ref and ref not in entry_c['reported_archival_references']:
                entry_c['reported_archival_references'].append(ref)
    for work in works.values():
        work['meta'] = merge_metadata(work.pop('metas'))
        work['cases'] = sorted(work['cases'])
    return dict(sorted(works.items())), skipped


def citation_id(run_id, claim_id, key):
    return f"{run_id}/{claim_id}/{hashlib.sha256(key.encode('utf-8')).hexdigest()[:12]}"


def thin_reasons(meta):
    reasons = []
    if not meta.get('title'):
        reasons.append('no title')
    elif meta['title'].lower().startswith('linked document:'):
        reasons.append('title is a placeholder (Linked document: URL)')
    if not meta.get('creators'):
        reasons.append('no creator')
    if not meta.get('date'):
        reasons.append('no date')
    if not meta.get('archive') and not meta.get('url'):
        reasons.append('no repository and no URL')
    if meta.get('dropped_creators'):
        reasons.append('creator field was a URL (left empty)')
    return reasons


# ----------------------------------------------------------------- mapping
def item_type(meta):
    if meta.get('doi') or meta.get('container_title'):
        return 'journalArticle'
    if meta.get('call_number'):
        return 'manuscript'
    return 'document'


def zotero_item(work, collection_keys):
    meta = work['meta']
    kind = item_type(meta)
    item = {
        'itemType': kind,
        'title': meta.get('title') or '',
        'creators': [{'creatorType': 'author', 'name': n} for n in meta.get('creators') or []],
        'date': meta.get('date') or '',
        'url': meta.get('url') or '',
        'archive': meta.get('archive') or '',
        'callNumber': meta.get('call_number') or '',
        'rights': meta.get('rights') or '',
        'extra': f"{SOURCE_MARK}: {work['source_key']}\nNABOU-metadata: copied from NABOU//X published outputs; not checked against the original",
        'tags': [{'tag': 'NABOU//X'}, {'tag': 'unverified'}],
        'collections': list(collection_keys),
    }
    if kind == 'journalArticle':
        item['publicationTitle'] = meta.get('container_title') or ''
        item['DOI'] = meta.get('doi') or ''
    return item


def _page_html(page):
    bits = []
    if page.get('printed_page') not in (None, ''):
        bits.append('printed page ' + html.escape(str(page['printed_page'])))
    if page.get('pdf_pages_1_based'):
        bits.append('PDF page ' + ', '.join(str(p) for p in page['pdf_pages_1_based']))
    if page.get('scan_indexes_0_based'):
        bits.append('scan index (0-based) ' + ', '.join(str(p) for p in page['scan_indexes_0_based']))
    if not bits and page.get('start_line') is not None:
        bits.append(f"text lines {page['start_line']}-{page.get('end_line')}")
    label = '; '.join(bits) or 'page not recorded'
    if page.get('url'):
        u = html.escape(page['url'], quote=True)
        label += f' — <a href="{u}">{u}</a>'
    return f'<li>{label}</li>'


def note_html(cit):
    status = 'verified' if cit['verified'] else 'UNVERIFIED (human review required)'
    if cit['holds']:
        status += '; held from synthesis: ' + ', '.join(cit['holds'])
    if cit.get('relevance_status'):
        status += '; relevance: ' + cit['relevance_status']
    e = lambda s: html.escape(str(s))
    parts = [
        '<h2>NABOU//X citation</h2>',
        f"<p><b>Case:</b> {e(cit['case'])}</p>",
        f"<p><b>Run:</b> <a href=\"{EVIDENCE_URL.format(e(cit['run_id']))}\">{e(cit['run_id'])}</a></p>",
        f"<p><b>Claim:</b> {e(cit['claim_id'])} ({e(', '.join(cit['origins']))})</p>",
        f'<p><b>Status:</b> {e(status)}</p>',
    ]
    if cit.get('statement'):
        parts.append(f"<p><b>Model statement (not verified):</b> {e(cit['statement'])}</p>")
    if cit.get('quote'):
        parts.append(f"<blockquote>{e(cit['quote'])}</blockquote>")
    parts.append('<p><b>Pages:</b></p><ul>' + ''.join(_page_html(p) for p in cit['pages']) + '</ul>')
    for ref in cit.get('reported_archival_references') or []:
        parts.append(f'<p><b>Archival reference reported by this source (original not inspected):</b> {e(ref)}</p>')
    parts.append(f"<p>{CITATION_MARK}: {e(cit['citation_id'])}</p>")
    return ''.join(parts)


# -------------------------------------------------------------- zotero api
class ZoteroError(RuntimeError):
    pass


class Zotero:
    def __init__(self, user_id, api_key, opener=None, sleep=time.sleep, max_retries=6, base=API):
        if not str(user_id).isdigit():
            raise ValueError('ZOTERO_USER_ID must be numeric')
        self.prefix = f'/users/{user_id}'
        self._key = api_key
        self._open = opener or (lambda req: urllib.request.urlopen(req, timeout=60))
        self._sleep = sleep
        self.max_retries = max_retries
        self.base = base
        self.writes = 0

    def request(self, method, path, params=None, body=None, headers=None, library=True):
        url = self.base + (self.prefix if library else '') + path
        if params:
            url += '?' + urllib.parse.urlencode(params)
        data = json.dumps(body).encode('utf-8') if body is not None else None
        hdrs = {'Zotero-API-Key': self._key, 'Zotero-API-Version': '3', 'Accept': 'application/json'}
        if data is not None:
            hdrs['Content-Type'] = 'application/json'
        hdrs.update(headers or {})
        for attempt in range(self.max_retries + 1):
            req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
            try:
                resp = self._open(req)
                status, rh, raw = resp.status, resp.headers, resp.read()
            except urllib.error.HTTPError as err:
                status, rh, raw = err.code, err.headers, err.read()
            except urllib.error.URLError as err:
                if attempt >= self.max_retries:
                    raise ZoteroError(f'{method} {path}: network error {err.reason}') from None
                self._sleep(min(60, 2 ** attempt))
                continue
            rh = rh or {}
            backoff = rh.get('Backoff')
            if status in (429, 500, 502, 503, 504):
                if attempt >= self.max_retries:
                    raise ZoteroError(f'{method} {path}: HTTP {status} after {attempt + 1} attempts')
                wait = rh.get('Retry-After') or backoff
                self._sleep(int(wait) if str(wait or '').isdigit() else min(60, 2 ** attempt))
                continue
            if backoff and str(backoff).isdigit():
                self._sleep(int(backoff))
            if status >= 400:
                text = raw.decode('utf-8', 'replace')[:300] if raw else ''
                raise ZoteroError(f'{method} {path}: HTTP {status} {text}')
            if method != 'GET':
                self.writes += 1
            return status, rh, (json.loads(raw) if raw else None)
        raise ZoteroError(f'{method} {path}: retries exhausted')

    def notes_access(self):
        """True only if the key may read notes; without it, existing notes are invisible."""
        _, _, info = self.request('GET', '/keys/current', library=False)
        user = ((info or {}).get('access') or {}).get('user') or {}
        return bool(user.get('notes'))

    def paged(self, path, params=None):
        out, start = [], 0
        while True:
            q = dict(params or {}, start=start, limit=100, format='json')
            _, headers, page = self.request('GET', path, q)
            page = page or []
            out.extend(page)
            total = headers.get('Total-Results')
            start += len(page)
            if not page or len(page) < 100 or (str(total or '').isdigit() and start >= int(total)):
                return out

    def create(self, objects, kind):
        """POST objects in batches with a write token; return keys in order."""
        keys = []
        for i in range(0, len(objects), BATCH):
            batch = objects[i:i + BATCH]
            token = uuid.uuid4().hex  # reused across retries of this batch
            _, _, result = self.request('POST', f'/{kind}', body=batch, headers={'Zotero-Write-Token': token})
            result = result or {}
            if result.get('failed'):
                raise ZoteroError(f'{kind} create failed: ' + json.dumps(result['failed'], ensure_ascii=False)[:300])
            ok = {**(result.get('unchanged') or {}), **(result.get('success') or {})}
            for j in range(len(batch)):
                key = ok.get(str(j))
                if not key:
                    raise ZoteroError(f'{kind} create: no key returned for object {j}')
                keys.append(key)
        return keys


def _extra_marks(extra, mark):
    return [line.split(':', 1)[1].strip() for line in (extra or '').splitlines() if line.startswith(mark + ':')]


# --------------------------------------------------------------------- sync
def sync(works, client=None, apply=False, log=print):
    report = {'schema': SCHEMA, 'mode': 'apply' if apply else 'dry-run', 'library_checked': client is not None,
              'cases': {}, 'totals': {}, 'thin_metadata': []}
    cases = sorted({c for w in works.values() for c in w['cases']})
    for case in cases:
        report['cases'][case] = {'sources': 0, 'items_to_create': 0, 'items_existing': 0, 'notes_to_create': 0, 'notes_existing': 0}
    for w in works.values():
        for case in w['cases']:
            report['cases'][case]['sources'] += 1
        reasons = thin_reasons(w['meta'])
        if reasons:
            report['thin_metadata'].append({'source_key': w['source_key'], 'title': w['meta'].get('title'), 'cases': w['cases'], 'missing': reasons})

    existing, root_key, sub_keys = {}, None, {}
    notes_ok = True
    if client is not None:
        notes_ok = client.notes_access()
        report['key_notes_access'] = notes_ok
        if not notes_ok:
            report['warnings'] = ['KEY_LACKS_NOTES_ACCESS: existing notes cannot be read, so citation notes are not '
                                  'written (a rerun could not detect them and would duplicate). Enable "Allow notes '
                                  'access" on the Zotero API key.']
        for item in client.paged('/items/top'):
            data = item.get('data') or {}
            for mark in _extra_marks(data.get('extra'), SOURCE_MARK):
                existing.setdefault(mark, data)
        collections = client.paged('/collections')
        for c in collections:
            d = c.get('data') or {}
            if d.get('name') == ROOT_COLLECTION and not d.get('parentCollection'):
                root_key = d.get('key')
                break
        if root_key:
            for c in collections:
                d = c.get('data') or {}
                if d.get('parentCollection') == root_key and d.get('name') in cases:
                    sub_keys.setdefault(d['name'], d['key'])
        if apply:
            if not root_key:
                root_key = client.create([{'name': ROOT_COLLECTION, 'parentCollection': False}], 'collections')[0]
                log(f'created collection {ROOT_COLLECTION}')
            missing = [c for c in cases if c not in sub_keys]
            if missing:
                for case, key in zip(missing, client.create([{'name': c, 'parentCollection': root_key} for c in missing], 'collections')):
                    sub_keys[case] = key
                log(f'created {len(missing)} case sub-collection(s)')

    new_works, item_keys = [], {}
    for w in works.values():
        found = existing.get(w['source_key'])
        bucket = 'items_existing' if found else 'items_to_create'
        for case in w['cases']:
            report['cases'][case][bucket] += 1
        if found:
            item_keys[w['source_key']] = found['key']
            want = [sub_keys[c] for c in w['cases'] if c in sub_keys]
            have = list(found.get('collections') or [])
            add = [k for k in want if k not in have]
            if apply and add:
                client.request('PATCH', f"/items/{found['key']}", body={'collections': have + add},
                               headers={'If-Unmodified-Since-Version': str(found.get('version', 0))})
        else:
            new_works.append(w)
    if apply and new_works:
        objs = [zotero_item(w, [sub_keys[c] for c in w['cases']]) for w in new_works]
        for w, key in zip(new_works, client.create(objs, 'items')):
            item_keys[w['source_key']] = key
        log(f'created {len(new_works)} item(s)')

    notes = []
    for w in works.values():
        key = item_keys.get(w['source_key'])
        have = set()
        if client is not None and notes_ok and key and w['source_key'] in existing:
            for child in client.paged(f'/items/{key}/children'):
                d = child.get('data') or {}
                if d.get('itemType') == 'note':
                    have.update(re.findall(re.escape(CITATION_MARK) + r':\s*([^<\s]+)', d.get('note') or ''))
        for cid, cit in sorted(w['citations'].items()):
            bucket = 'notes_existing' if cid in have else 'notes_to_create'
            report['cases'][cit['case']][bucket] += 1
            if cid not in have and apply and notes_ok:
                notes.append({'itemType': 'note', 'parentItem': key, 'note': note_html(cit), 'tags': [{'tag': 'NABOU//X'}]})
    if apply and notes:
        client.create(notes, 'items')
        log(f'created {len(notes)} note(s)')

    report['totals'] = {
        'sources': len(works),
        'items_to_create' if not apply else 'items_created': sum(1 for w in works.values() if w['source_key'] not in existing),
        'items_existing': sum(1 for w in works.values() if w['source_key'] in existing),
        'notes_to_create' if not apply else 'notes_created': len(notes) if apply else sum(c['notes_to_create'] for c in report['cases'].values()),
        'notes_skipped_no_notes_access': 0 if notes_ok else sum(c['notes_to_create'] for c in report['cases'].values()),
        'notes_existing': sum(c['notes_existing'] for c in report['cases'].values()),
        'api_writes': client.writes if client else 0,
    }
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument('--dry-run', action='store_true', default=True, help='report only (default)')
    mode.add_argument('--apply', action='store_true', help='write to the Zotero library')
    ap.add_argument('--live-dir', default='command-center/live')
    ap.add_argument('--case', action='append', help='limit to a case (mission target, exact); repeatable')
    ap.add_argument('--run-id', action='append', help='limit to a run id; repeatable')
    ap.add_argument('--offline', action='store_true', help='dry run without reading the Zotero library')
    ap.add_argument('--report', default='', help='write the JSON report here')
    args = ap.parse_args(argv)

    works, skipped = collect_sources(args.live_dir, args.case, args.run_id)
    api_key, user_id = os.environ.get('ZOTERO_API_KEY', ''), os.environ.get('ZOTERO_USER_ID', '')
    client = None
    if args.apply:
        if not api_key or not user_id:
            print('ZOTERO_API_KEY and ZOTERO_USER_ID are required for --apply', file=sys.stderr)
            return 2
        client = Zotero(user_id, api_key)
    elif api_key and user_id and not args.offline:
        client = Zotero(user_id, api_key)
    report = sync(works, client, apply=args.apply, log=lambda m: print(m, file=sys.stderr))
    report['skipped_missing_runs'] = skipped
    report['filters'] = {'case': args.case or [], 'run_id': args.run_id or []}
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.report:
        Path(args.report).write_text(text + '\n', encoding='utf-8')
    print(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
