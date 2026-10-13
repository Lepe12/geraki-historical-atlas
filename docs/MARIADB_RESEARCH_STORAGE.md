# Piratecartography host-local research storage

## Contract

Research agents preserve their existing outputs under `evidence/runs/<run_id>/` in GitHub.
The hosting-local CLI importer reads a pinned Git commit and writes those outputs to the
existing dedicated `piratecartography` database. This is a storage adapter for the
existing engine, not another backend, hosted plugin, or new agent runner.

Live validation on 2026-10-13: schema install, real write/read/idempotency tests and
backfill succeeded in the dedicated database. The first full backfill stored 67 runs,
19,738 document records, 28,035 source-candidate records and 1,519 event candidates,
with zero blocked imports and zero automatically verified items. These counts are a
validation snapshot, not a fixed expectation for future runs. The installed status is
recorded in the hosting-local audit and `piratecartography-system/pct-research-storage-last.json`.

## Security and scope

- CLI only. No public write endpoint, changes to `open_basedir`, or exposed port 3306.
- Credentials remain in the existing private `pct_db_config.php`; the adapter checks
  `database=piratecartography` and `SELECT DATABASE()` before any operation.
- Never connects to or modifies the WordPress database, WordPress files or `.htaccess`.
- Schema installation creates five new `pc_research_*` tables; it does not alter the
  three `pc_mig_*` migration tables or erase Airtable snapshot data.
- A host-local file lock serializes imports. Each research run is one DB transaction.
  Invalid JSON or a write failure rolls back that run and creates a BLOCKED audit entry.
- Parameterized SQL and shell-free Git arguments protect imported strings and paths.

## Data preservation

- `pc_research_runs`: research run, recorded job/request identity, target and pinned commit.
- `pc_research_documents`: versioned document metadata and current-version flags.
- `pc_research_payloads`: SHA-256-addressed, gzip-compressed original text/JSON payloads.
- `pc_research_items`: searchable source candidates and event candidates, with original
  payloads and lane/document provenance. These projections never set `is_verified=1`.
- `pc_research_storage_audit`: successful imports, blocked imports and synchronization status.

Text/JSON documents up to 16 MiB are preserved byte-for-byte in compressed payloads.
Larger text, PDF/image/audio and chunked binaries retain their paths, Git blob identities
and original evidence-index/checksum records. Their durable binary bytes remain in the
existing GitHub evidence store. They are not silently claimed to have been rehashed or
stored as database BLOBs. No evidence stage is promoted by persistence.

Changed document versions remain in the database. Re-running an unchanged Git tree skips
it. Re-importing the same payload or document version does not create duplicates.
Conflicting or incomplete request identity is preserved explicitly; no target/job ID is
invented to conceal legacy or partial data.

## Host-local commands

Run through Plesk Scheduled Tasks using the existing hosting system user and the
verified PHP 8.4 CLI at `/opt/plesk/php/8.4/bin/php`. The default `/usr/bin/php`
on this host is PHP 7.2 and must not be used for this adapter:

```sh
/opt/plesk/php/8.4/bin/php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php install
/opt/plesk/php/8.4/bin/php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php self-test-parser
/opt/plesk/php/8.4/bin/php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php self-test-db
/opt/plesk/php/8.4/bin/php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php sync
/opt/plesk/php/8.4/bin/php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php status
/opt/plesk/php/8.4/bin/php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php job RUN_ID
/opt/plesk/php/8.4/bin/php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php search TERM
/opt/plesk/php/8.4/bin/php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php document RUN_ID evidence/runs/RUN_ID/LANE/REPORT.json
```

`sync --no-fetch` uses the already fetched commit. `sync --run=RUN_ID` isolates a real
run for a live test. `self-test-db` checks actual write/read/idempotency and rolls back
its test transaction. `document` checks the uncompressed SHA-256 before returning original bytes.
`verify-run RUN_ID` checks every stored text against both its SHA-256 and original Git blob identity.

Only add a recurring task after schema install, a real run import and a read-back pass.
Recommended schedule: every five minutes, no email notification, stdout/stderr redirected
to a private hosting-local log. This polling persists newly committed outputs even when
the client chat or plugin is closed. GitHub preservation failures remain failures: the
importer cannot retrieve an output that was never durably committed.

## Backend cutover and recovery

The research workflow's `PCT_STORAGE_BACKEND` controls structured-output persistence.
`mariadb` emits a `MARIADB_STORAGE_INTENT.json` queue declaration, then the host-local
importer confirms the actual write. `airtable` remains an explicit rollback setting;
it must not be run in parallel by default. A queue declaration is never DB confirmation.
Existing Atlas rendering and Airtable backups are separate consumers and are not changed
by this storage adapter.

Recovery: deploy the versioned adapter/schema, restore the existing private configuration,
install the additive tables and import the preserved GitHub run trees. The original
Airtable migration snapshot remains available in `pc_mig_records` and GitHub backups.
Disable only the new storage cron task to pause imports; do not delete research data.


## Verified deployment record — 2026-10-13

- Plesk task ID 348 is enabled with schedule `*/5 * * * *` and no email notifications.
- Its saved command uses the explicit PHP 8.4 CLI and the private cron log path.
- Running the saved task completed successfully on the hosting server.
- Re-importing all 67 unchanged run trees returned PASS, zero new imports and zero blocked runs.
- `verify-run 38374191697` retrieved 324 compressed documents from MariaDB and confirmed both SHA-256 and original Git blob byte identity. Binary-reference bytes were not rehashed by this test.
- `.htaccess`, `wp-config.php` and WordPress `index.php` matched the pre-deployment checksums.
- The public read-only gateway still has its separate `open_basedir` blocker. The host-local storage/import path does not use it and does not weaken that restriction.
