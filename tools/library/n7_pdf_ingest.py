#!/usr/bin/env python3
"""Resumable PDF-to-page JSON for the N7 private historical library."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import fitz


def atomic(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as f:
        json.dump(record, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
        tmp = f.name
    os.replace(tmp, path)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1048576), b''):
            h.update(chunk)
    return h.hexdigest()


def extract(page: fitz.Page, mode: str, language: str, threshold: int) -> str:
    text = page.get_text('text').strip()
    if mode == 'never' or (mode == 'auto' and len(text) >= threshold):
        return text
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    with tempfile.TemporaryDirectory(prefix='n7-ocr-') as folder:
        filename = Path(folder) / 'page.png'
        filename.write_bytes(pix.tobytes('png'))
        try:
            ocr = subprocess.run(['tesseract', str(filename), 'stdout', '-l', language],
                                 check=True, capture_output=True, text=True, timeout=120).stdout.strip()
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            raise RuntimeError('OCR_FAILED page=' + str(page.number + 1)) from e
        return ocr or text


def run(args: argparse.Namespace) -> dict:
    source = Path(args.pdf).resolve(strict=True)
    if not source.is_file() or source.suffix.lower() != '.pdf':
        raise ValueError('PDF_REQUIRED')
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    digest = sha256(source)
    checkpoint = output / 'checkpoint.json'
    doc = fitz.open(source)
    if doc.needs_pass:
        raise ValueError('ENCRYPTED_PDF_UNSUPPORTED')
    total = len(doc)
    expected = (digest, total, args.batch_size, args.ocr, args.language, args.threshold)
    if checkpoint.exists():
        state = json.loads(checkpoint.read_text('utf-8'))
        observed = tuple(state.get(k) for k in ('source_id', 'total_pages', 'batch_size', 'mode', 'language', 'threshold'))
        if observed != expected:
            raise ValueError('CHECKPOINT_SOURCE_OR_SETTINGS_MISMATCH')
    else:
        state = dict(zip(('source_id', 'total_pages', 'batch_size', 'mode', 'language', 'threshold'), expected))
        state.update(next_page=1, completed=False)
        atomic(checkpoint, state)
    next_page = state['next_page']
    if not isinstance(next_page, int) or not 1 <= next_page <= total + 1:
        raise ValueError('INVALID_CHECKPOINT')
    batches = 0
    while next_page <= total and (args.max_batches is None or batches < args.max_batches):
        last = min(total, next_page + args.batch_size - 1)
        pages = []
        for index in range(next_page, last + 1):
            pages.append(dict(scan_index=index, printed_page=None,
                              text=extract(doc[index - 1], args.ocr, args.language, args.threshold),
                              ocr_status='UNREVIEWED'))
        data = dict(source_id=digest, title=args.title or source.stem,
                    author=args.author, source_uri='private://n7-library/' + digest + '.pdf',
                    rights_note=args.rights_note, pages=pages)
        atomic(output / f'pages-{next_page:06d}-{last:06d}.json', data)
        state.update(next_page=last + 1, completed=(last == total))
        atomic(checkpoint, state)
        next_page = last + 1
        batches += 1
    doc.close()
    return dict(status='COMPLETED' if state['completed'] else 'PARTIAL',
                source_id=digest, total_pages=total,
                next_page=state['next_page'], batches_written=batches,
                note='Pages prepared, NOT imported into MariaDB. Printed page numbers must be mapped separately.')


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('pdf')
    p.add_argument('--output', required=True)
    p.add_argument('--title')
    p.add_argument('--author')
    p.add_argument('--rights-note')
    p.add_argument('--batch-size', type=int, default=20)
    p.add_argument('--max-batches', type=int)
    p.add_argument('--ocr', choices=('auto', 'always', 'never'), default='auto')
    p.add_argument('--language', default='ell+eng')
    p.add_argument('--threshold', type=int, default=70)
    args = p.parse_args()
    if not 1 <= args.batch_size <= 100 or args.threshold < 0 or (args.max_batches is not None and args.max_batches < 1):
        p.error('invalid batch settings')
    try:
        print(json.dumps(run(args), ensure_ascii=False))
    except Exception as exc:
        p.exit(1, f'{type(exc).__name__}: {exc}\n')


if __name__ == '__main__':
    main()
