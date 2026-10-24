#!/usr/bin/env python3
"""Deterministic Kraken adapter contract tests; no external model required."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('htr_kraken', BASE / 'htr_kraken.py')
htr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(htr)


class KrakenPilotTest(unittest.TestCase):
    def test_disabled_by_default(self):
        with patch.dict(os.environ, {'PCT_HTR_ENABLED': '0', 'PCT_HTR_MODEL': '/tmp/a.mlmodel'}):
            self.assertEqual(htr.configuration(), ('DISABLED', None))

    def test_missing_model_fails_closed(self):
        with patch.dict(os.environ, {'PCT_HTR_ENABLED': '1', 'PCT_HTR_MODEL': '/no/such/model.mlmodel'}):
            self.assertEqual(htr.configuration(), ('MODEL_UNAVAILABLE', None))

    def test_empty_model_fails_closed(self):
        with patch.dict(os.environ, {'PCT_HTR_ENABLED': '1', 'PCT_HTR_MODEL': ''}):
            self.assertEqual(htr.configuration(), ('MODEL_NOT_CONFIGURED', None))

    def test_kraken_command_and_transcription(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            executable = base / 'kraken'
            executable.write_text('#!/bin/sh\n[ "$1" = "-i" ] || exit 17\n[ "$4" = "--device" ] || exit 18\n[ "$5" = "cpu" ] || exit 19\n[ "$6" = "segment" ] || exit 20\n[ "$7" = "-bl" ] || exit 21\n[ "$8" = "ocr" ] || exit 22\n[ "$9" = "-m" ] || exit 23\nprintf "Milo 1677" > "$3"\n')
            executable.chmod(0o700)
            model = base / 'historical.mlmodel'
            model.write_bytes(b'mock-model')
            image = base / 'page.png'
            image.write_bytes(b'mock-image')
            with patch.dict(os.environ, {'PCT_HTR_ENABLED': '1', 'PCT_HTR_MODEL': str(model), 'PATH': tmp + ':' + os.environ.get('PATH', '')}):
                status, model_path = htr.configuration()
                self.assertEqual(status, 'READY')
                self.assertEqual(htr.recognize(image, model_path), ('OK', 'Milo 1677'))

    def test_nonexistent_executable_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            model = base / 'historical.mlmodel'
            model.write_bytes(b'model')
            image = base / 'page.png'
            image.write_bytes(b'png')
            with patch.dict(os.environ, {'PATH': tmp}):
                self.assertEqual(htr.recognize(image, model)[0], 'KRAKEN_NOT_INSTALLED')


if __name__ == '__main__':
    unittest.main()
