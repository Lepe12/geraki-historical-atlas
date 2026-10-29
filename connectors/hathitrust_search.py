#!/usr/bin/env python3
"""HathiTrust Bibliographic API lookups for Internet Archive texts that carry an OCLC number: registry entry point for tools/connectors/connector_runner.py.

Thin wrapper over tools/connectors/open_collections_extra.py (official APIs only).
Prints one JSON object with status and records.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / 'tools' / 'connectors'))
from open_collections_extra import main  # noqa: E402

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:] + ['--source', 'hathitrust']))
