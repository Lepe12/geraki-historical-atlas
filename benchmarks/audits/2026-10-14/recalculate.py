"""Reproduce arithmetic from the reviewed labels; does not automate historical review."""
import json
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parent
audit = json.loads((root / 'annotations.json').read_text())
groups = audit['annotations']
labels = Counter(g['label'] for g in groups)
cases = Counter(c['status'] for c in audit['cases'])
members = [m for g in groups for m in g['members']]
assert len({(g['case_id'], g['source_key']) for g in groups}) == len(groups)
assert len({(m['path'], m['candidate_id']) for m in members}) == len(members)
assert sum(r['count'] for r in audit['input_inventory']) == len(members)

def metric(numerator, denominator):
    return {'numerator': numerator, 'denominator': denominator,
            'percent': round(100 * numerator / denominator, 2) if denominator else None}

result = {
    'scope': audit['scope'],
    'lane_outputs': len(audit['input_inventory']),
    'candidate_rows': len(members),
    'source_case_groups': len(groups),
    'labels': dict(labels),
    'supported_reference_lead_rate': metric(labels['SUPPORTED_REFERENCE_LEAD'], len(groups)),
    'off_target_rate': metric(labels['OFF_TARGET'], len(groups)),
    'insufficient_context_rate': metric(labels['INSUFFICIENT_CONTEXT'], len(groups)),
    'positive_case_detection': metric(cases['DETECTED_REFERENCE'], cases['DETECTED_REFERENCE'] + cases['NOT_DETECTED']),
    'positive_benchmark_execution_coverage': metric(len(audit['cases']) - cases['UNEXECUTED'], len(audit['cases'])),
    'original_inspected_candidate_rows': sum(m['original_inspected'] for m in members),
    'verified_candidate_rows': sum(m['verified'] for m in members),
    'historical_truth_accuracy': None,
    'historical_truth_accuracy_reason': 'No independently human-reviewed original-grounded gold set; no adjudicated verified claims. Relevance percentages cannot substitute for truth accuracy.',
}
print(json.dumps(result, ensure_ascii=False, indent=2))
