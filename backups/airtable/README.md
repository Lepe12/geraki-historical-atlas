# Airtable durable record backup

The schema snapshot is stored under `backups/airtable/schema/`.

Full record snapshots must be exported by GitHub Actions directly from the Airtable REST API using an Actions secret named `AIRTABLE_TOKEN`. This avoids routing record contents through ChatGPT and keeps the durable backup inside the repository.

Backup target:
`backups/airtable/records/<UTC timestamp>/`

Tables:
- PLACES — tbluvDJfE42j5qxMa
- SOURCES — tblVnmghyTX7B2EgD
- EVENTS — tblr7KI6LCxpFnp1I
- ROUTES — tblsRfozlMSZ03w7M
- RESEARCH JOBS — tblXWi37TDh1ZqrX6

A backup is persistence only; it does not change verification status.
