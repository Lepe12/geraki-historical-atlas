"""Conservative OCR-to-leaf mapping; a whole book is never treated as leaf zero."""
import re
import unicodedata
import xml.etree.ElementTree as ET


def normalize(text):
    text = unicodedata.normalize('NFKC', text)
    text = re.sub(r'(?<=\w)-\s*\n\s*(?=\w)', '', text)
    return ' '.join(re.findall(r'\w+', text.casefold()))


def djvu_pages(data):
    root = ET.fromstring(data)
    pages = []
    for obj in root.iter():
        if obj.tag.rsplit('}', 1)[-1].upper() != 'OBJECT':
            continue
        words = [node.text or '' for node in obj.iter()
                 if node.tag.rsplit('}', 1)[-1].upper() == 'WORD']
        pages.append(' '.join(words))
    return pages


def djvu_leaf_ids(data):
    root = ET.fromstring(data)
    ids = []
    for obj in root.iter():
        if obj.tag.rsplit('}', 1)[-1].upper() != 'OBJECT':
            continue
        name = next((p.get('value', '') for p in obj.iter()
                     if p.tag.rsplit('}', 1)[-1].upper() == 'PARAM' and p.get('name') == 'PAGE'), '')
        m = re.search(r'_(\d+)\.djvu$', name, re.I)
        ids.append(int(m.group(1)) if m else None)
    return ids


def pages_for_hit(results, source_file, hit_index, hit_line=None):
    return [p for p in results if p.get('source_file') == source_file and
            (p.get('hit_index') == hit_index or
             (p.get('hit_index') is None and hit_line is not None and p.get('hit_line') == hit_line))]


def map_context(context, pages, scan_pages, basis, ocr_leaves=None):
    if len(pages) < 2:
        return {'status': 'PAGINATION_UNRESOLVED_NO_PAGE_BOUNDARIES'}
    if len(pages) != len(scan_pages):
        return {'status': 'PAGINATION_UNRESOLVED_PAGE_COUNT_MISMATCH',
                'ocr_pages': len(pages), 'scan_pages': len(scan_pages)}
    leaves = [p.get('leaf') for p in scan_pages]
    if any(not isinstance(leaf, int) for leaf in leaves) or len(set(leaves)) != len(leaves):
        return {'status': 'PAGINATION_UNRESOLVED_INVALID_SCANDATA'}
    if basis == 'DJVU_XML_OBJECT_ORDER' and (ocr_leaves is None or list(ocr_leaves) != leaves):
        return {'status': 'PAGINATION_UNRESOLVED_OCR_SCAN_LEAF_ALIGNMENT'}
    needle = normalize(context)
    tokens = needle.split()
    if len(tokens) < 8 or len(set(tokens)) < 5:
        return {'status': 'PAGINATION_UNRESOLVED_INSUFFICIENT_CONTEXT'}
    normalized_pages = [normalize(text) for text in pages]
    exact = [i for i, text in enumerate(normalized_pages) if needle in text]
    if len(exact) == 1:
        chosen = exact[0]
        method = 'UNIQUE_FULL_CONTEXT'
    elif len(exact) > 1:
        return {'status': 'PAGINATION_UNRESOLVED_AMBIGUOUS_CONTEXT', 'matching_ocr_pages': exact}
    else:
        # Only contiguous phrases count; scattered words cannot select a page.
        width = min(16, len(tokens))
        positions = sorted(set([0, max(0, len(tokens)//2-width//2), len(tokens)-width]))
        matches = set()
        for pos in positions:
            fragment = ' '.join(tokens[pos:pos+width])
            matches.update(i for i, text in enumerate(normalized_pages) if fragment in text)
        if len(matches) != 1:
            return {'status': 'PAGINATION_UNRESOLVED_AMBIGUOUS_OR_UNMATCHED_CONTEXT',
                    'matching_ocr_pages': sorted(matches)}
        chosen = next(iter(matches))
        method = 'UNIQUE_CONTIGUOUS_CONTEXT_FRAGMENT'
    return {'status': 'EXACT_PAGE_MAPPED', 'ocr_page_index': chosen,
            'leaf': scan_pages[chosen]['leaf'],
            'printed_page': scan_pages[chosen].get('printed_page'),
            'mapping_basis': basis, 'context_match_method': method,
            'alignment_note': 'OCR page order aligned to complete scandata with equal page counts; not visual verification.'}
