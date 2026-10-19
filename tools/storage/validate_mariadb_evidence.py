"""Destructive-operation-free checks on an explicitly isolated localhost test DB."""
import argparse
import json
import os
from pathlib import Path
import uuid
import pymysql
from tools.historical_attestations import Attestation, Citation, MatchCandidate, freeze_candidate_set
from tools.storage.historical_evidence_store import migrate, transaction, store_source, store_attestation, store_candidate_set, review_attestation


def main():
    p=argparse.ArgumentParser();p.add_argument('--receipt',required=True);p.add_argument('--read-after-restart',action='store_true');a=p.parse_args()
    if os.environ.get('PCT_ISOLATED_DATABASE_TEST')!='yes' or os.environ.get('PCT_TEST_DB_PORT')!='33077':
        raise ValueError('ISOLATED_DATABASE_TEST_REQUIRED')
    c=pymysql.connect(host='127.0.0.1',port=33077,user='root',password=os.environ['PCT_TEST_DB_PASSWORD'],database='piratecartography')
    dest=Path(a.receipt)
    if a.read_after_restart:
        receipt=json.loads(dest.read_text());att=receipt['attestation_id']
        with c.cursor() as cur:
            cur.execute('SELECT status FROM pc_he_attestations WHERE id=%s',(att,));assert cur.fetchone()[0]=='RETRACTED'
            cur.execute('SELECT COUNT(*) FROM pc_he_review_events WHERE attestation_id=%s',(att,));assert cur.fetchone()[0]==2
            cur.execute('SELECT exact_excerpt FROM pc_he_citations WHERE attestation_id=%s',(att,));assert cur.fetchone()[0]=='The ship anchored at Milo.'
        receipt['restart_readback']='PASS';dest.write_text(json.dumps(receipt,indent=2)+'\n');print('MARIADB_RESTART_READBACK_PASS');return
    migration=migrate(c);assert migrate(c)==migration
    key='test-'+uuid.uuid4().hex
    att=Attestation(key,'reported_name','Milo',(Citation(key,'scan 1','The ship anchored at Milo.'),))
    with transaction(c) as cur:
        store_source(cur,{'id':key,'title':'Synthetic transactional fixture, not a historical source'})
        store_attestation(cur,att)
        store_candidate_set(cur,freeze_candidate_set([MatchCandidate('mention',key,.8,'fixture')],key,{'fixture':True}))
    for decision in ('OPERATOR_ACCEPTED','RETRACTED'):
        with transaction(c) as cur:review_attestation(cur,att.id,'test operator',decision,'Synthetic transaction test')
    try:
        with transaction(c) as cur:
            store_source(cur,{'id':key+'-rollback','title':'Must roll back'})
            store_attestation(cur,Attestation('p','x','y',(Citation('nonexistent-'+key,'page 1','Missing source'),)))
    except pymysql.err.IntegrityError:pass
    else:raise AssertionError('Missing source FK accepted')
    with c.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM pc_he_sources WHERE id=%s',(key+'-rollback',));assert cur.fetchone()[0]==0
        cur.execute('SELECT VERSION()');version=cur.fetchone()[0]
        cur.execute('SELECT status FROM pc_he_attestations WHERE id=%s',(att.id,));assert cur.fetchone()[0]=='RETRACTED'
    receipt={'test_environment':'ISOLATED_LOCAL_MARIADB_NOT_PRODUCTION','database_version':version,
             'migration':migration,'attestation_id':att.id,'checks':['idempotent_migration','transactional_source_and_citation',
             'missing_source_foreign_key','rollback_after_failure','candidate_snapshot','audited_review_and_retraction'],
             'status':'PASS','restart_readback':'NOT_YET_RUN'}
    dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt));c.close()


if __name__=='__main__':main()
