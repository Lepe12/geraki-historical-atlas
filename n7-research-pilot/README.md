# N7 source library — isolated pilot

This is a standalone proof of concept, **not deployed or integrated** into current JARVIS/MariaDB/Atlas. Python standard library only, no paid API and no outbound network calls.

```bash
cd n7-research-pilot
python -m unittest -v
python source_index.py --db ./n7_sources.sqlite3 ingest /path/to/utf8_book.txt
python source_index.py --db ./n7_sources.sqlite3 search 'πειρατεία'
```

A form-feed (\\f) marks a new text segment. The returned page number is **the supplied segment number**, not verified physical pagination. Real exact-page attribution needs mapping to original scanned pages and inspection.

All results explicitly carry `UNVERIFIED_TEXT`. A hit is **not** a verified historical claim. This pilot neither performs OCR/HTR/PDF processing nor connects Kraken, GROBID, Qdrant, OpenAlex or QGIS. It does not mutate the Atlas or production databases.

Do not commit copyrighted source texts, private research datasets or SQLite databases to the public repository. Future integration must honor canonical source acquisition, evidence-state, private access and human-review requirements.
