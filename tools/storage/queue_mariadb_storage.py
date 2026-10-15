#!/usr/bin/env python3
"""Declare durable run data ready for host-local import; never claim DB success."""
import datetime
import json
import os
import pathlib

LANES = ['greek', 'travellers', 'spanish_simancas', 'venetian', 'french', 'british',
         'dutch', 'german', 'italian_states', 'ottoman', 'north_african']


def queue(root, run_id):
    if not run_id.isdigit():
        raise ValueError('INVALID_RUN_ID')
    run = root / run_id
    if not run.is_dir():
        raise ValueError('DURABLE_RUN_MISSING')
    present = [lane for lane in LANES if (run / lane / 'index.json').is_file()]
    report = {
        'schema': 'pct-mariadb-storage-intent-v1',
        'run_id': run_id,
        'created_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'backend': 'host-local-mariadb',
        'database': 'piratecartography',
        'status': 'QUEUED_HOST_LOCAL_IMPORT',
        'durable_lane_indexes': present,
        'missing_lane_indexes': [lane for lane in LANES if lane not in present],
        'confirmation': 'Only the hosting-local importer audit proves database persistence.',
        'verification_gate': 'Storage never promotes evidence or events to VERIFIED.',
    }
    (run / 'MARIADB_STORAGE_INTENT.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    print(json.dumps(queue(pathlib.Path('evidence/runs'), os.environ.get('PCT_RUN_ID', ''))))

