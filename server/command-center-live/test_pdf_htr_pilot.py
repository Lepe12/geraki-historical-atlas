#!/usr/bin/env python3
"""Image-only PDF -> raster -> mock Kraken -> unreviewed server replay."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

BASE = Path(__file__).resolve().parent
TOOLS = ('pdftoppm', 'pdftotext', 'pdfinfo')


def make_pdf(path):
    # One-page PDF with vector markings but no text layer, for rasterization.
    stream = 'q 0 0 0 RG 4 w 80 80 m 490 680 l S Q\n'
    objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>',
        f'<< /Length {len(stream)} >>\nstream\n{stream}endstream',
    ]
    data = '%PDF-1.4\n'
    offsets = [0]
    for i, obj in enumerate(objs, 1):
        offsets.append(len(data.encode()))
        data += f'{i} 0 obj\n{obj}\nendobj\n'
    pos = len(data.encode())
    data += 'xref\n0 5\n0000000000 65535 f \n'
    for offset in offsets[1:]:
        data += f'{offset:010d} 00000 n \n'
    data += f'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n{pos}\n%%EOF\n'
    path.write_bytes(data.encode())


@unittest.skipUnless(all(shutil.which(cmd) for cmd in TOOLS), 'Poppler not installed')
class PDFHtrPilotTest(unittest.TestCase):
    def test_scanned_page_reads_mock_htr_and_never_verifies(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pdf = root / 'original.pdf'
            make_pdf(pdf)
            model = root / 'early-modern.mlmodel'
            model.write_bytes(b'test model')
            cli = root / 'kraken'
            cli.write_text('#!/bin/sh\nprintf "Galera arrivo a Milo nel 1677" > "$3"\n')
            cli.chmod(0o700)
            env = os.environ.copy()
            env.update({'PCT_HTR_ENABLED': '1', 'PCT_HTR_MODEL': str(model),
                        'PATH': str(root) + ':' + env.get('PATH', '')})
            output = subprocess.run([sys.executable, str(BASE / 'pdf-evidence.py'), str(pdf)],
                                    env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(output.returncode, 0, output.stdout + output.stderr)
            replay = json.loads(output.stdout)
            self.assertEqual(replay['pages'][0]['method'], 'KRAKEN_HTR')
            self.assertEqual(replay['pages'][0]['text'], 'Galera arrivo a Milo nel 1677')
            self.assertEqual(replay['pages'][0]['htr_status'], 'OK')
            self.assertEqual(replay['pages'][0]['transcription_review'], 'UNREVIEWED')
            self.assertEqual(replay['htr_pages'], 1)
            self.assertFalse(replay['historically_verified'])
            self.assertEqual(len(replay['source_sha256']), 64)


if __name__ == '__main__':
    unittest.main()
