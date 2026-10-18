"""Read-only stage audit of existing NABOU runs. No research, publishing or DB writes.

Missing durable data never proves that research did not execute. Public Actions
conclusions are recorded independently from search access, analysis and storage.
"""
from __future__ import annotations
import argparse
from collections import Counter
import datetime
import hashlib
import json
from pathlib import Path
from research_evidence_package import provider_failures

LANES=('greek','travellers','spanish_simancas','venetian','french','british','dutch','german','italian_states','ottoman','north_african')


def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    return h.hexdigest()


def read(path, problems):
    if not path.is_file():return {}
    try:return json.loads(path.read_text(encoding='utf-8'))
    except (OSError,ValueError) as error:
        problems.append({'path':str(path),'status':'UNREADABLE','error':type(error).__name__});return {}


def inspect_index(repo,path,problems):
    index=read(path,problems);checks=[]
    evidence=(repo/'evidence').resolve()
    for obj in index.get('objects') or []:
        parts=obj.get('parts') if obj.get('storage')=='chunked' else [obj]
        for part in parts or []:
            candidate=(evidence/str(part.get('path') or '')).resolve()
            if not candidate.is_relative_to(evidence):
                checks.append({'path':part.get('path'),'status':'UNSAFE_INDEX_PATH'});continue
            status='MISSING' if not candidate.is_file() else 'MATCH' if digest(candidate)==part.get('sha256') else 'CHECKSUM_MISMATCH'
            checks.append({'path':part.get('path'),'status':status})
    return {'index':str(path.relative_to(repo)),'object_count':len(index.get('objects') or []),
            'checked_files':len(checks),'status_counts':dict(Counter(c['status'] for c in checks)),
            'issues':[c for c in checks if c['status']!='MATCH']}


def audit_run(repo,run_id,observation=None):
    if not str(run_id).isdigit():raise ValueError('NUMERIC_RUN_ID_REQUIRED')
    repo=Path(repo).resolve();root=repo/'evidence/runs'/str(run_id);problems=[];inputs=[]
    manifests=[];attempts=[];providers=[];acquisitions=[];backlog=Counter();pipeline=[];indexes=[];candidates=[]
    for lane in LANES:
        base=root/lane
        if not base.is_dir():continue
        manifest_path=base/'run_manifest/manifest.json'
        manifest=read(manifest_path,problems)
        if manifest:
            manifests.append({'lane':lane,'git_commit':manifest.get('git_commit'),'ref':manifest.get('ref'),
                              'request_sha256':manifest.get('request_sha256'),
                              'target':(manifest.get('normalized_request') or {}).get('target')})
        discovery=read(base/'lane_discovery'/f'{lane}.json',problems)
        for attempt in discovery.get('attempts') or []:
            attempts.append({'lane':lane,'repository':attempt.get('repository'),'status':attempt.get('status')})
            for query in attempt.get('queries') or []:
                providers.extend({'lane':lane,'repository':attempt.get('repository'),**failure} for failure in provider_failures(query.get('detail')))
        acquisitions.extend(read(base/'library_acquisition/acquisition_report.json',problems).get('results') or [])
        b=read(base/'library_acquisition/acquisition_backlog.json',problems)
        for key in ('review_required','excluded_from_auto_acquisition','deferred'):backlog[key]+=len(b.get(key) or [])
        events=read(base/'structured_output/candidate_events.json',problems).get('events') or []
        candidates.extend(events)
        pipeline.append({'lane':lane,'pre_persistence_job_status':read(base/'system_health/workflow_execution.json',problems).get('execution_status'),
                         'qa_present':(base/'qa/qa_report.json').is_file(),'candidate_count':len(events),
                         'finding_count':len(read(base/'structured_output/extracted_findings.json',problems).get('findings') or [])})
        if (base/'index.json').is_file():indexes.append(inspect_index(repo,base/'index.json',problems))
        for relative in ('run_manifest/manifest.json',f'lane_discovery/{lane}.json','library_acquisition/acquisition_report.json',
                         'system_health/workflow_execution.json','index.json'):
            path=base/relative
            if path.is_file():inputs.append({'path':str(path.relative_to(repo)),'sha256':digest(path)})
    snapshot_path=repo/'command-center/live/runs'/f'{run_id}.json'
    snapshot=read(snapshot_path,problems);answer=read(root/'research_answer/answer.json',problems)
    storage=read(root/'MARIADB_STORAGE_INTENT.json',problems)
    has_specialist=(repo/'evidence/specialist_runs'/str(run_id)/'SPECIALIST_AGGREGATE.json').is_file()
    hashes={m['request_sha256'] for m in manifests if m['request_sha256']}
    commits=sorted({m['git_commit'] for m in manifests if m['git_commit']})
    refs=sorted({m['ref'] for m in manifests if m['ref']})
    errors=[issue for index in indexes for issue in index['issues']]
    if errors:git_status='PERSISTED_OBJECT_INTEGRITY_FAILURE'
    elif len(indexes)==len(LANES) and all(i['checked_files'] for i in indexes):git_status='ALL_ELEVEN_LANES_PERSISTED_AND_CHECKSUM_CHECKED'
    elif indexes or has_specialist:git_status='PARTIALLY_OBSERVED_PERSISTENCE'
    else:git_status='NOT_OBSERVED_NOT_PROOF_OF_NONEXECUTION'
    observation=observation or {}
    return {'run_id':str(run_id),'software_commits':commits,'refs':refs,
            'workflow_execution':observation.get('public_state') or {'status':'NOT_OBSERVED'},
            'public_observation':{'url':observation.get('url'),'experimental_branch_observed':observation.get('experiment_branch_observed'),
                                  'logs_require_sign_in':observation.get('logs_require_sign_in')},
            'request_integrity':{'manifest_count':len(manifests),'distinct_hashes':sorted(hashes),
                                 'status':'CONSISTENT_IN_OBSERVED_MANIFESTS' if len(hashes)==1 else 'INCONSISTENT' if hashes else 'NOT_OBSERVED',
                                 'all_eleven_manifests_present':len(manifests)==len(LANES)},
            'discovery':{'observed_repository_attempts':len(attempts),'status_counts':dict(Counter(str(a['status']) for a in attempts)),
                         'provider_error_codes':dict(Counter(str(p['code']) for p in providers)),
                         'rule':'Failed access is not an executed zero-result search.'},
            'acquisition':{'status_counts':dict(Counter(str(a.get('status')) for a in acquisitions)), 'backlog':dict(backlog)},
            'generated_pipeline_outputs':pipeline,
            'semantic_analysis':{'status':answer.get('status') or 'NOT_OBSERVED','model_used':answer.get('model_used'),
                                 'missing_configuration':(answer.get('configuration') or {}).get('missing') or []},
            'git_persistence':{'status':git_status,'lane_indexes':len(indexes),'specialist_outputs_present':has_specialist,
                               'checked_files':sum(i['checked_files'] for i in indexes),'issues':errors,'indexes':indexes},
            'database_persistence':{'recorded_intent':storage.get('status'),'confirmation':'NOT_VERIFIED_WITH_HOST_LOCAL_IMPORT_RECEIPT'},
            'live_delivery':{'status':'NOT_ESTABLISHED_FROM_DURABLE_RESEARCH_FILES',
                             'reason':'Local events, workflow success and snapshot presence do not prove HTTP event acceptance.'},
            'published_snapshot':{'present':bool(snapshot),'run_id_matches':snapshot.get('run_id')==str(run_id) if snapshot else None,
                                  'mission_status':(snapshot.get('mission') or {}).get('status'),
                                  'recorded_quote_integrity':(snapshot.get('evidence_package') or {}).get('quality')},
            'historical_quality':{'candidate_count':len(candidates),'recorded_verified':sum(c.get('verified') is True for c in candidates),
                                  'assessment':'HISTORICAL_CORRECTNESS_NOT_ESTABLISHED_BY_TECHNICAL_SUCCESS'},
            'input_checksums':inputs,'unreadable_inputs':problems}


def audit(repo,run_ids,observations=()):
    by_id={str(o.get('run_id')):o for o in observations}
    return {'schema':'nabou-system-diagnosis-v1','generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'scope':'Read-only repository evidence and separately supplied public Actions observations; no new research, event delivery, database access or writes.',
            'runs':[audit_run(repo,r,by_id.get(str(r))) for r in run_ids],
            'rules':['Workflow failure does not locate a failing stage without evidence.',
                     'Missing Git evidence does not mean no research artifacts were generated.',
                     'Checksums prove persistence integrity, not historical truth.',
                     'Queued database import is not confirmed database persistence.',
                     'Different refs, commits, inputs or provider access conditions cannot be silently treated as one baseline.']}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--repo',default='.');p.add_argument('--runs',nargs='+',required=True)
    p.add_argument('--observations');p.add_argument('--output',required=True);a=p.parse_args()
    observations=json.loads(Path(a.observations).read_text()) if a.observations else []
    result=audit(Path(a.repo),a.runs,observations)
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    for r in result['runs']:print(r['run_id'],r['git_persistence']['status'],r['semantic_analysis']['status'],r['discovery']['provider_error_codes'])
