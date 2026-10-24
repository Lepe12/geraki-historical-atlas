#!/usr/bin/env python3
"""Read-only NABOU HTR host prerequisite check. No downloads, secrets, or writes."""
import json
import os
import shutil
import sys
from pathlib import Path

def usable_memory_mb():
    try:
        data = Path('/proc/meminfo').read_text()
        for line in data.splitlines():
            if line.startswith('MemAvailable:'):
                return int(line.split()[1]) // 1024
    except (OSError, ValueError, IndexError):
        pass
    return None

def main():
    paths = {x: bool(shutil.which(x)) for x in ('python3', 'kraken', 'pdftotext', 'pdftoppm', 'pdfinfo', 'tesseract')}
    model = os.environ.get('PCT_HTR_MODEL', '').strip()
    p = Path(model).expanduser() if model else None
    data = {
        'schema': 'nabou-htr-preflight-v1',
        'read_only': True,
        'python_version': sys.version.split()[0],
        'cpus_visible': os.cpu_count(),
        'memory_available_mb_host': usable_memory_mb(),
        'binaries_present': paths,
        'htr_enabled': os.environ.get('PCT_HTR_ENABLED') == '1',
        'model_configured': bool(model),
        'model_file_readable': bool(p and p.is_file() and os.access(p, os.R_OK)),
        'ready_for_real_htr': bool(paths['kraken'] and paths['pdftoppm'] and p and p.is_file() and os.access(p, os.R_OK)),
        'note': 'Host /proc/meminfo does not report effective Plesk subscription limits; independently verify cgroup/ulimit.'
    }
    print(json.dumps(data, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
