"""Self-chaining of continuation rounds for opted-in research corpora only.

A research run started after this change writes the opt-in marker
evidence/runs/<run>/research_continuation/auto_chain.json. At the end of each
round (first pass in pct-parallel-multi-agent.yml, single or sharded reanalysis
in research-semantic-reanalysis.yml) `chain` decides whether this same run_id
gets its next round and logs the decision in rounds.json (auto_chain_decisions).
Corpora without the marker (everything created before) never self-chain; the
hourly coordinator research-continuation.yml stays as it is.

Guards, in order: auto_continue true, marker present and enabled, no
auto_continue=false hold, progress (handoff restart / pending queue), no clean
stop in rounds.json, total rounds under the cap (PCT_CONTINUATION_MAX_ROUNDS,
else 10, never above 10), and no other reanalysis round for this run_id
queued or running. Coverage metrics only; never historical acceptance.
"""
import argparse
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from continuation_rounds import load, ledger_path, queue_counts, stopped
from research_continuation import atomic
from research_continuation_handoff import auto_continue_held

MARKER = 'research_continuation/auto_chain.json'
SCHEMA = 'research-auto-chain-v1'
HARD_CAP = 10
WORKFLOW = 'research-semantic-reanalysis.yml'
ACTIVE_STATUSES = ('queued', 'in_progress', 'waiting', 'pending', 'requested')
LOG_KEEP = 50


def numeric(run_id):
    if not isinstance(run_id, str) or not run_id.isdigit():
        raise ValueError('NUMERIC_PARENT_RUN_REQUIRED')
    return run_id


def round_cap(env=None):
    env = os.environ if env is None else env
    try:
        value = int(env.get('PCT_CONTINUATION_MAX_ROUNDS') or HARD_CAP)
    except ValueError:
        value = HARD_CAP
    return max(0, min(value, HARD_CAP))


def marker_enabled(root):
    path = Path(root) / MARKER
    try:
        value = json.loads(path.read_text())
    except (OSError, ValueError):
        return False  # missing or unreadable marker fails closed
    return isinstance(value, dict) and value.get('schema') == SCHEMA and value.get('auto_chain') is True


def write_marker(root, set_by_run, now=None):
    now = now or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    atomic(Path(root) / MARKER, {'schema': SCHEMA, 'auto_chain': True,
                                 'set_by_run': str(set_by_run), 'created_utc': now})


def rounds_done(root):
    """Continuation rounds already recorded or published for this corpus."""
    root = Path(root)
    recorded = max([r.get('round', 0) for r in load(root).get('rounds') or []] or [0])
    published = len([p for p in root.glob('semantic_reanalysis_*') if p.is_dir()])
    return max(recorded, published)


def decide(root, auto_continue, restart, active_runs, first_pass=False, env=None):
    """Return (continue, reason) for the next round of this one corpus."""
    root = Path(root)
    if not auto_continue:
        return False, 'AUTO_CONTINUE_FALSE'
    if not marker_enabled(root):
        return False, 'NO_AUTO_CHAIN_MARKER'
    if auto_continue_held(root):
        return False, 'AUTO_CONTINUE_HELD'
    if first_pass:
        counts = queue_counts(root)
        if not counts or counts.get('status') != 'PENDING' or counts['total'] - counts['examined'] <= 0:
            return False, 'FIRST_PASS_COVERAGE_NOT_PENDING'
    elif not restart:
        return False, 'HANDOFF_NO_PROGRESS_OR_NOT_RESUMABLE'
    reason = stopped(root)
    if reason:
        return False, 'CONTINUATION_STOPPED:' + reason
    done, cap = rounds_done(root), round_cap(env)
    if done >= cap:
        return False, 'ROUND_CAP_REACHED:%d/%d' % (done, cap)
    if active_runs:
        return False, 'ROUND_ALREADY_QUEUED_OR_RUNNING:' + ','.join(sorted(str(r) for r in active_runs))
    return True, 'NEXT_ROUND:%d/%d' % (done + 1, cap)


def log(root, entry):
    """Append the decision to rounds.json; continuation_rounds.record keeps it."""
    root = Path(root)
    if not ledger_path(root).parent.exists():
        return None
    ledger = load(root)
    ledger['auto_chain_decisions'] = (ledger.get('auto_chain_decisions') or [])[-(LOG_KEEP - 1):] + [entry]
    atomic(ledger_path(root), ledger)
    return ledger


def gh_json(path):
    return json.loads(subprocess.check_output(['gh', 'api', '--paginate', '--slurp', path], text=True))


def run_matches(run, run_id, jobs_of):
    if re.search(r'(^|\D)' + run_id + r'($|\D)', str(run.get('display_title') or '')):
        return True
    pattern = re.compile(r'(Reanalyse actual sources|Plan reading) ' + run_id + r'$')
    return any(pattern.search(job.get('name') or '') for job in jobs_of(run['id']))


def active_rounds(repository, run_id, current_run, pages=gh_json):
    """Other reanalysis runs of this run_id that are queued or running (fails closed)."""
    def jobs_of(run):
        return [job for page in pages('repos/%s/actions/runs/%s/jobs?per_page=100' % (repository, run))
                for job in page.get('jobs', [])]
    found = set()
    for status in ACTIVE_STATUSES:
        for page in pages('repos/%s/actions/workflows/%s/runs?status=%s&per_page=100' % (repository, WORKFLOW, status)):
            for run in page.get('workflow_runs', []):
                if str(run['id']) != str(current_run) and run_matches(run, run_id, jobs_of):
                    found.add(str(run['id']))
    return found


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['mark', 'chain', 'dispatch'])
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--restart', default='false')
    parser.add_argument('--auto-continue', default='true')
    parser.add_argument('--shards', default='1')
    parser.add_argument('--first-pass', action='store_true')
    args = parser.parse_args(argv)
    run_id = numeric(args.run_id)
    root = Path('evidence/runs') / run_id
    if args.mode == 'mark':
        write_marker(root, os.environ.get('GITHUB_RUN_ID', run_id))
        print('AUTO_CHAIN_MARKER_WRITTEN:' + run_id)
        return
    shards = str(max(1, min(4, int(args.shards or 1)))) if str(args.shards or '1').isdigit() else '1'
    if args.mode == 'dispatch':
        subprocess.check_call(['gh', 'workflow', 'run', WORKFLOW, '--repo', os.environ['GITHUB_REPOSITORY'],
                               '--ref', 'main', '-f', 'run_id=' + run_id, '-f', 'semantic_shards=' + shards,
                               '-f', 'auto_continue=true'])
        print('AUTO_CHAIN_DISPATCHED:' + run_id + ':shards=' + shards)
        return
    auto_continue = args.auto_continue == 'true'
    current = os.environ.get('GITHUB_RUN_ID', '')
    active, ok = set(), True
    if auto_continue and marker_enabled(root):
        try:
            active = active_rounds(os.environ['GITHUB_REPOSITORY'], run_id, current)
        except (subprocess.CalledProcessError, OSError, ValueError, KeyError):
            ok = False
    if ok:
        go, reason = decide(root, auto_continue, args.restart == 'true', active, args.first_pass)
    else:
        go, reason = False, 'ACTIVE_ROUND_CHECK_FAILED'
    entry = {'decision': 'continue' if go else 'stop', 'reason': reason, 'by_run': current,
             'first_pass': args.first_pass, 'semantic_shards': int(shards),
             'decided_utc': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    log(root, entry)
    print(json.dumps({'auto_chain_decision': entry, 'historical_acceptance': False}))
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write('dispatch=%s\nshards=%s\n' % ('true' if go else 'false', shards))


if __name__ == '__main__':
    main()
