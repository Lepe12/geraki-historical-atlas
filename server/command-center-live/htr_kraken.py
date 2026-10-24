#!/usr/bin/env python3
"""Opt-in, local-only Kraken HTR adapter for NABOU PDF evidence replay.

HTR output is an *unreviewed transcription*, never a verified historical claim.
No model download or remote request is performed.
"""
import os
from pathlib import Path
import resource
import subprocess
import tempfile


def configuration():
    """Return (status, model_path) without running an external command."""
    if os.environ.get('PCT_HTR_ENABLED') != '1':
        return 'DISABLED', None
    model = os.environ.get('PCT_HTR_MODEL', '').strip()
    if not model:
        return 'MODEL_NOT_CONFIGURED', None
    p = Path(model).expanduser()
    if p.suffix not in ('.mlmodel', '.safetensors') or not p.is_file():
        return 'MODEL_UNAVAILABLE', None
    return 'READY', str(p.resolve())


def _child_limits():
    """Raise only Kraken's address-space soft limit; parent stays at 768 MiB."""
    mem = max(1024, min(6144, int(os.environ.get('PCT_HTR_MEMORY_MB', '4096'))))
    limit = mem * 1024 * 1024
    _, hard = resource.getrlimit(resource.RLIMIT_AS)
    if hard != resource.RLIM_INFINITY:
        limit = min(limit, hard)
    resource.setrlimit(resource.RLIMIT_AS, (limit, hard))


def recognize(image, model_path, timeout=45):
    """Return (status, transcription). No shell, no network, no silent fallback."""
    path = Path(image)
    if not path.is_file() or not Path(model_path).is_file():
        return 'INPUT_OR_MODEL_MISSING', ''
    timeout = max(5, min(60, int(timeout)))
    with tempfile.TemporaryDirectory(prefix='nabou-htr-') as tmp:
        dest = Path(tmp) / 'transcription.txt'
        try:
            result = subprocess.run(
                ['kraken', '-i', str(path), str(dest), '--device', 'cpu',
                 'segment', '-bl', 'ocr', '-m', str(model_path)],
                stdin=subprocess.DEVNULL, capture_output=True, timeout=timeout,
                check=False, preexec_fn=_child_limits,
            )
        except FileNotFoundError:
            return 'KRAKEN_NOT_INSTALLED', ''
        except subprocess.TimeoutExpired:
            return 'TIMEOUT', ''
        except (OSError, ValueError, subprocess.SubprocessError):
            return 'EXECUTION_ERROR', ''
        if result.returncode != 0:
            return 'KRAKEN_FAILED', ''
        if not dest.is_file():
            return 'NO_OUTPUT', ''
        if dest.stat().st_size > 1024 * 1024:
            return 'OUTPUT_TOO_LARGE', ''
        value = dest.read_text(encoding='utf-8', errors='replace').strip()
        return ('OK', value) if value else ('EMPTY_RESULT', '')
