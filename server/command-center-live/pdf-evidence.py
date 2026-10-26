#!/usr/bin/env python3
"""Local PDF replay. No network, client text, historical inference or HTR claims."""
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import resource
import subprocess
import sys
import tempfile
from htr_kraken import configuration as htr_configuration, recognize as htr_recognize


def run(args, timeout=30):
    try:
        result = subprocess.run(args, capture_output=True, timeout=timeout, check=False)
    except FileNotFoundError:
        raise ValueError('PDF_TOOL_UNAVAILABLE:' + args[0])
    if result.returncode:
        raise ValueError('PDF_TOOL_FAILED:' + args[0])
    return (result.stdout or (result.stderr if '-v' in args else b'')).decode('utf-8', errors='replace')


def extract(filename):
    # Preserve 768 MiB parser limit while allowing a separately bounded Kraken child.
    _, hard_limit = resource.getrlimit(resource.RLIMIT_AS)
    soft_limit = min(768 * 1024**2, hard_limit) if hard_limit != resource.RLIM_INFINITY else 768 * 1024**2
    resource.setrlimit(resource.RLIMIT_AS, (soft_limit, hard_limit))
    resource.setrlimit(resource.RLIMIT_FSIZE, (64 * 1024**2, 64 * 1024**2))
    resource.setrlimit(resource.RLIMIT_CPU, (120, 120))
    raw = Path(filename).read_bytes()
    if len(raw) > 25 * 1024**2 or not raw.startswith(b'%PDF-'):
        raise ValueError('INVALID_PDF')
    info = run(['pdfinfo', filename])
    count = next((int(line.split(':', 1)[1]) for line in info.splitlines() if line.startswith('Pages:')), 0)
    if not 0 < count <= 500:
        raise ValueError('PDF_PAGE_LIMIT_OR_INVALID')
    text = run(['pdftotext', '-enc', 'UTF-8', filename, '-'], 60)
    chunks = text.split('\f')
    pages = []
    ocr_count = 0
    htr_status, htr_model = htr_configuration()
    try:
        htr_budget = max(1, min(3, int(os.environ.get('PCT_HTR_MAX_PAGES', '2'))))
    except ValueError:
        htr_budget = 2
    htr_attempts = 0
    with tempfile.TemporaryDirectory(prefix='nabou-pdf-') as tmp:
        available = None
        for number in range(1, count + 1):
            value = chunks[number - 1] if number <= len(chunks) else ''
            words, method, confidence = [], 'PDF_TEXT', None
            page_htr_status = 'NOT_REQUIRED'
            if len(value.strip()) < 30:
                ocr_count += 1
                if ocr_count > 30:
                    raise ValueError('OCR_PAGE_BUDGET_EXCEEDED')
                # HTR is opt-in and bounded; it never produces verified claims.
                if htr_status == 'READY' and htr_attempts < htr_budget:
                    page_htr_status = 'PENDING'
                elif htr_status == 'READY':
                    page_htr_status = 'PAGE_BUDGET_REACHED'
                else:
                    page_htr_status = htr_status
                image = str(Path(tmp) / 'page')
                run(['pdftoppm', '-f', str(number), '-l', str(number), '-singlefile', '-scale-to', '2200', '-png', filename, image], 30)
                if page_htr_status == 'PENDING':
                    htr_attempts += 1
                    page_htr_status, htr_text = htr_recognize(image + '.png', htr_model)
                    if page_htr_status == 'OK':
                        value, method = htr_text, 'KRAKEN_HTR'
                if method != 'KRAKEN_HTR':
                    if available is None:
                        langs = run(['tesseract', '--list-langs'])
                        available = [x for x in ('ell', 'eng', 'fra', 'ita') if x in langs.splitlines()]
                    if not available:
                        raise ValueError('OCR_LANGUAGES_UNAVAILABLE')
                    # Explicit output setting also works with a pinned tessdata dir.
                    tsv = run(['tesseract', image + '.png', 'stdout', '-l', '+'.join(available),
                               '-c', 'tessedit_create_tsv=1'], 45)
                    parts, offset, confidences = [], 0, []
                    for row in csv.DictReader(io.StringIO(tsv), delimiter='\t', quoting=csv.QUOTE_NONE):
                        token = (row.get('text') or '').strip()
                        if not token:
                            continue
                        if parts:
                            offset += 1
                        parts.append(token)
                        words.append({'start_char': offset, 'end_char': offset + len(token),
                                      'bbox': [int(row[k]) for k in ('left', 'top', 'width', 'height')]})
                        offset += len(token)
                        confidences.append(float(row['conf']))
                    value, method = ' '.join(parts), 'TESSERACT_OCR'
                    confidence = sum(confidences) / len(confidences) if confidences else None
            greek = sum('\u0370' <= c <= '\u03ff' or '\u1f00' <= c <= '\u1fff' for c in value)
            pages.append({'page': number, 'printed_page': None, 'text': value, 'words': words,
                          'method': method, 'text_order': 'POPPLER_READING_ORDER' if method == 'PDF_TEXT' else ('HTR_LINE_ORDER' if method == 'KRAKEN_HTR' else 'OCR_WORD_ORDER'),
                          'text_sha256': hashlib.sha256(value.encode()).hexdigest(),
                          'language': 'el' if greek > 20 else 'UNDETERMINED',
                          'language_method': 'SCRIPT_HEURISTIC_NOT_LANGUAGE_MODEL',
                          'ocr_languages': available if method == 'TESSERACT_OCR' else [],
                          'ocr_confidence': confidence, 'bbox_units': 'raster_pixels' if words else None,
                          'htr_status': page_htr_status, 'transcription_review': 'UNREVIEWED' if method == 'KRAKEN_HTR' else None})
    return {'schema': 'nabou-pdf-replay-v1', 'source_sha256': hashlib.sha256(raw).hexdigest(),
            'pages': pages, 'original_pdf_replayed': True, 'historically_verified': False,
            'htr_status': htr_status, 'htr_pages': sum(1 for p in pages if p['method'] == 'KRAKEN_HTR'),
            'parser_version': run(['pdftotext', '-v']).strip()[:200]}


if __name__ == '__main__':
    try:
        print(json.dumps(extract(sys.argv[1]), ensure_ascii=False))
    except (ValueError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({'error': str(exc) if isinstance(exc, ValueError) else 'PDF_TOOL_TIMEOUT'}))
        sys.exit(2)
