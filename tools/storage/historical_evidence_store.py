"""DB-API 2.0 writer for the additive historical-evidence MariaDB schema.

Caller owns connection and transaction. Never auto-promotes machine proposals.
"""
import hashlib
import json
from dataclasses import asdict
from contextlib import contextmanager
from tools.historical_attestations import Attestation


def store_attestation(cursor, a: Attestation):
    """Atomic with caller's transaction; duplicate attestation IDs cannot be rewritten."""
    if a.status != 'UNREVIEWED':
        raise ValueError('Persist new proposals as UNREVIEWED; use audited review transition')
    cursor.execute(
        "INSERT INTO pc_he_attestations "
        "(id,entity_id,predicate,value_text,start_year,end_year,status,reviewer,reviewed_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (a.id, a.entity_id, a.predicate, a.value, a.start_year, a.end_year,
         a.status, a.reviewer, a.reviewed_at))
    for citation in a.citations:
        cursor.execute(
            "INSERT INTO pc_he_citations "
            "(attestation_id,source_id,locator,exact_excerpt,attribution) "
            "VALUES (%s,%s,%s,%s,%s)",
            (a.id, citation.source_id, citation.locator,
             citation.exact_excerpt, citation.attribution))
    return a.id


def store_candidate_set(cursor, snapshot: dict):
    if snapshot.get("schema") != "nabou-candidate-set-v1" or snapshot.get("frozen") is not True:
        raise ValueError("Only frozen candidate sets are accepted")
    run_id = snapshot["run_id"]
    serialized = json.dumps(snapshot, sort_keys=True, ensure_ascii=False)
    checksum = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    cursor.execute("INSERT INTO pc_he_candidate_sets (run_id,parameters_json,snapshot_hash) "
                   "VALUES (%s,%s,%s)", (run_id, serialized, checksum))
    for c in snapshot["candidates"]:
        cursor.execute(
            "INSERT INTO pc_he_candidates "
            "(id,run_id,subject_id,object_id,similarity_score,algorithm) "
            "VALUES (%s,%s,%s,%s,%s,%s)",
            (c["id"], run_id, c["subject_id"], c["object_id"], c["score"], c["algorithm"]))
    return checksum


def review_attestation(cursor, attestation_id: str, reviewer: str, decision: str, reason: str):
    """Caller MUST use transaction(); event and state change commit together."""
    if decision not in ("OPERATOR_ACCEPTED", "REJECTED", "RETRACTED") or not reviewer.strip() or not reason.strip():
        raise ValueError("Explicit reviewer, reason and decision required")
    cursor.execute('SELECT status FROM pc_he_attestations WHERE id=%s FOR UPDATE',(attestation_id,))
    result=cursor.fetchone()
    if not result:raise ValueError('Attestation not found')
    previous=result[0] if not isinstance(result,dict) else result['status']
    allowed=(previous=='UNREVIEWED' and decision in ('OPERATOR_ACCEPTED','REJECTED')) or (previous in ('OPERATOR_ACCEPTED','REJECTED') and decision=='RETRACTED')
    if not allowed:raise ValueError('Invalid review transition; preserve rejected/retracted records')
    cursor.execute(
        "UPDATE pc_he_attestations SET status=%s,reviewer=%s,reviewed_at=UTC_TIMESTAMP() "
        "WHERE id=%s AND status=%s",
        (decision, reviewer, attestation_id,previous))
    if cursor.rowcount != 1:
        raise ValueError("Attestation not found or already reviewed")
    cursor.execute('INSERT INTO pc_he_review_events (attestation_id,previous_status,new_status,reviewer,reason) VALUES (%s,%s,%s,%s,%s)',
                   (attestation_id,previous,decision,reviewer,reason))


@contextmanager
def transaction(connection):
    """Own a complete source/citation/review transaction; roll back every failure."""
    connection.begin()
    cursor=connection.cursor()
    try:
        yield cursor
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:
        cursor.close()


def store_source(cursor, source):
    if not source.get('id') or not str(source.get('title','')).strip():
        raise ValueError('Source identity and title required')
    checksum=source.get('source_sha256')
    if checksum is not None and (len(checksum)!=64 or any(c not in '0123456789abcdef' for c in checksum)):
        raise ValueError('Invalid source checksum')
    cursor.execute('INSERT INTO pc_he_sources (id,title,source_url,source_type,source_sha256,provenance_json) VALUES (%s,%s,%s,%s,%s,%s)',
                   (source['id'],source['title'],source.get('url'),source.get('source_type','UNVERIFIED'),checksum,json.dumps(source.get('provenance',{}),ensure_ascii=False)))


def migrate(connection):
    """MariaDB additive, restartable DDL. Back up the DB before calling in production."""
    from pathlib import Path
    schema=Path(__file__).with_name('historical_evidence_schema.sql').read_text()
    cursor=connection.cursor()
    try:
        cursor.execute('SELECT DATABASE()')
        if cursor.fetchone()[0]!='piratecartography':raise ValueError('WRONG_DATABASE_BLOCKED')
        checksum=hashlib.sha256(schema.encode()).hexdigest()
        cursor.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pc_he_schema_migrations'")
        if cursor.fetchone():
            cursor.execute('SELECT schema_sha256 FROM pc_he_schema_migrations WHERE version=%s',('evidence-v2',))
            previous=cursor.fetchone()
            if previous and previous[0]!=checksum:raise ValueError('MIGRATION_CHECKSUM_CHANGED')
        cursor.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pc_he_citations'")
        if cursor.fetchone():
            cursor.execute('SELECT COUNT(*) FROM pc_he_citations c LEFT JOIN pc_he_sources s ON s.id=c.source_id WHERE s.id IS NULL')
            if cursor.fetchone()[0]:raise ValueError('ORPHAN_CITATIONS_BLOCK_MIGRATION')
        for statement in schema.split(';'):
            if statement.strip():cursor.execute(statement)
        cursor.execute('ALTER TABLE pc_he_sources ADD COLUMN IF NOT EXISTS source_sha256 CHAR(64) NULL, ADD COLUMN IF NOT EXISTS provenance_json LONGTEXT NULL')
        cursor.execute("ALTER TABLE pc_he_attestations MODIFY status ENUM('UNREVIEWED','OPERATOR_ACCEPTED','REJECTED','RETRACTED') NOT NULL DEFAULT 'UNREVIEWED'")
        cursor.execute("SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='pc_he_citations' AND REFERENCED_TABLE_NAME='pc_he_sources'")
        if not cursor.fetchone():cursor.execute('ALTER TABLE pc_he_citations ADD CONSTRAINT he_citation_source_fk FOREIGN KEY (source_id) REFERENCES pc_he_sources(id)')
        checksum=hashlib.sha256(schema.encode()).hexdigest()
        cursor.execute('SELECT schema_sha256 FROM pc_he_schema_migrations WHERE version=%s',('evidence-v2',))
        previous=cursor.fetchone()
        if previous and previous[0]!=checksum:raise ValueError('MIGRATION_CHECKSUM_CHANGED')
        if not previous:cursor.execute('INSERT INTO pc_he_schema_migrations (version,schema_sha256) VALUES (%s,%s)',('evidence-v2',checksum))
        connection.commit()
        return {'version':'evidence-v2','schema_sha256':checksum,'database':'piratecartography'}
    finally:cursor.close()


def store_research_graph(cursor,graph):
    """Persist the validated graph in the same MariaDB and caller transaction."""
    from tools.historical_research_graph import export_jsonld
    export_jsonld(graph['entities'],graph['relations'])
    citations={e['id']:e['properties'] for e in graph['entities'] if e['entity_type']=='Citation'}
    for entity in graph['entities']:
        properties=json.dumps(entity.get('properties',{}),sort_keys=True,ensure_ascii=False)
        cursor.execute('SELECT entity_type,label,properties_json FROM pc_he_entities WHERE id=%s',(entity['id'],))
        existing=cursor.fetchone()
        values=(entity['entity_type'],entity['label'],properties)
        if existing:
            if existing[0]!=values[0] or existing[1]!=values[1] or json.loads(existing[2])!=json.loads(values[2]):raise ValueError('Immutable graph entity conflict')
        else:
            cursor.execute('INSERT INTO pc_he_entities (id,entity_type,label,properties_json) VALUES (%s,%s,%s,%s)',(entity['id'],*values))
    for relation in graph['relations']:
        for cid in relation['citation_ids']:
            c=citations[cid]
            cursor.execute('SELECT id FROM pc_he_citations WHERE attestation_id=%s AND source_id=%s AND locator=%s AND exact_excerpt=%s LIMIT 1',
                           (relation.get('attestation_id',relation['subject_id']),c['source_id'],c['locator'],c['exact_excerpt']))
            result=cursor.fetchone()
            if not result:raise ValueError('Persistent citation required before graph relation')
            identifier=relation['id']+':'+str(result[0])
            values=(relation['subject_id'],relation['predicate'],relation['object_id'],result[0],relation['assertion_class'])
            cursor.execute('SELECT subject_id,predicate,object_id,citation_id,assertion_class FROM pc_he_relations WHERE id=%s',(identifier,))
            existing=cursor.fetchone()
            if existing and tuple(existing)!=values:raise ValueError('Immutable graph relation conflict')
            if not existing:cursor.execute('INSERT INTO pc_he_relations (id,subject_id,predicate,object_id,citation_id,assertion_class) VALUES (%s,%s,%s,%s,%s,%s)',(identifier,*values))


def query_entities(cursor,entity_type,start_year=None,end_year=None,limit=100):
    from tools.historical_research_graph import TYPES
    if entity_type not in TYPES or type(limit) is not int or not 1<=limit<=500:raise ValueError('Invalid graph query')
    sql='SELECT id,entity_type,label,properties_json FROM pc_he_entities WHERE entity_type=%s'
    args=[entity_type]
    if start_year is not None or end_year is not None:
        if type(start_year) is not int or type(end_year) is not int or start_year>end_year:raise ValueError('Invalid temporal query')
        sql+=" AND JSON_VALID(properties_json) AND (JSON_EXTRACT(properties_json,'$.start_year') IS NULL OR JSON_EXTRACT(properties_json,'$.start_year')<=%s) AND (JSON_EXTRACT(properties_json,'$.end_year') IS NULL OR JSON_EXTRACT(properties_json,'$.end_year')>=%s)"
        args.extend([end_year,start_year])
    cursor.execute(sql+' ORDER BY id LIMIT %s',(*args,limit))
    return cursor.fetchall()
