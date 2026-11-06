"""Owner's published-source library for NABOU research (local only).

When PCT_OWNED_LIBRARY points at a folder (default /workspace/bibliothiki-piges
if that path exists), discovery and acquisition treat catalogued PDF+.txt pairs
as first-class local sources. Bibliographic metadata comes from KATALOGOS.md.

GitHub Actions runners do not have this folder unless PCT_OWNED_LIBRARY is set
to a private mount later. Never commit the PDFs or full OCR texts to the public
repository: only this scanner and its fixture tests belong in git.

OCR .txt is a convenience for reading; if it conflicts with the PDF, the PDF wins.
Working notes under simeioseis-ergasias/ are never returned as published sources.
"""
from __future__ import annotations

import hashlib
import os
import re
import shutil
import unicodedata
from pathlib import Path

DEFAULT_ROOT = Path('/workspace/bibliothiki-piges')
CATALOG_NAME = 'KATALOGOS.md'
SKIP_DIR_NAMES = frozenset({'simeioseis-ergasias'})
ENV_VAR = 'PCT_OWNED_LIBRARY'


def resolve_root(env=None, *, require_exists=True):
    """Return the library root, or None when unavailable.

    PCT_OWNED_LIBRARY wins when set (even if missing: then None when
    require_exists). Otherwise use DEFAULT_ROOT only if it exists.
    """
    env = os.environ if env is None else env
    raw = (env.get(ENV_VAR) or '').strip()
    if raw:
        root = Path(raw).expanduser()
        if require_exists and not root.is_dir():
            return None
        return root
    if DEFAULT_ROOT.is_dir():
        return DEFAULT_ROOT
    return None


def _fold(value):
    text = ''.join(
        c for c in unicodedata.normalize('NFD', str(value or ''))
        if not unicodedata.combining(c)
    ).casefold()
    return text


def _tokens(value, min_len=4):
    return set(re.findall(r'[^\W\d_]{%d,}' % min_len, _fold(value)))


def parse_katalogos(text):
    """Parse KATALOGOS.md published-source entries into catalog records.

    Stops before the working-notes section. Each record needs a PDF basename
    listed in the entry; the matching .txt is assumed beside it.
    """
    if not text:
        return []
    # Drop working notes and anything after that heading.
    body = re.split(
        r'(?m)^##\s+Σημειώσεις\s+εργασίας\b|^##\s+Working\s+notes\b',
        text, maxsplit=1,
    )[0]
    published = re.split(r'(?m)^##\s+Δημοσιευμένες\s+πηγές\b|^##\s+Published\s+sources\b', body, maxsplit=1)
    if len(published) == 2:
        body = published[1]
    entries = []
    # Numbered entries: "1. **Author.** rest..."
    chunks = re.split(r'(?m)^\d+\.\s+', body)
    for chunk in chunks[1:]:
        lines = chunk.strip().splitlines()
        if not lines:
            continue
        head = lines[0].strip()
        author_match = re.match(r'\*\*(.+?)\*\*\.?\s*(.*)$', head)
        if author_match:
            author = author_match.group(1).strip().rstrip('.')
            remainder = author_match.group(2).strip()
        else:
            author, remainder = '', head
        title = remainder
        # Prefer quoted or italic title fragments when present.
        quoted = re.search(r'[«“\"](.+?)[»”\"]', remainder)
        italic = re.search(r'\*(.+?)\*', remainder)
        if quoted:
            title = quoted.group(1).strip()
        elif italic:
            title = italic.group(1).strip()
        else:
            title = re.split(r'\.\s+', remainder, maxsplit=1)[0].strip(' .,;')
        pdf_name = None
        for line in lines[1:]:
            pdf = re.search(r'PDF:\s*`([^`]+\.pdf)`', line, re.I)
            if pdf:
                pdf_name = pdf.group(1).strip()
                break
        if not pdf_name:
            continue
        year_match = re.search(r'(?<!\d)((?:1[5-9]|20)\d{2})(?!\d)', pdf_name) or re.search(
            r'(?<!\d)((?:1[5-9]|20)\d{2})(?!\d)', head
        )
        year = int(year_match.group(1)) if year_match else None
        pages = None
        page_match = re.search(
            r'(?:σσ?\.|pp?\.|σελ\.)\s*([\d\s,–\-καιand]+)', head, re.I
        )
        if page_match:
            pages = ' '.join(page_match.group(1).split())
        citation = head
        entries.append({
            'author': author,
            'year': year,
            'title': title,
            'pages': pages,
            'citation': citation,
            'pdf_name': pdf_name,
            'txt_name': Path(pdf_name).with_suffix('.txt').name,
            'bibliography': {
                'author': author,
                'year': year,
                'title': title,
                'pages': pages,
                'citation': citation,
            },
        })
    return entries


def list_published_sources(root=None, env=None):
    """Return published sources present as PDF+txt under the library root.

    Skips simeioseis-ergasias and any path outside the root. Missing catalog
    or missing files yield an empty list (missing folder is not an error).
    """
    root = Path(root) if root is not None else resolve_root(env)
    if root is None or not root.is_dir():
        return []
    catalog_path = root / CATALOG_NAME
    if not catalog_path.is_file():
        return []
    records = []
    for entry in parse_katalogos(catalog_path.read_text(encoding='utf-8', errors='replace')):
        pdf_path = (root / entry['pdf_name']).resolve()
        txt_path = (root / entry['txt_name']).resolve()
        try:
            if not pdf_path.is_relative_to(root.resolve()):
                continue
            if not txt_path.is_relative_to(root.resolve()):
                continue
        except (ValueError, OSError):
            continue
        # Refuse anything under skipped dirs even if catalog mistakenly lists it.
        if any(part in SKIP_DIR_NAMES for part in pdf_path.parts):
            continue
        if not pdf_path.is_file() or not txt_path.is_file():
            continue
        record = dict(entry)
        record.update({
            'root': str(root),
            'pdf_path': str(pdf_path),
            'txt_path': str(txt_path),
            'source_origin': 'OWNED_PUBLISHED_LIBRARY',
            'original_inspected': False,
            'verification_status': 'NEEDS_EVIDENCE',
            'ocr_note': 'OCR_TXT_IS_CONVENIENCE_PDF_WINS_ON_CONFLICT',
        })
        records.append(record)
    return records


def match_sources(query, sources=None, *, env=None, root=None):
    """Return catalog sources whose title/author/citation overlap the query."""
    sources = list_published_sources(root=root, env=env) if sources is None else sources
    wanted = _tokens(query, min_len=3)
    if not wanted:
        return []
    matched = []
    for source in sources:
        blob = ' '.join([
            source.get('title') or '',
            source.get('author') or '',
            source.get('citation') or '',
            source.get('pdf_name') or '',
        ])
        hay = _tokens(blob, min_len=3)
        folded = _fold(blob)
        overlap = wanted & hay
        # Multi-token queries need substantial overlap.
        if len(wanted) >= 2 and len(overlap) >= 2 and len(overlap) / len(wanted) >= 0.4:
            matched.append(source)
            continue
        # A single distinctive token (surname, short title word) is enough when
        # it appears as a whole token, or as a shared stem (Lantza / Lantzas).
        def related(token):
            if len(token) < 5:
                return False
            if token in hay:
                return True
            return any(
                (len(h) >= 5 and (token.startswith(h) or h.startswith(token)
                                  or token in h or h in token))
                for h in hay
            )
        if any(related(token) for token in wanted):
            matched.append(source)
            continue
        if source.get('year') and str(source['year']) in str(query) and overlap:
            matched.append(source)
    return matched


def materialize(source, out_dir):
    """Copy txt (and pdf when present) into an acquisition out dir; return record."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = hashlib.sha256(
        (source.get('pdf_path') or source['pdf_name']).encode()
    ).hexdigest()[:24]
    files = []
    txt_src = Path(source['txt_path'])
    txt_dest = out_dir / f'{stem}.txt'
    shutil.copy2(txt_src, txt_dest)
    files.append(str(txt_dest))
    pdf_dest = None
    pdf_src = Path(source['pdf_path'])
    if pdf_src.is_file():
        pdf_dest = out_dir / f'{stem}.pdf'
        shutil.copy2(pdf_src, pdf_dest)
        files.append(str(pdf_dest))
    content = txt_dest.read_text(encoding='utf-8', errors='replace')
    bib = source.get('bibliography') or {
        'author': source.get('author'),
        'year': source.get('year'),
        'title': source.get('title'),
        'pages': source.get('pages'),
        'citation': source.get('citation'),
    }
    return {
        'identifier': f"owned:{source['pdf_name']}",
        'title': source.get('title'),
        'creator': source.get('author'),
        'year': source.get('year'),
        'repository': 'Owned published-source library',
        'discovery_repository': 'Owned published-source library',
        'discovery_lane': 'owned_published_library',
        'acquisition_route': 'OWNED_LIBRARY',
        'url': f"owned-library://{source['pdf_name']}",
        'acquired_source_url': f"owned-library://{source['pdf_name']}",
        'files': files,
        'pdf_file': str(pdf_dest) if pdf_dest else None,
        'status': 'TEXT_ACQUIRED' if content.strip() else 'PDF_ACQUIRED_NO_TEXT',
        'source_type': 'OWNED_LIBRARY_TEXT',
        'source_origin': 'OWNED_PUBLISHED_LIBRARY',
        'bibliographic_metadata': bib,
        'bibliography': bib,
        'owned_library': {
            'pdf_path': source.get('pdf_path'),
            'txt_path': source.get('txt_path'),
            'pdf_name': source.get('pdf_name'),
            'ocr_note': source.get('ocr_note'),
            'catalog_citation': source.get('citation'),
        },
        'original_inspected': False,
        'verification_status': 'NEEDS_EVIDENCE',
        'connector_status': 'LOCAL_OWNED_LIBRARY',
        'relevance_assessment': {
            'status': 'PRIORITY',
            'score': 100,
            'reasons': ['OWNED_PUBLISHED_SOURCE_CATALOG_MATCH'],
        },
        'sha256': hashlib.sha256(txt_src.read_bytes()).hexdigest(),
        'web_acquisition': {
            'url': f"owned-library://{source['pdf_name']}",
            'files': files,
            'status': 'TEXT_ACQUIRED',
            'source_type': 'OWNED_LIBRARY_TEXT',
            'bibliographic_metadata': bib,
            'original_inspected': False,
        },
    }


def inject_into_results(results, out_dir, terms, *, env=None, root=None):
    """Materialize matching owned sources into results before web acquisition.

    terms: research target and aliases (and optional purpose fragments).
    Idempotent on identifier. No-op when the library folder is absent.
    """
    sources = list_published_sources(root=root, env=env)
    if not sources:
        return []
    query = ' '.join(str(t) for t in (terms or []) if t)
    matched = match_sources(query, sources) if query.strip() else list(sources)
    # Also match each term alone (aliases / short surnames).
    for term in terms or []:
        if not term:
            continue
        for hit in match_sources(str(term), sources):
            if hit not in matched:
                matched.append(hit)
    seen = {
        r.get('identifier') or r.get('url')
        for r in results
        if r.get('source_origin') == 'OWNED_PUBLISHED_LIBRARY'
        or r.get('acquisition_route') == 'OWNED_LIBRARY'
    }
    added = []
    for source in matched:
        ident = f"owned:{source['pdf_name']}"
        if ident in seen:
            continue
        record = materialize(source, out_dir)
        results.append(record)
        seen.add(ident)
        added.append(record)
    return added


def search_as_citation_rows(query, *, env=None, root=None):
    """Citation-search shaped rows for owned matches (title triage compatible)."""
    rows = []
    for source in match_sources(query, env=env, root=root):
        rows.append({
            'title': source.get('title') or source.get('citation'),
            'creator': source.get('author'),
            'year': source.get('year'),
            'url': f"owned-library://{source['pdf_name']}",
            'digital_url': f"owned-library://{source['pdf_name']}",
            'repository': 'Owned published-source library',
            'discovery_repository': 'Owned published-source library',
            'acquisition_route': 'OWNED_LIBRARY',
            'source_origin': 'OWNED_PUBLISHED_LIBRARY',
            'owned_source': source,
            'evidence_level': 'OWNED_LIBRARY_FULLTEXT',
            'fulltext_links': [],
        })
    return rows


def acquire_owned_query(query, out_dir, *, env=None, root=None):
    """Acquire all owned sources matching a bibliographic query."""
    added = []
    for source in match_sources(query, env=env, root=root):
        added.append(materialize(source, out_dir))
    return added
