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


## Optional loopback search API for a future N7 tool adapter

The server binds **only** to `127.0.0.1` and requires a randomly generated bearer token. It is *not* connected to the production N7 agent, the public website or the Atlas.

```bash
# on the same trusted machine as the N7 tool runner
cd n7-research-pilot
export N7_LIBRARY_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
python tool_bridge.py --db ./n7_sources.sqlite3 --port 8767
```

From a separate trusted shell on that machine (with the same token set):

```bash
curl -sS -H "Authorization: Bearer $N7_LIBRARY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"Τήνος","limit":5}' \
  http://127.0.0.1:8767/v1/tools/research.search_sources
```

Tool discovery is `GET /v1/tools` with the same bearer token; `GET /health` returns only service status. Ingestion is **CLI-only** and must use trusted local files (no remote arbitrary-path ingestion). Do not expose the port publicly or put the token in GitHub, browser JavaScript or website files. For remote deployment, use a private network or an authenticated internal gateway and separate per-user data before multi-user use.

`python -m unittest discover -s . -p 'test_*.py' -v` runs the isolated tests.
