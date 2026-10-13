#!/usr/bin/env python3
"""Read-only MariaDB staging connection test for Piratecartography.

Requires pip install pymysql. Set PCT_DB_HOST, PCT_DB_PORT (optional),
PCT_DB_NAME, PCT_DB_USER, PCT_DB_PASSWORD in the execution environment.
No credentials in source or logs. Does not modify any database.
"""
import json
import os
import sys

EXPECTED = {"PLACES": 3, "SOURCES": 11, "EVENTS": 1, "ROUTES": 0, "RESEARCH_JOBS": 1}
SNAPSHOT = "20261012T113000Z"


def main():
    required = ["PCT_DB_HOST", "PCT_DB_NAME", "PCT_DB_USER", "PCT_DB_PASSWORD"]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        print("BLOCKED: missing environment variables: " + ", ".join(missing))
        return 2
    if os.environ["PCT_DB_NAME"] != "piratecartography":
        print("BLOCKED: database name must be piratecartography")
        return 2
    try:
        import pymysql
    except ImportError:
        print("BLOCKED: install pymysql first")
        return 2
    try:
        connection = pymysql.connect(
            host=os.environ["PCT_DB_HOST"],
            port=int(os.getenv("PCT_DB_PORT", "3306")),
            user=os.environ["PCT_DB_USER"],
            password=os.environ["PCT_DB_PASSWORD"],
            database=os.environ["PCT_DB_NAME"],
            charset="utf8mb4",
            connect_timeout=8,
            read_timeout=15,
            write_timeout=15,
            autocommit=True,
            ssl_verify_cert=True,
        )
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT r.airtable_table, COUNT(*) FROM pc_mig_records r "
                    "JOIN pc_mig_batches b ON b.batch_id = r.batch_id "
                    "WHERE b.source_snapshot = %s GROUP BY r.airtable_table",
                    (SNAPSHOT,),
                )
                actual = dict(cursor.fetchall())
            actual = {key: actual.get(key, 0) for key in EXPECTED}
            passed = actual == EXPECTED
            print(json.dumps({"check": "staging_snapshot_counts", "snapshot": SNAPSHOT,
                              "expected": EXPECTED, "actual": actual,
                              "status": "PASS" if passed else "FAIL"}, ensure_ascii=False))
            return 0 if passed else 1
        finally:
            connection.close()
    except Exception as exc:
        # Avoid printing exception details that may contain sensitive connection parameters.
        print("BLOCKED: connection or query failed (" + type(exc).__name__ + ")")
        return 2


if __name__ == "__main__":
    sys.exit(main())
