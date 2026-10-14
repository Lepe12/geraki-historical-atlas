#!/usr/bin/env python3
"""Normalize standalone library results for the unchanged host importer."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

from queue_mariadb_storage import queue


def main():
    run_id = os.environ.get('GITHUB_RUN_ID', '')
    if not re.fullmatch(r'[1-9][0-9]*', run_id):
        raise ValueError('INVALID_RUN_ID')
    identity = json.loads(Path('research_request_identity.json').read_text(encoding='utf-8'))
    if not identity.get('research_job_id') or not identity.get('request_sha256') or not isinstance(identity.get('normalized_request'), dict):
        raise ValueError('PINNED_REQUEST_MISSING')
    roots = ['research_request_identity.json', 'research_discovery', 'library_discovery', 'citation_chase_candidates',
             'library_acquisition', 'citation_chase_hits', 'event_first_hits', 'exact_page_acquisition',
             'original_inspection', 'source_genealogy', 'corroboration', 'human_review',
             'verification', 'qa', 'structured_output', 'research_dossier', 'run_manifest']
    staging = Path('outbound_library_staging')
    staging.mkdir(exist_ok=False)
    for root in roots:
        source = Path(root)
        if source.is_symlink() or (source.is_dir() and any(p.is_symlink() for p in source.rglob('*'))):
            raise ValueError('OUTPUT_SYMLINK')
        if source.is_file():
            shutil.copyfile(source, staging / root)
        elif source.is_dir():
            shutil.copytree(source, staging / root)
    lanes = staging / 'research_lanes'
    lanes.mkdir()
    identity.update(lane='travellers', execution_scope='standalone-library-agent')
    (lanes / 'travellers.json').write_text(json.dumps(identity, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Execute only trusted repository code; the staging directory contains data.
    script = Path('tools/preserve_run_evidence.py').resolve()
    subprocess.run(['python3', str(script), '--run-id', run_id, '--lane', 'travellers'], cwd=staging, check=True)
    queue(staging / 'evidence/runs', run_id)
    shutil.copytree(staging / 'evidence', Path('outbound_library_results/evidence'))
    print('LIBRARY_BUNDLE_READY', run_id)


if __name__ == '__main__':
    main()
