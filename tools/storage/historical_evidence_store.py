"""DB-API 2.0 writer for the additive historical-evidence MariaDB schema.

Caller owns connection and transaction. Never auto-promotes machine proposals.
"""
import hashlib
import json
from dataclasses import asdict
from tools.historical_attestations import Attestation


def store_attestation(cursor, a: Attestation):
    """Atomic with caller's transaction; duplicate attestation IDs cannot be rewritten."""
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


def review_attestation(cursor, attestation_id: str, reviewer: str, decision: str):
    if decision not in ("OPERATOR_ACCEPTED", "REJECTED") or not reviewer.strip():
        raise ValueError("Explicit valid reviewer and decision required")
    # Only transition from UNREVIEWED. Concurrency-safe check.
    cursor.execute(
        "UPDATE pc_he_attestations SET status=%s,reviewer=%s,reviewed_at=UTC_TIMESTAMP() "
        "WHERE id=%s AND status='UNREVIEWED'",
        (decision, reviewer, attestation_id))
    if cursor.rowcount != 1:
        raise ValueError("Attestation not found or already reviewed")
