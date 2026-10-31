# NABOU Book Ingestion — isolated pilot

This pilot indexes **user-supplied, lawfully held transcriptions** for future research. It is a standalone, standard-library Python CLI and **does not modify** the existing JARVIS engine, MariaDB, Atlas, public website, API, 3D room, or research verification rules.

## Input

Each line of a UTF-8 JSONL file represents **one printed page**, for example:

```json
{"source_id":"source-bibliography-id","title":"Book title","author":"Author","publication_year":"1900","printed_page":"42","scan_page":50,"language":"el","transcription":"Exact transcription, including [illegible] where needed.","source_reference":"archive accession / scan URL or file identifier","rights_note":"Research copy; check publication permissions","transcription_status":"UNREVIEWED"}
```

Required fields: `source_id`, `title`, `printed_page`, `transcription`. Optional fields are shown in the sample. `transcription_status` is `UNREVIEWED`, `PARTIAL` or `REVIEWED`. Import always records `evidence_status=DISCOVERED`; it **never** marks a historical proposition VERIFIED. Do not rewrite uncertain passages as certain transcriptions.

## Run (Python 3, no dependencies)

```sh
python tools/books/nabou_books.py --db /private/nabou_books.sqlite3 ingest /private/transcriptions.jsonl
python tools/books/nabou_books.py --db /private/nabou_books.sqlite3 search "Λάντζας"
python tools/books/nabou_books.py --db /private/nabou_books.sqlite3 stats
python -m unittest discover -s tools/books -p 'test_*.py'
```

The index is a **separate local SQLite file**, not a production MariaDB migration or automatic service integration. Store it in a private location and back up its data and the original scans/transcriptions. Input IDs/pages must be stable. Identical imports are ignored; a changed transcription at the same source/page fails rather than silently rewriting evidence. A later reviewed revision will require explicit version-management functionality.

## Boundaries / next integration gates

- Search is simple case-insensitive substring matching with source/page provenance, not vector-based semantic RAG or LLM training. Some Unicode accent or spelling variants may not match.
- There is **no** auto-transfer of ChatGPT uploads and **no** public upload endpoint.
- Before production integration: confirm source ownership, rights, ingestion permissions, private storage and backup; implement a safe authenticated read adapter in the existing gateway and research-orchestrator retrieval route; test exact-page citation rendering and independent source verification; only then promote the feature.
- Never commit private scans, copyrighted text, credentials or the generated SQLite DB to a public repository.
