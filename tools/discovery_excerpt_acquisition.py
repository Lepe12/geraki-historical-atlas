"""Read the text a discovery already carries when the full page cannot be fetched.

Run 42984961899 found the Greek Wikipedia article «Ούγος ντε Κρεβελιέ», the
owner's piratecartography article and the Helios/Academia records, each with a
search excerpt, yet none was ever read: they sat at REVIEW_REQUIRED with
attempted=False and the narrative came back empty. When a source matches the
requested name and the public page cannot be fetched (blocked, PDF missing,
no URL), the excerpt already in the hit is saved as an explicitly labelled
excerpt text so the reading stages can use it. It is never presented as the
full document, never as an inspected original, never as verification.
"""
import hashlib
import json
from pathlib import Path

MIN_EXCERPT_CHARS = 200
MATCHED = ('TARGET_MATCH', 'POSSIBLE_TARGET')
EXCERPT_FIELDS = ('context_excerpt', 'snippet', 'text', 'description')


def excerpt_text(record):
    for field in EXCERPT_FIELDS:
        value = record.get(field)
        if isinstance(value, list):
            value = '\n'.join(str(v) for v in value if v)
        value = str(value or '').strip()
        if len(value) >= MIN_EXCERPT_CHARS:
            return field, value
    return None, ''


def matched_request(record):
    assessment = record.get('relevance_assessment') or {}
    topical = assessment.get('topical_match') or record.get('topical_match') or {}
    return topical.get('category') in MATCHED


def acquire_excerpt(record, out_dir):
    """Return an updated record with the excerpt saved, or None.

    Only for sources that match the requested person/place and that have no
    acquired file yet. Status TEXT_ACQUIRED lets the reading stages open it;
    source_type DISCOVERY_EXCERPT_TEXT and excerpt_only keep it honest.
    """
    if record.get('files') or not matched_request(record):
        return None
    field, text = excerpt_text(record)
    if not text:
        return None
    url = str(record.get('url') or record.get('identifier') or record.get('title') or '')
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = hashlib.sha256((url + '\0' + text).encode('utf-8')).hexdigest()[:24]
    path = out_dir / f'{stem}.excerpt.txt'
    header = f"{record.get('title') or ''}\n{url}\n\n"
    path.write_text(header + text + '\n', encoding='utf-8')
    receipt = {
        'url': url, 'files': [str(path)], 'status': 'TEXT_ACQUIRED',
        'source_type': 'DISCOVERY_EXCERPT_TEXT', 'excerpt_field': field,
        'excerpt_only': True, 'original_inspected': False,
        'text_sha256': hashlib.sha256(text.encode('utf-8')).hexdigest(),
        'note': 'Search/discovery excerpt only; the full source was not read.',
    }
    updated = dict(record)
    updated['files'] = [*record.get('files', []), str(path)]
    updated['status'] = 'TEXT_ACQUIRED'
    updated['excerpt_only'] = True
    updated['web_acquisition_attempted'] = True
    updated['acquired_source_url'] = record.get('acquired_source_url') or url
    updated['excerpt_acquisition'] = receipt
    if not isinstance(updated.get('web_acquisition'), dict) or not updated['web_acquisition'].get('files'):
        updated['web_acquisition'] = receipt
    updated['original_inspected'] = False
    updated['verification_status'] = 'NEEDS_EVIDENCE'
    return updated


if __name__ == '__main__':  # pragma: no cover - manual inspection helper
    import sys
    row = json.loads(Path(sys.argv[1]).read_text())
    print(json.dumps(acquire_excerpt(row, sys.argv[2]), ensure_ascii=False, indent=2))
