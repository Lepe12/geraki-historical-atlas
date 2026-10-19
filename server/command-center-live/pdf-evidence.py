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


def run(args, timeout=30):
    try:
        result = subprocess.run(args, capture_output=True, timeout=timeout, check=False)
    except FileNotFoundError:
        raise ValueError('PDF_TOOL_UNAVAILABLE:' + args[0])
    if result.returncode:
        raise ValueError('PDF_TOOL_FAILED:' + args[0])
    return (result.stdout or (result.stderr if '-v' in args else b'')).decode('utf-8', errors='replace')


def extract(filename):
    resource.setrlimit(resource.RLIMIT_AS, (768 * 1024**2, 768 * 1024**2))
    resource.setrlimit(resource.RLIMIT_FSIZE, (64 * 1024**2, 64 * 1024**2))
    resource.setrlimit(resource.RLIMIT_CPU, (120, 120))
    raw = Path(filename).read_bytes()
    if len(raw) > 25 * 1024**2 or not raw.startswith(b'%PDF-'):
        raise ValueError('INVALID_PDF')
    info = run(['pdfinfo', filename])
    count = next((int(line.split(':', 1)[1]) for line in info.splitlines() if line.startswith('Pages:')), 0)
    if not 0 < count <= 500:
        raise ValueError('PDF_PAGE_LIMIT_OR_INVALID')
    text = run(['pdftotext', '-layout', '-enc', 'UTF-8', filename, '-'], 60)
    chunks = text.split('\f')
    pages = []
    ocr_count = 0
    with tempfile.TemporaryDirectory(prefix='nabou-pdf-') as tmp:
        available = None
        for number in range(1, count + 1):
            value = chunks[number - 1] if number <= len(chunks) else ''
            words, method, confidence = [], 'PDF_TEXT', None
            if len(value.strip()) < 30:
                ocr_count += 1
                if ocr_count > 30:
                    raise ValueError('OCR_PAGE_BUDGET_EXCEEDED')
                if available is None:
                    langs = run(['tesseract', '--list-langs'])
                    available = [x for x in ('ell', 'eng', 'fra', 'ita') if x in langs.splitlines()]
                if not available:
                    raise ValueError('OCR_LANGUAGES_UNAVAILABLE')
                image = str(Path(tmp) / 'page')
                run(['pdftoppm', '-f', str(number), '-l', str(number), '-singlefile', '-scale-to', '2200', '-png', filename, image], 30)
                tsv = run(['tesseract', image + '.png', 'stdout', '-l', '+'.join(available), 'tsv'], 45)
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
                          'method': method, 'text_sha256': hashlib.sha256(value.encode()).hexdigest(),
                          'language': 'el' if greek > 20 else 'UNDETERMINED',
                          'language_method': 'SCRIPT_HEURISTIC_NOT_LANGUAGE_MODEL',
                          'ocr_languages': available if method == 'TESSERACT_OCR' else [],
                          'ocr_confidence': confidence, 'bbox_units': 'raster_pixels' if words else None})
    return {'schema': 'nabou-pdf-replay-v1', 'source_sha256': hashlib.sha256(raw).hexdigest(),
            'pages': pages, 'original_pdf_replayed': True, 'historically_verified': False,
            'htr_status': 'UNSUPPORTED_NO_HANDWRITING_MODEL',
            'parser_version': run(['pdftotext', '-v']).strip()[:200]}


if __name__ == '__main__':
    try:
        print(json.dumps(extract(sys.argv[1]), ensure_ascii=False))
    except (ValueError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({'error': str(exc) if isinstance(exc, ValueError) else 'PDF_TOOL_TIMEOUT'}))
        sys.exit(2)
