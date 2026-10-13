# Piratecartography MariaDB migration — staging v1

Status: **prepared in GitHub; NOT executed on Top.Host**.

## Ground truth
- Target dedicated MariaDB database: `piratecartography`, local `localhost:3306`.
- Separate WordPress database `wp_4p2qo` must never be modified.
- Airtable schema snapshot: `backups/airtable/schema/airtable_schema_2026-10-12.json`.
- Record snapshot: `backups/airtable/records/20261012T113000Z/`.
- Five canonical datasets: PLACES, SOURCES, EVENTS, ROUTES, RESEARCH JOBS.
- Existing phpMyAdmin import reportedly ran 13 statements then returned #1044; current tables and their definitions are **unverified**. Never assume the earlier schema was installed correctly.

## Why staging instead of destructive migration
`sql/piratecartography_migration_staging_v1.sql` creates only three new prefixed tables. It does not rename, alter, drop, or populate any existing table. Original Airtable record JSON and IDs can be stored without losing linked-record arrays or fields. This is a reversible staging approach; not the final production schema.

## Deployment gate
1. Establish authorized connection to Plesk/phpMyAdmin or a locally executed, authenticated migration mechanism. No credentials in GitHub, chat or scripts.
2. Read-only inspect existing `piratecartography` table names/structures; confirm the `TABLES` table and any earlier partial import.
3. Verify current backup inventory and count all five record exports. Compare record IDs and link targets against the schema snapshot.
4. Only then, with approval, run the staging SQL against `piratecartography` **only**.
5. Import snapshot rows into `pc_mig_records`, preserving original JSON, original IDs, source snapshot and all relationship arrays. Use parameterized SQL, idempotent keys, no invented values.
6. Validate per-table counts, missing IDs, orphan links, JSON integrity and checksums; log outcomes in `pc_mig_audit`.
7. Design production schema from actual Airtable fields and existing DB structure; migrate only after passing validation. Do not switch agents off Airtable until tests succeed.
8. Keep evidence verification gates intact: DISCOVERED → LOCATED → ACQUIRED → EXACT_PAGE_MAPPED → ORIGINAL_INSPECTED → EXTRACTED → GENEALOGY_CHECKED → CORROBORATED → VERIFIED. Never promote evidence automatically.

## Current blocker
Work Cloud Browser reports `502 Certificate verify failed: certificate has expired` for the Plesk host. The user's local browser works. This GitHub change does not repair that certificate and does not provide remote DB access. Direct external access is also incompatible with a localhost-only DB user. Actual deployment requires a working authorized channel, e.g. host-local execution or repaired Work access.

## Operational safety
Never publish passwords, tokens, SQL dumps containing personal data or secrets in the repository. Never touch the WordPress database. No automated agent cutover yet.
