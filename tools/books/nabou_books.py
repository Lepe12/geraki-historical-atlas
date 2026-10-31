#!/usr/bin/env python3
"""Local, provenance-preserving book transcription index for NABOU.

No network access, credentials, model calls, or modifications to the production DB.
All passages are UNVERIFIED transcription evidence until separately inspected.
"""
import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS pages (
 page_id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL,
 title TEXT NOT NULL,
 author TEXT NOT NULL DEFAULT '',
 publication_year TEXT,
 printed_page TEXT NOT NULL,
 scan_page INTEGER,
 language TEXT NOT NULL DEFAULT '',
 transcription TEXT NOT NULL,
 transcription_sha256 TEXT NOT NULL,
 source_reference TEXT,
 rights_note TEXT,
 transcription_status TEXT NOT NULL DEFAULT 'UNREVIEWED',
 evidence_status TEXT NOT NULL DEFAULT 'DISCOVERED',
 imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_book_pages_source ON pages(source_id,printed_page);
"""
REQUIRED = ("source_id", "title", "printed_page", "transcription")


def connect(path):
    db = sqlite3.connect(str(path))
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    try:
        db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(page_id UNINDEXED, transcription, title, author, tokenize='unicode61 remove_diacritics 2')")
    except sqlite3.OperationalError:
        pass  # Search falls back to literal substring matching.
    return db


def validate(raw, line):
    if not isinstance(raw, dict):
        raise ValueError(f"line {line}: expected JSON object")
    for k in REQUIRED:
        if k not in raw or not isinstance(raw[k], str) or not raw[k].strip():
            raise ValueError(f"line {line}: required non-empty string {k}")
    if raw.get("scan_page") is not None and (type(raw["scan_page"]) is not int or raw["scan_page"] < 1):
        raise ValueError(f"line {line}: scan_page must be a positive integer")
    if raw.get("transcription_status", "UNREVIEWED") not in ("UNREVIEWED", "PARTIAL", "REVIEWED"):
        raise ValueError(f"line {line}: invalid transcription_status")
    if raw.get("evidence_status", "DISCOVERED") != "DISCOVERED":
        raise ValueError(f"line {line}: imports cannot claim evidence verification")
    for k in ("author", "publication_year", "language", "source_reference", "rights_note"):
        if raw.get(k) is not None and not isinstance(raw[k], str):
            raise ValueError(f"line {line}: {k} must be a string")
    return raw


def add(db, entry):
    digest = hashlib.sha256(entry["transcription"].encode("utf-8")).hexdigest()
    identity = json.dumps([entry["source_id"], entry["printed_page"], entry.get("scan_page")], ensure_ascii=False)
    page_id = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    previous = db.execute("SELECT transcription_sha256 FROM pages WHERE page_id=?", (page_id,)).fetchone()
    if previous and previous[0] != digest:
        raise ValueError(f"conflicting transcription at source={entry['source_id']} page={entry['printed_page']}; review before replacing")
    if previous:
        return False
    values = (
        page_id, entry["source_id"], entry["title"], entry.get("author") or "",
        entry.get("publication_year"), entry["printed_page"], entry.get("scan_page"),
        entry.get("language") or "", entry["transcription"], digest,
        entry.get("source_reference"), entry.get("rights_note"),
        entry.get("transcription_status", "UNREVIEWED"), "DISCOVERED"
    )
    db.execute("""INSERT INTO pages
      (page_id,source_id,title,author,publication_year,printed_page,scan_page,language,transcription,
       transcription_sha256,source_reference,rights_note,transcription_status,evidence_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", values)
    try:
        db.execute("INSERT INTO pages_fts(page_id,transcription,title,author) VALUES (?,?,?,?)",
                   (page_id, entry["transcription"], entry["title"], entry.get("author") or ""))
    except sqlite3.OperationalError as error:
        if "no such table" not in str(error).lower():
            raise
    return True


def ingest(db, path):
    total = added = 0
    with db:
        with open(path, encoding="utf-8-sig") as f:
            for n, line in enumerate(f, 1):
                if not line.strip():
                    continue
                total += 1
                item = validate(json.loads(line), n)
                added += int(add(db, item))
    return {"processed": total, "inserted": added, "duplicates": total - added}


def search(db, term, limit):
    # Literal search avoids FTS query operators and supports Greek substring hits.
    needle = term.casefold()
    if not needle:
        raise ValueError("empty search")
    rows = db.execute("SELECT * FROM pages ORDER BY source_id,printed_page").fetchall()
    results = []
    for row in rows:
        body = row["transcription"]
        index = body.casefold().find(needle)
        if index < 0 and needle not in row["title"].casefold() and needle not in row["author"].casefold():
            continue
        start = max(0, index - 100) if index >= 0 else 0
        snippet = body[start:start + 350]
        results.append({"source_id": row["source_id"], "title": row["title"],
                        "author": row["author"], "printed_page": row["printed_page"],
                        "scan_page": row["scan_page"], "source_reference": row["source_reference"],
                        "transcription_status": row["transcription_status"],
                        "evidence_status": row["evidence_status"], "snippet": snippet,
                        "transcription_sha256": row["transcription_sha256"]})
        if len(results) >= limit:
            break
    return results


def main():
    p = argparse.ArgumentParser(description="NABOU local book transcription index")
    p.add_argument("--db", default="nabou_books.sqlite3", help="separate local SQLite index")
    sub = p.add_subparsers(dest="command", required=True)
    i = sub.add_parser("ingest", help="import UTF-8 JSONL pages transactionally")
    i.add_argument("jsonl")
    s = sub.add_parser("search", help="search stored transcription text")
    s.add_argument("term")
    s.add_argument("--limit", type=int, default=20)
    sub.add_parser("stats")
    args = p.parse_args()
    if args.command == "ingest" and not Path(args.jsonl).is_file():
        p.error("input JSONL does not exist")
    if args.command == "search" and args.limit < 1:
        p.error("--limit must be positive")
    db = connect(args.db)
    try:
        if args.command == "ingest":
            result = ingest(db, args.jsonl)
        elif args.command == "search":
            result = search(db, args.term, args.limit)
        else:
            result = dict(db.execute("SELECT COUNT(*) AS pages, COUNT(DISTINCT source_id) AS sources FROM pages").fetchone())
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, sqlite3.Error, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
