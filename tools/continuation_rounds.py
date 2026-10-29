"""Per-round continuation metrics and stop rules; never historical acceptance.

Ledger: evidence/runs/<run>/research_continuation/rounds.json
  round 0 = the research run's own semantic pass, round N = N-th reanalysis.
Stop reasons (clean stops, not failures):
  ALL_EXCERPTS_READ          nothing left in the queue
  MAX_CONTINUATION_ROUNDS    PCT_CONTINUATION_MAX_ROUNDS reanalysis rounds done (default 5)
  NO_NEW_SUPPORTED_CLAIMS    PCT_CONTINUATION_NO_GAIN_ROUNDS consecutive rounds (default 2)
                             examined new excerpts without a new quotation-supported claim
"""
import json
import os
from pathlib import Path

from research_continuation import atomic

SCHEMA = 'research-continuation-rounds-v1'
SUPPORTED = ('QUOTATION_SUPPORTED_HISTORY_PENDING', 'SOURCE_ATTRIBUTED_HYPOTHESIS')
CLEAN_STOPS = ('ALL_EXCERPTS_READ', 'MAX_CONTINUATION_ROUNDS', 'NO_NEW_SUPPORTED_CLAIMS')


def caps(env=None):
    env = os.environ if env is None else env
    return {'max_rounds': max(0, int(env.get('PCT_CONTINUATION_MAX_ROUNDS', '5'))),
            'no_gain_rounds': max(1, int(env.get('PCT_CONTINUATION_NO_GAIN_ROUNDS', '2')))}


def ledger_path(root):
    return Path(root) / 'research_continuation/rounds.json'


def load(root):
    path = ledger_path(root)
    try:
        value = json.loads(path.read_text())
        if value.get('schema') == SCHEMA and isinstance(value.get('rounds'), list):
            return value
    except (OSError, ValueError, AttributeError):
        pass
    return {'schema': SCHEMA, 'rounds': [], 'stop_reason': None}


def supported_ids(answer):
    return sorted(c['claim_id'] for c in (answer.get('claim_evidence_assessment') or {}).get('claims', [])
                  if c.get('status') in SUPPORTED)


def queue_counts(root):
    root = Path(root) / 'research_continuation'
    try:
        queue = json.loads((root / json.loads((root / 'active.json').read_text())['queue']).read_text())
        return {'total': queue['total'], 'examined': queue['completed'], 'status': queue.get('status')}
    except (OSError, ValueError, KeyError, TypeError):
        return None


def stop_rule(ledger, cap):
    """Return the clean stop reason for the next round, or None to continue."""
    rounds = ledger.get('rounds') or []
    if not rounds:
        return None
    last = rounds[-1]
    if last['remaining'] <= 0 or last.get('queue_status') == 'COMPLETE':
        return 'ALL_EXCERPTS_READ'
    continuation = [r for r in rounds if r['round'] >= 1]
    if last['round'] >= cap['max_rounds']:
        return 'MAX_CONTINUATION_ROUNDS'
    tail = continuation[-cap['no_gain_rounds']:]
    if len(tail) == cap['no_gain_rounds'] and all(r['new_supported_claims'] == 0 for r in tail):
        return 'NO_NEW_SUPPORTED_CLAIMS'
    return None


def record(root, answer, round_number, analysis_path=None, env=None):
    """Append this round's metrics and the resulting stop decision to the ledger."""
    root = Path(root)
    cap = caps(env)
    ledger = load(root)
    rounds = [r for r in ledger['rounds'] if r['round'] != round_number]
    previous_supported = {cid for r in rounds for cid in r.get('supported_claim_ids', [])}
    previous_examined = max([r['examined'] for r in rounds] or [0])
    funnel = answer.get('research_funnel') or {}
    counts = queue_counts(root)
    total = counts['total'] if counts else (funnel.get('collected') or {}).get('unique_excerpts', 0)
    examined = counts['examined'] if counts else (funnel.get('examined') or {}).get('excerpts', 0)
    supported = supported_ids(answer)
    row = {'round': round_number, 'analysis_path': analysis_path, 'status': answer.get('status'),
           'total': total, 'examined': examined, 'remaining': max(0, total - examined),
           'new_examined': max(0, examined - previous_examined),
           'supported_claims': len(supported),
           'new_supported_claims': len(set(supported) - previous_supported),
           'supported_claim_ids': supported,
           'answer_paragraphs': len(answer.get('answer_sections') or []),
           'queue_status': counts['status'] if counts else None,
           'prefilter': {k: (funnel.get('prefilter') or {}).get(k) for k in
                         ('filtered_out', 'filtered_by_reason', 'kept_excerpts', 'model_units',
                          'sentence_windows', 'sent_this_pass')} if (funnel.get('prefilter') or {}).get('applied') else None,
           'collected': (funnel.get('collected') or {}).get('unique_excerpts'),
           'model_calls': len(answer.get('calls') or [])}
    rounds.append(row)
    rounds.sort(key=lambda r: r['round'])
    ledger = {'schema': SCHEMA, 'caps': cap, 'rounds': rounds,
              'role': 'COVERAGE_METRICS_NOT_HISTORICAL_VERIFICATION'}
    ledger['stop_reason'] = stop_rule(ledger, cap)
    atomic(ledger_path(root), ledger)
    return ledger


def round_number(root, analysis_dir_name):
    """Reanalysis passes already published in this parent run, this one included."""
    names = {p.name for p in Path(root).glob('semantic_reanalysis_*') if p.is_dir()}
    names.add(analysis_dir_name)
    return len(names)


def stopped(root):
    reason = load(root).get('stop_reason')
    return reason if reason in CLEAN_STOPS else None
