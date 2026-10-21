"""Restart only published, advancing continuation checkpoints; never mark research green."""
import argparse
import json
import os
from pathlib import Path

from research_continuation import digest, effective_citation_backlogs, latest_analysis


def state(root):
    root = Path(root)
    active = root / 'research_continuation/active.json'
    if not active.exists():
        return {'queue': None, 'completed': [], 'responses': []}
    relative = json.loads(active.read_text())['queue']
    queue_path = (active.parent / relative).resolve()
    if not queue_path.is_relative_to(active.parent.resolve()):
        raise ValueError('UNSAFE_QUEUE_PATH')
    queue = json.loads(queue_path.read_text())
    ids = [item['evidence_id'] for item in queue['items']]
    completed = sorted(item['evidence_id'] for item in queue['items'] if item['status'] == 'EXAMINED')
    if len(ids) != len(set(ids)) or len(ids) != queue['total'] or len(completed) != queue['completed']:
        raise ValueError('INCONSISTENT_QUEUE_COUNTS')
    responses = sorted(queue_path.parent.glob('responses/*.json'))
    for path in responses:
        receipt = json.loads(path.read_text())
        if digest(receipt['result']) != receipt['result_sha256']:
            raise ValueError('INVALID_RESPONSE_CHECKSUM')
    return {'queue': relative, 'completed': completed, 'status': queue['status'],
            'phase': queue.get('phase'), 'total': queue['total'],
            'responses': [p.name for p in responses]}


def select(base):
    requested = set()
    for path in (base / 'research_continuation_requests').glob('*.json'):
        run = str(json.loads(path.read_text())['run_id'])
        if not run.isdigit():
            raise ValueError('NUMERIC_PARENT_RUN_REQUIRED')
        requested.add(run)
    selected = {}
    for root in sorted((base / 'evidence/runs').glob('*')):
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
    if answer.get('status') not in ('RESEARCH_COVERAGE_PENDING', 'RESEARCH_REVIEW_PENDING',
                                   'MODEL_ANSWER_PENDING_HUMAN_REVIEW', 'NO_MODEL_SUPPORTED_CLAIMS'):
        return False, 'NON_RESUMABLE_ANALYSIS:' + str(answer.get('status'))
    if any(c.get('status') != 'COMPLETED' for c in answer.get('calls', [])):
        return False, 'MODEL_CALL_NOT_COMPLETED'
    after = state(root)
    if after.get('status') != 'PENDING':
        return False, 'NO_PENDING_SEMANTIC_WORK'
    if before['queue'] is not None and before['queue'] != after['queue']:
        return False, 'CHECKPOINT_GENERATION_CHANGED_REQUIRES_REASSESSMENT'
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
    parser.add_argument('mode', choices=['select', 'handoff'])
    parser.add_argument('--baseline', default='{}')
    args = parser.parse_args()
    if args.mode == 'select':
        selected = select(Path('.'))
        values = {'runs': list(selected), 'baseline': selected}
    else:
        decisions = {}
        for run, before in json.loads(args.baseline).items():
            try:
                decisions[run] = decision(Path('evidence/runs') / run, before, os.environ['GITHUB_RUN_ID'])
            except (OSError, ValueError, KeyError, TypeError) as error:
                decisions[run] = (False, 'INVALID_OR_MISSING_CHECKPOINT:' + type(error).__name__)
        print(json.dumps({'handoff_decisions': decisions, 'historical_acceptance': False}))
        values = {'restart': any(value[0] for value in decisions.values()) and
                  all(value[0] or value[1] == 'NO_PENDING_SEMANTIC_WORK' for value in decisions.values())}
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        for key, value in values.items():
            output.write(key + '=' + json.dumps(value, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()
