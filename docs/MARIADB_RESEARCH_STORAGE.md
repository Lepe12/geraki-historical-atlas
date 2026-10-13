# Piratecartography host-local research storage

## Contract

Research agents preserve their existing outputs under `evidence/runs/<run_id>/` in GitHub.
The hosting-local CLI importer reads a pinned Git commit and writes those outputs to the
existing dedicated `piratecartography` database. This is a storage adapter for the
existing engine, not another backend, hosted plugin, or new agent runner.

Deployment status: implementation prepared; live database validation is required before
changing the research workflow's primary backend. The installed status is recorded in
the hosting-local audit and `piratecartography-system/pct-research-storage-last.json`.

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

Run through Plesk Scheduled Tasks using the existing hosting system user:

```sh
php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php install
php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php self-test-parser
php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php self-test-db
php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php sync
php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php status
php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php job RUN_ID
php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php search TERM
php /var/www/vhosts/piratecartography.com/piratecartography-gateway/tools/storage/pct_research_store.php document RUN_ID evidence/runs/RUN_ID/LANE/REPORT.json
```

`sync --no-fetch` uses the already fetched commit. `sync --run=RUN_ID` isolates a real
run for a live test. `self-test-db` checks actual write/read/idempotency and rolls back
its test transaction. `document` checks the uncompressed SHA-256 before returning bytes.

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
