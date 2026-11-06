# N7 persistent page-level historical source library (Phase 1)
This is an **additive, CLI-only** library in the existing dedicated `piratecartography` MariaDB. It does not change the Atlas, agents, WordPress, public HTTP endpoints or existing research run storage.

## Security
- Uses the already deployed private `piratecartography-system/pct_db_config.php` and verifies the database name before touching it.
- The source JSON must exist in a **host-local private directory**; never expose upload paths, passwords, or originals to the public web.
- No public upload/search route in this phase. Do not commit copyrighted books or personal scans to GitHub.
- An OCR hit is **not** an inspected or independently corroborated historical claim.
- The original PDF/page image must be retained separately in durable private storage. The `source_uri` field is only a locator, not proof that binary bytes have been preserved.

## Import envelope
UTF-8 JSON, for one source, with `source_id` (optional stable 64-character lowercase SHA-256 identifier), `title`, optional `author`, `publication_year`, `bibliographic_reference`, `source_uri`, `rights_note`, and `pages`:
```json
{
  "title": "Historical source",
  "author": "Unknown",
  "source_uri": "private://library/source-1.pdf",
  "pages": [
    {"scan_index": 1, "printed_page": "i", "text": "First page transcribed text", "ocr_status": "UNREVIEWED"},
    {"scan_index": 2, "printed_page": "1", "text": "Second page transcribed text", "ocr_status": "UNREVIEWED"}
  ]
}
```
`scan_index` is the 1-based scanned leaf index. `printed_page` is the page number **as actually printed**, which may differ. The importer never guesses one from the other. For a source without an explicit ID the ID is derived from a normalized locator and bibliographic identity; for ambiguous/revised bibliographies provide an explicit stable ID.

## Host CLI
Use PHP 8.4 (not the system-default PHP 7.2):
```sh
/opt/plesk/php/8.4/bin/php tools/library/n7_library.php self-test
/opt/plesk/php/8.4/bin/php tools/library/n7_library.php install
/opt/plesk/php/8.4/bin/php tools/library/n7_library.php import /private/path/source-pages.json
/opt/plesk/php/8.4/bin/php tools/library/n7_library.php search 'Lanza'
/opt/plesk/php/8.4/bin/php tools/library/n7_library.php page SOURCE_ID 2
```
Search returns exact stored snippets, bibliographic metadata, scan indices and printed-page labels, with status `UNREVIEWED` unless separately inspected. Does not generate historical conclusions or silently substitute people with similar names.

## Boundaries and remaining work
This phase **does not** automatically parse PDFs or OCR images, split a 500-page book into resumable batches, or expose the library to the N7 chat UI. Those are distinct integration stages. For long-running OCR add an immutable source file manifest and per-page job checkpoints before enabling unattended importing. Verify host database/table installation and live read-back before claiming deployment.
