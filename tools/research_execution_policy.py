"""Fail-closed publication policy, independent of research findings."""
import os,re


def resolve(ref,requested='auto',source_sha='',workflow_sha=''):
    requested=requested or 'auto'
    if requested not in ('auto','artifacts','production'):raise ValueError('INVALID_PERSISTENCE_MODE')
    mode=('production' if ref=='refs/heads/main' else 'artifacts') if requested=='auto' else requested
    if mode=='production' and ref!='refs/heads/main':raise ValueError('EXPERIMENT_PRODUCTION_WRITE_FORBIDDEN')
    if source_sha and not re.fullmatch(r'[a-f0-9]{40}',source_sha):raise ValueError('FULL_SOURCE_COMMIT_REQUIRED')
    if mode=='production' and source_sha and workflow_sha and source_sha!=workflow_sha:
        raise ValueError('PRODUCTION_SOURCE_MUST_MATCH_WORKFLOW_COMMIT')
    return {'schema':'pct-execution-policy-v1','mode':mode,'ref':ref,'source_sha':source_sha or workflow_sha,
            'production_writes_allowed':mode=='production','remote_events_allowed':mode=='production',
            'memory_learning_allowed':mode=='production','artifact_retention_days':90}


def from_environment():
    return resolve(os.getenv('GITHUB_REF',''),os.getenv('PCT_PERSISTENCE_MODE','auto'),
                   os.getenv('PCT_SOURCE_SHA',''),os.getenv('GITHUB_SHA',''))
