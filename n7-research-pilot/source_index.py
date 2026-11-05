#!/usr/bin/env python3
"""Isolated N7 text source index; no historical verification or network calls."""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS sources (id INTEGER PRIMARY KEY, name TEXT NOT NULL, sha256 TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY, source_id INTEGER NOT NULL REFERENCES sources(id), page INTEGER NOT NULL, content TEXT NOT NULL, UNIQUE(source_id,page));
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(content, content='pages', content_rowid='id', tokenize='unicode61');
CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN INSERT INTO pages_fts(rowid,content) VALUES(new.id,new.content); END;
"""

def connect(db):
    c = sqlite3.connect(db)
    c.execute("PRAGMA foreign_keys=ON")
    c.executescript(SCHEMA)
    return c

def ingest(db, path):
    p = Path(path)
    raw = p.read_bytes()
    value = raw.decode("utf-8-sig")
    sha = hashlib.sha256(raw).hexdigest()
    pages = value.split("\f")
    with connect(db) as c:
        existing = c.execute("SELECT id FROM sources WHERE sha256=?", (sha,)).fetchone()
        if existing:
            return {"status": "duplicate", "source_id": existing[0], "sha256": sha}
        cursor = c.execute("INSERT INTO sources(name,sha256) VALUES(?,?)", (p.name, sha))
        for n, page in enumerate(pages, 1):
            c.execute("INSERT INTO pages(source_id,page,content) VALUES(?,?,?)", (cursor.lastrowid,n,page))
        return {"status":"indexed", "source_id":cursor.lastrowid, "pages":len(pages), "sha256":sha, "verification":"UNVERIFIED_TEXT"}

def search(db, query, limit=10):
    with connect(db) as c:
        rows = c.execute("""SELECT sources.name, sources.sha256, pages.page,
            snippet(pages_fts, 0, '[', ']', '…', 18), pages.content
            FROM pages_fts JOIN pages ON pages.id=pages_fts.rowid
            JOIN sources ON sources.id=pages.source_id
            WHERE pages_fts MATCH ? ORDER BY rank LIMIT ?""", (query, limit)).fetchall()
    return [{"source":name,"sha256":sha,"page":page,"excerpt":excerpt,
        "citation":f"{name} — supplied text segment {page}",
        "verification":"UNVERIFIED_TEXT","text":content} for name,sha,page,excerpt,content in rows]

def main():
    parser = argparse.ArgumentParser(description="N7 local text-source library pilot")
    parser.add_argument("--db", default="n7_sources.sqlite3")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("ingest").add_argument("file")
    q = sub.add_parser("search")
    q.add_argument("query")
    q.add_argument("--limit", type=int, default=10)
    a = parser.parse_args()
    if a.command == "ingest":
        result = ingest(a.db, a.file)
    else:
        if not 1 <= a.limit <= 100:
            parser.error("--limit must be 1–100")
        result = search(a.db, a.query, a.limit)
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
