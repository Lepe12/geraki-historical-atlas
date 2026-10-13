"""Read-only evidence-gap audit. Neither modifies nor verifies candidate records."""
import argparse
from collections import Counter
import datetime
import hashlib
import json
from pathlib import Path
import re
from candidate_context import review_preserved


def read(path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding='utf-8'))


def audit(root=Path('evidence/runs')):
    root = Path(root)
    records, failures, inputs, groups = [], [], [], {}
    files = 0
    for path in sorted(root.glob('*/*/structured_output/candidate_events.json')):
        base = path.parent.parent
        try:
            raw = path.read_bytes()
            data = json.loads(raw)
            events = data.get('events')
            if not isinstance(events, list):
                raise ValueError('EVENT_LIST_MISSING')
            files += 1
            digest = hashlib.sha256(raw).hexdigest()
            source_path = '/'.join(('evidence', 'runs', *path.relative_to(root).parts))
            inputs.append({'path': source_path, 'sha256': digest, 'records': len(events)})
            if not events:
                continue
            lane = base.name
            for sidecar in (f'research_lanes/{lane}.json', 'research_request_identity.json',
                            'original_inspection/inspection_queue.json', 'source_genealogy/genealogy_queue.json',
                            'corroboration/corroboration_queue.json', 'human_review/review_queue.json'):
                sp = base/sidecar
                if sp.exists():
                    inputs.append({'path': '/'.join(('evidence', 'runs', *sp.relative_to(root).parts)),
                                   'sha256': hashlib.sha256(sp.read_bytes()).hexdigest(), 'kind': 'SIDECAR'})
            identity = read(base/'research_lanes'/f'{lane}.json')
            if identity is None:
                identity = read(base/'research_request_identity.json')
            identity = identity or {}
            request = next((identity[k] for k in ('normalized_request', 'normalized_context', 'research_request')
                            if isinstance(identity.get(k), dict) and identity[k].get('target')), None)
            human = read(base/'human_review/review_queue.json') or {}
            human_items = {x.get('candidate_id'): x for x in human.get('items', [])}
            inspection = read(base/'original_inspection/inspection_queue.json') or {}
            genealogy = read(base/'source_genealogy/genealogy_queue.json') or {}
            corroboration = read(base/'corroboration/corroboration_queue.json') or {}
            support = {x.get('candidate_id'): x for x in corroboration.get('candidate_events', [])}
            for number, c in enumerate(events):
                if not isinstance(c, dict):
                    raise ValueError('CANDIDATE_NOT_OBJECT')
                if request:
                    years = [int(y) for y in re.findall(r'\b(?:1[0-9]{3}|20[0-9]{2})\b', str(request.get('date_range', '')))]
                    lo, hi = (min(years), max(years)) if years else (0, 9999)
                    routing = review_preserved(c, request['target'], request.get('aliases', []), lo, hi)
                else:
                    routing = {'decision': 'REVIEW_CONTEXT', 'reason': 'PRESERVED_REQUEST_CONTEXT_MISSING'}
                review = human_items.get(c.get('candidate_id'), {})
                checks = {
                    'bibliographic_identity': bool(c.get('identifier') or c.get('url')),
                    'exact_page_mapping': any(p.get('printed_page') is not None and
                                              (p.get('leaf') is not None or p.get('canvas_id')) and p.get('image_file')
                                              for p in c.get('exact_page_candidates', [])),
                    'original_inspection_attestation': bool(c.get('original_inspected') is True and
                        c.get('inspection_evidence') and c.get('inspection_reviewer')),
                    'controlled_extraction': bool(c.get('extracted') is True and c.get('source_says') and
                        (c.get('controlled_transcription') or c.get('original_quote'))),
                    'event_date_place_attestation': bool(c.get('extraction_evidence') and
                        c.get('extracted') is True and c.get('date') and c.get('place')),
                    'genealogy_evidence': bool(c.get('genealogy_evidence') and c.get('genealogy_checked') is True),
                    'independent_corroboration': bool(c.get('corroborated') is True and
                        support.get(c.get('candidate_id'), {}).get('independent_supporting_chains') and c.get('corroboration_evidence')),
                    'human_review_attestation': bool(review.get('reviewer') and review.get('reviewed_utc') and
                        review.get('evidence_examined') and review.get('decision')),
                }
                key = str(c.get('identifier') or c.get('url') or c.get('source_file') or source_path+'#'+str(number))
                row = {'run_id': base.parent.name, 'lane': lane, 'candidate_id': c.get('candidate_id'),
                       'candidate_index': number, 'source_key': key, 'source_path': source_path,
                       'source_document_sha256': digest, 'recorded_evidence_state': c.get('evidence_state'),
                       'source_type': c.get('source_type'), 'routing': routing,
                       'recorded_verified_flag': c.get('verified', False),
                       'checks_recorded_in_preserved_evidence': checks,
                       'missing_checks': [k for k, v in checks.items() if not v],
                       'pagination_hold': 'PAGINATION_UNRESOLVED' if c.get('exact_page_candidates') and not checks['exact_page_mapping'] else None,
                       'audit_status': 'REQUIRES_MANUAL_EVIDENCE_ASSESSMENT' if all(checks.values()) else 'NEEDS_EVIDENCE',
                       'historical_verification_performed_by_audit': False,
                       'sidecar_counts': {'inspection_items': len(inspection.get('items', [])),
                                          'genealogy_sources': len(genealogy.get('sources', []))}}
                if c.get('verified') is True and not all(checks.values()):
                    row['integrity_warning'] = 'RECORDED_VERIFIED_WITHOUT_COMPLETE_AUDIT_TRAIL'
                records.append(row)
                group = groups.setdefault(key, {'source_key': key, 'candidate_references': [],
                    'independence_status': 'NOT_ESTABLISHED_BY_GROUPING'})
                group['candidate_references'].append({'run_id': row['run_id'], 'lane': lane,
                    'candidate_id': row['candidate_id'], 'candidate_index': number,
                    'source_path': source_path, 'routing_decision': routing['decision']})
        except (OSError, ValueError, TypeError, KeyError, AttributeError) as error:
            failures.append({'path': str(path), 'status': 'NOT_FULLY_ASSESSED', 'error': type(error).__name__})
    summary = {'candidate_files': files, 'candidate_records': len(records),
               'routing_counts': dict(Counter(r['routing']['decision'] for r in records)),
               'recorded_state_counts': dict(Counter(str(r['recorded_evidence_state']) for r in records)),
               'missing_check_counts': dict(Counter(g for r in records for g in r['missing_checks'])),
               'source_identity_groups': len(groups),
               'retained_source_identity_groups': len({r['source_key'] for r in records if r['routing']['decision']=='RETAIN_CANDIDATE'}),
               'recorded_verified_candidates': sum(r['recorded_verified_flag'] is True for r in records),
               'complete_recorded_audit_trails': sum(not r['missing_checks'] for r in records),
               'pagination_holds': sum(bool(r['pagination_hold']) for r in records),
               'not_fully_assessed_files': len(failures)}
    return {'schema': 'pct-scientific-evidence-audit-v1',
            'generated_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'audit_kind': 'PRESERVED_RECORDS_AND_SIDECARS_NOT_PRIMARY_SOURCE_VERIFICATION',
            'coverage': 'GitHub preserved candidate-event records; not a live MariaDB or legacy Airtable census.',
            'summary': summary, 'records': records, 'source_groups': list(groups.values()),
            'input_documents': inputs, 'not_fully_assessed': failures,
            'original_records_modified': False, 'verified_promotions': 0,
            'rule': 'A recorded checkbox is not proof. This audit reports missing documentation and never awards VERIFIED.'}


if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--root', default='evidence/runs')
    p.add_argument('--output', required=True)
    a=p.parse_args()
    report=audit(Path(a.root))
    out=Path(a.output); out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report['summary'], ensure_ascii=False))
    raise SystemExit(bool(report['not_fully_assessed']))
