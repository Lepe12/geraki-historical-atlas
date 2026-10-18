#!/usr/bin/env python3
"""Index existing research snapshots without changing scientific evidence."""
import argparse
import json
from pathlib import Path


def build_history(directory):
    rows = {}
    for path in sorted(Path(directory).glob('runs/*.json')):
        data = json.loads(path.read_text(encoding='utf-8'))
        run = str(data.get('run_id', ''))
        if (not run.isascii() or not run.isdigit() or path.stem != run
                or data.get('schema') != 'pct-command-center-live-v1'
                or data.get('safety', {}).get('automatic_verified') is not False):
            continue
        mission = data.get('mission') or {}
        rows[run] = {'run_id': run, 'target': mission.get('target') or 'Έρευνα '+run,
                     'date_range': mission.get('date_range') or '',
                     'generated_utc': data.get('generated_utc') or '',
                     'status': mission.get('status') or 'UNKNOWN'}
    return {'schema': 'nabou-research-history-v1',
            'runs': sorted(rows.values(), key=lambda r: int(r['run_id']), reverse=True)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', default='command-center/live')
    args = parser.parse_args()
    directory = Path(args.directory)
    result = build_history(directory)
    (directory/'index.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('RESEARCH HISTORY', len(result['runs']), 'runs')
