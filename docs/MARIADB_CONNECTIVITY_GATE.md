# MariaDB staging read-only connectivity gate

The Airtable snapshot `20261012T113000Z` has been imported manually into the
dedicated `piratecartography` database. This does **not** mean that research
agents are connected to MariaDB.

Run `python tools/mariadb_staging_smoke_test.py` **from an execution
environment that can reach the database**, after installing `pymysql` and
setting the environment variables `PCT_DB_HOST`, `PCT_DB_PORT` (optional),
`PCT_DB_NAME=piratecartography`, `PCT_DB_USER`, `PCT_DB_PASSWORD`.

Important: Plesk's `localhost:3306` refers to the hosting server itself.
It will not work as a GitHub Actions database hostname. Do not open database
port 3306 to the public internet. Do not commit secrets or put credentials in
ChatGPT. Use hosting-local execution or a private network/tunnel with TLS.

The script is strictly read-only and verifies PLACES=3, SOURCES=11, EVENTS=1,
ROUTES=0, RESEARCH_JOBS=1. It does not write records, modify workflows, or
change the existing Airtable backend.

After PASS, implement a MariaDB storage adapter and switch research jobs
behind an explicit feature flag. Verify read/write and rollback on a separate
test job before enabling any of the ten lanes. Preserve source-first evidence
gates and provenance.
