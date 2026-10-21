"""Restart only published, advancing continuation checkpoints; never mark research green."""
import argparse
import json
import os
import re
import subprocess
from pathlib import Path

from research_continuation import digest, effective_citation_backlogs, latest_analysis


def state(root, queue_relative=None):
    root = Path(root)
    active = root / 'research_continuation/active.json'
    if queue_relative is None and not active.exists():
        return {'queue': None, 'completed': [], 'responses': []}
    relative = queue_relative or json.loads(active.read_text())['queue']
    queue_path = (active.parent / relative).resolve()
    if not queue_path.is_relative_to(active.parent.resolve()):
        raise ValueError('UNSAFE_QUEUE_PATH')
    queue = json.loads(queue_path.read_text())
    ids = [item['evidence_id'] for item in queue['items']]
    completed = sorted(item['evidence_id'] for item in queue['items'] if item['status'] == 'EXAMINED')
    if len(ids) != len(set(ids)) or len(ids) != queue['total'] or len(completed) != queue['completed']:
        raise ValueError('INCONSISTENT_QUEUE_COUNTS')
    responses = sorted(queue_path.parent.glob('responses/*.json'))
    for path in queue_path.parent.glob('batches/*.json'):
        receipt = json.loads(path.read_text())
        if (receipt['source_sha256'] != path.stem or
                digest(receipt['payload']) != receipt['payload_sha256'] or
                not isinstance(receipt['payload'].get('items'), list)):
            raise ValueError('INVALID_BATCH_RECEIPT')
    for path in queue_path.parent.glob('replays/*/*.json'):
        receipt = json.loads(path.read_text())
        if (receipt['source_sha256'] != path.parent.name or
                receipt['payload_sha256'] != path.stem or
                digest(receipt['payload']) != receipt['payload_sha256']):
            raise ValueError('INVALID_REPLAY_RECEIPT')
    for path in responses:
        receipt = json.loads(path.read_text())
        if digest(receipt['result']) != receipt['result_sha256']:
            raise ValueError('INVALID_RESPONSE_CHECKSUM')
    return {'queue': relative, 'completed': completed, 'status': queue['status'],
            'phase': queue.get('phase'), 'total': queue['total'],
            'responses': [p.name for p in responses]}


def gh_pages(path):
    return json.loads(subprocess.check_output(['gh', 'api', '--paginate', '--slurp', path], text=True))


def active_parents(repository, current_run):
    busy = set()
    for page in gh_pages('repos/' + repository + '/actions/runs?status=in_progress&per_page=100'):
        for run in page['workflow_runs']:
            if str(run['id']) == str(current_run) or run['path'] not in (
                    '.github/workflows/research-continuation.yml',
                    '.github/workflows/research-semantic-reanalysis.yml'):
                continue
            for jobs in gh_pages('repos/' + repository + '/actions/runs/' + str(run['id']) + '/jobs?per_page=100'):
                for job in jobs['jobs']:
                    match = re.search(r'Reanalyse actual sources (\d+)$', job['name'])
                    if match and job['status'] in ('queued', 'in_progress'):
                        busy.add(match.group(1))
    return busy


def cancel_superseded_pending(repository, current_run):
    # Coalesce only older, unstarted coordinator requests, never model work.
    for status in ('pending', 'queued'):
        for page in gh_pages('repos/' + repository + '/actions/runs?status=' + status + '&per_page=100'):
            for run in page['workflow_runs']:
                if (run['path'] == '.github/workflows/research-continuation.yml' and
                        run.get('head_branch') == 'main' and
                        int(run['id']) < int(current_run) and run['status'] in ('pending', 'queued')):
                    subprocess.check_call(['gh', 'api', '--method', 'POST', 'repos/' + repository +
                                           '/actions/runs/' + str(run['id']) + '/cancel'])
                    print('SUPERSEDED_UNSTARTED_COORDINATOR_CANCELLED:' + str(run['id']))


def select(base, excluded=()):
    requested = set()
    for path in (base / 'research_continuation_requests').glob('*.json'):
        run = str(json.loads(path.read_text())['run_id'])
        if not run.isdigit():
            raise ValueError('NUMERIC_PARENT_RUN_REQUIRED')
        requested.add(run)
    selected = {}
    for root in sorted((base / 'evidence/runs').glob('*')):
        if root.name in excluded:
            continue
        before = state(root)
        citations = any(json.loads(p.read_text()).get('pending') or json.loads(p.read_text()).get('deferred')
                        for p in effective_citation_backlogs(root))
        if before.get('status') == 'PENDING' or citations or (before['queue'] is None and root.name in requested):
            selected[root.name] = before
    return dict(list(selected.items())[:2])


def decision(root, before, run_id):
    """A crash, failed publication, reset queue or repeated sample must not self-loop."""
    pointer = json.loads((root / 'research_continuation/latest.json').read_text())
    if pointer['analysis_path'] != 'semantic_reanalysis_' + str(run_id):
        return False, 'CURRENT_EXECUTION_NOT_PUBLISHED'
    result = latest_analysis(root)
    if result is None:
        return False, 'INVALID_PUBLISHED_CHECKSUMS'
    answer, validation = result
    if validation.get('status') not in ('INCOMPLETE', 'PASS'):
        return False, 'VALIDATION_NOT_RESUMABLE:' + str(validation.get('status'))
    if 'CONTINUATION_RECEIPTS_INVALID' in validation.get('blockers', []):
        return False, 'CONTINUATION_RECEIPTS_INVALID'
    # Valid extraction can yield zero relevant claims; that is not a crash.
    empty_extraction = (answer.get('status') == 'EXTRACTION_FAILED_OR_UNSUPPORTED' and
                        answer.get('calls') and not answer.get('claims') and
                        not any(item.get('reason') == 'EXTRACTION_RESPONSE_FAILED'
                                for item in answer.get('coverage', {}).get('deferred', [])))
    if not empty_extraction and answer.get('status') not in (
            'RESEARCH_COVERAGE_PENDING', 'RESEARCH_REVIEW_PENDING',
            'MODEL_ANSWER_PENDING_HUMAN_REVIEW', 'NO_MODEL_SUPPORTED_CLAIMS'):
        return False, 'NON_RESUMABLE_ANALYSIS:' + str(answer.get('status'))
    if any(c.get('status') != 'COMPLETED' for c in answer.get('calls', [])):
        return False, 'MODEL_CALL_NOT_COMPLETED'
    after = state(root)
    if after.get('status') != 'PENDING':
        return False, 'NO_PENDING_SEMANTIC_WORK'
    if before['queue'] is not None and before['queue'] != after['queue']:
        # Code/configuration changes intentionally create a new cache generation.
        # Preserve and verify the old one; do not label its work reused under the
        # new algorithm, or freeze a legitimate migration forever.
        archived = state(root, before['queue'])
        if not set(before['completed']) <= set(archived['completed']):
            return False, 'PREVIOUS_GENERATION_WORK_LOST'
        if after['completed']:
            return True, ('CHECKPOINT_GENERATION_MIGRATED:archived=' + str(len(archived['completed'])) +
                          ':current=' + str(len(after['completed'])))
        return False, 'NEW_CHECKPOINT_GENERATION_HAS_NO_PROGRESS'
    old = set(before['completed'])
    new = set(after['completed'])
    if not old <= new:
        return False, 'PREVIOUS_COMPLETED_ITEMS_LOST'
    if new - old:
        return True, 'NEW_EXAMINED_ITEMS:' + str(len(new - old))
    if after.get('phase') == 'REVIEW_AND_SYNTHESIS' and set(after['responses']) - set(before['responses']):
        return True, 'NEW_REVIEW_OR_SYNTHESIS_RESPONSES'
    return False, 'NO_CHECKPOINT_PROGRESS'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['select', 'handoff', 'baseline'])
    parser.add_argument('--run-id')
    parser.add_argument('--dispatch', action='store_true')
    parser.add_argument('--baseline', default='{}')
    parser.add_argument('--exclude-active', action='store_true')
    args = parser.parse_args()
    inherited = json.loads(os.getenv('PCT_CONTINUATION_EXCLUDED_RUNS', '[]'))
    if not isinstance(inherited, list) or any(not isinstance(run, str) or not run.isdigit() for run in inherited):
        raise ValueError('NUMERIC_EXCLUDED_RUN_IDS_REQUIRED')
    if args.mode == 'baseline':
        if not args.run_id or not args.run_id.isdigit():raise ValueError('NUMERIC_PARENT_RUN_REQUIRED')
        values = {'baseline': {args.run_id: state(Path('evidence/runs') / args.run_id)}}
    elif args.mode == 'select':
        busy = set()
        if args.exclude_active:
            repository = os.environ['GITHUB_REPOSITORY']
            current_run = os.environ['GITHUB_RUN_ID']
            cancel_superseded_pending(repository, current_run)
            busy = active_parents(repository, current_run)
            print(json.dumps({'active_parent_runs_deferred': sorted(busy)}))
        selected = select(Path('.'), busy | set(inherited))
        values = {'runs': list(selected), 'baseline': selected}
        if args.dispatch:
            dispatch_selected(os.environ['GITHUB_REPOSITORY'], selected)
    else:
        decisions = {}
        for run, before in json.loads(args.baseline).items():
            try:
                decisions[run] = decision(Path('evidence/runs') / run, before, os.environ['GITHUB_RUN_ID'])
            except (OSError, ValueError, KeyError, TypeError) as error:
                decisions[run] = (False, 'INVALID_OR_MISSING_CHECKPOINT:' + type(error).__name__)
        print(json.dumps({'handoff_decisions': decisions, 'historical_acceptance': False}))
        values = handoff_outputs(decisions, inherited)
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        for key, value in values.items():
            output.write(key + '=' + json.dumps(value, separators=(',', ':')) + '\n')
    if args.mode == 'handoff' and any(not value[0] and value[1] != 'NO_PENDING_SEMANTIC_WORK'
                                      for value in decisions.values()):
        raise SystemExit('AUTOMATIC_CONTINUATION_HELD: see handoff_decisions above')


def handoff_outputs(decisions, inherited=()):
    """Continue healthy corpora while keeping failed corpora explicitly held.

    Carry exclusions through this dispatch chain; a later scheduled/manual
    coordinator can retry them after repair. No failed corpus self-restarts.
    """
    held = {run for run, value in decisions.items()
            if not value[0] and value[1] != 'NO_PENDING_SEMANTIC_WORK'}
    return {'restart': any(value[0] for value in decisions.values()),
            'held_runs': sorted(set(inherited) | held)}


def dispatch_selected(repository, selected):
    """Submit independent workers; never wait for their model work to finish."""
    if any(not isinstance(run,str) or not run.isdigit() for run in selected):
        raise ValueError('NUMERIC_PARENT_RUN_REQUIRED')
    failed=[]
    for run in selected:
        try:
            subprocess.check_call(['gh','workflow','run','research-semantic-reanalysis.yml',
                '--repo',repository,'--ref','main','-f','run_id='+run])
            print('INDEPENDENT_CONTINUATION_DISPATCHED:'+run)
        except subprocess.CalledProcessError:
            failed.append(run)
            print('INDEPENDENT_CONTINUATION_DISPATCH_FAILED:'+run)
    if failed:raise SystemExit('CONTINUATION_DISPATCH_FAILED:'+','.join(failed))


if __name__ == '__main__':
    main()


