"""Submit one explicit resume request to the existing semantic workflow.

This does not clear stop records, change evidence, or enable an automatic chain.
Only newly pushed request files are passed by the existing coordinator.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
from datetime import datetime, timezone


def submit(path, base, repository, current_run, active_check=None, dispatch=None):
    base = Path(base).resolve()
    path = Path(path).resolve()
    folder = base / 'research_continuation_requests'
    if path.parent != folder or path.suffix != '.json':
        raise ValueError('REQUEST_PATH_OUTSIDE_REQUEST_DIRECTORY')
    request = json.loads(path.read_text())
    if request.get('action') != 'resume_once':
        return {'status': 'NOT_A_MANUAL_RESUME_REQUEST'}
    run_id = request.get('run_id')
    if not isinstance(run_id, str) or not re.fullmatch(r'[0-9]+', run_id):
        raise ValueError('NUMERIC_PARENT_RUN_REQUIRED')
    if request.get('resume_stopped_research') is not True:
        raise ValueError('EXPLICIT_STOPPED_RESEARCH_RESUME_REQUIRED')
    shards = request.get('semantic_shards', 1)
    if type(shards) is not int or not 1 <= shards <= 4:
        raise ValueError('SHARDS_MUST_BE_INTEGER_1_TO_4')
    if not isinstance(request.get('reason'), str) or not request['reason'].strip():
        raise ValueError('RESUME_REASON_REQUIRED')
    skip_acquisition = request.get('skip_citation_acquisition', False)
    if type(skip_acquisition) is not bool:
        raise ValueError('SKIP_ACQUISITION_MUST_BE_BOOLEAN')
    replay_from = request.get('replay_shards_from', '')
    if not isinstance(replay_from, str) or (replay_from and not re.fullmatch(r'[0-9]+', replay_from)):
        raise ValueError('NUMERIC_REPLAY_ANALYSIS_REQUIRED')
    if replay_from and (shards != 1 or not skip_acquisition):
        raise ValueError('SAVED_SHARD_REPLAY_REQUIRES_SINGLE_ACQUIRED_ONLY_MERGE')
    root = base / 'evidence/runs' / run_id
    if not (root / 'research_continuation/active.json').is_file():
        raise ValueError('EXISTING_RESEARCH_CHECKPOINT_REQUIRED')
    receipt = folder / 'receipts' / path.name
    if receipt.exists():
        return {'status': 'ALREADY_RECORDED', 'receipt': str(receipt.relative_to(base))}
    if active_check is None:
        from auto_chain import active_rounds
        active_check = active_rounds
    active = active_check(repository, run_id, current_run)
    if active:
        raise ValueError('RESEARCH_ALREADY_RUNNING:' + ','.join(sorted(map(str, active))))
    command = ['gh', 'workflow', 'run', 'research-semantic-reanalysis.yml',
               '--repo', repository, '--ref', 'main', '-f', 'run_id=' + run_id,
               '-f', 'semantic_shards=' + str(shards), '-f', 'auto_continue=false']
    if skip_acquisition:
        command.extend(['-f', 'skip_citation_acquisition=true'])
    if replay_from:
        command.extend(['-f', 'replay_shards_from=' + replay_from])
    record = {'schema': 'research-manual-resume-receipt-v1', 'run_id': run_id,
              'request_path': str(path.relative_to(base)), 'coordinator_run': str(current_run),
              'created_utc': datetime.now(timezone.utc).isoformat(),
              'semantic_shards': shards, 'auto_continue': False,
              'skip_citation_acquisition': skip_acquisition,
              'replay_shards_from': replay_from,
              'status': 'SUBMITTING', 'historical_verified': False}
    receipt.parent.mkdir(parents=True, exist_ok=True)
    receipt.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    try:
        (dispatch or subprocess.check_call)(command)
    except Exception:
        # A failed/uncertain submission is retained and never silently retried.
        record['status'] = 'SUBMISSION_FAILED_OR_UNCERTAIN'
        receipt.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
        raise
    record['status'] = 'DISPATCH_SUBMITTED_NOT_COMPLETED'
    receipt.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    return record


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('requests', nargs='+')
    args = parser.parse_args()
    for path in args.requests:
        print(json.dumps(submit(path, '.', os.environ['GITHUB_REPOSITORY'],
                                os.environ['GITHUB_RUN_ID']), ensure_ascii=False))


if __name__ == '__main__':
    main()
