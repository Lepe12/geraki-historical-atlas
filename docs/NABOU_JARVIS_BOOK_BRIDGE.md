# Book retrieval bridge for JARVIS

This is a **local, read-only discovery adapter**, not yet a registered production JARVIS lane or public endpoint. It reads only the isolated SQLite index created by `tools/books/nabou_books.py`.

```sh
python tools/books/jarvis_book_bridge.py --db /private/nabou_books.sqlite3 --request /private/research_request.json --output /private/book_candidates.json
```

Request schema example:

```json
{"research_job_id":"local-pilot-1","target":"Πέτρος Λάντζας","aliases":["Pedro Lanza"],"queries":["Κέρκυρα"]}
```

Response: `nabou-local-book-discovery-v1` contains page-level candidates with `source_id`, book title, printed page, scan page, exact-source reference and transcription SHA-256. Each candidate is `UNVERIFIED` / `DISCOVERED`, with `requires_original_inspection=true`. The adapter returns untrusted source data only, never a verified event or an actor attribution.

**Integration boundary:** The main JARVIS execution pipeline does not automatically call this adapter yet. Before enabling it, configure a private on-host index path, pass each request through the existing controlled-dispatch request validation, write outputs into evidence/run provenance and feed the resulting candidates into existing ORIGINAL_INSPECTED / genealogy / corroboration gates. No claim should be promoted from this adapter alone. The production MariaDB schema and existing eleven remote discovery lanes are unchanged.

Existing ChatGPT image uploads have not been exported or ingested automatically. Copyrighted text and images must stay in rights-appropriate private storage.
