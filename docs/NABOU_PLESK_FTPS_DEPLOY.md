# NABOU//X: Plesk FTPS deployment setup

Status: **existing-host FTPS deployment confirmed** by run39480819391, followed
by actual HTTP/GitHub OIDC PASS. Read-only diagnosis39481201814 also confirmed
the active legacy host-local importer, while the new evidence PHP/schema files
were absent. Schema installation is a separate explicit operation below.

## Hosting prerequisites

1. In Plesk, confirm an **FTPS (FTP over explicit TLS)** account can access the specific site and the backend application directory. Prefer a dedicated account scoped to the site. **Do not share its password in a ChatGPT message or commit.**
2. Check the account's FTP-visible application path. It may differ from the filesystem path shown in Plesk: test the actual FTP path, which must end in `/server/command-center-live` and contain `package.json`, `public/` and `tmp/`.
3. Confirm passive FTPS and uploads, renames, downloads, and deletions are allowed by the host. This workflow requires all of them.
4. Ensure the managed Node.js app's startup file is `app.js` under the same directory.
5. Verify FTP TLS certificate trust and that the account cannot reach unrelated websites or system folders.

## GitHub environment configuration

Go to Repository **Settings → Environments → New environment** and create `nabou-production`. Require manual reviewers if available.

Inside that environment, create **Secrets**:
- `PCT_FTPS_HOST`: host name from your hosting provider
- `PCT_FTPS_USER`: scoped FTPS account username
- `PCT_FTPS_PASSWORD`: scoped FTPS account password

Create **Variables**:
- `PCT_FTPS_APP_ROOT`: **FTP-visible** path to the exact backend application directory; this value must end with `/server/command-center-live`
- `PCT_FTPS_PORT`: usually `21`, only if confirmed by hosting provider

Do not reuse `PCT_OPERATOR_TOKEN` or the GitHub workflow-dispatch token as an FTP credential.

## Deployment and acceptance

Only after merging the reviewed PR and confirming hosting settings: open **Actions → NABOU Plesk FTPS deployment → Run workflow**, enter `DEPLOY-NABOU`, and approve the protected production environment, if prompted.

An explicitly authorized production request can also be committed to
`ops_ftps_requests/nabou-existing-host.json` on `main`. The workflow accepts only
schema `nabou-existing-ftps-deployment-request-v1`, mode `deploy`, application
`server/command-center-live`, `backend_only: true` and confirmation `DEPLOY-NABOU`.
This route retains the same `nabou-production` environment and its existing
protection rules. It does not bypass an environment approval or access restriction.

FTPS explicitly verifies the TLS certificate and hostname with the system trust
store. Credential presence, source file hashes and the actual transfer outcome are
stored in `evidence/production_ftps/<run_id>/report.json`; secret values and raw
server error messages are never stored. Missing bindings stop before connection.
The subsequent `evidence/production_smoke/<run_id>/report.json` performs actual
HTTP and GitHub OIDC checks. A successful upload alone is not acceptance.

For an existing account configured with a numeric server IP, provide the confirmed
hosting TLS hostname in the request's `tls_server_name`, or the environment
variable `PCT_FTPS_TLS_SERVER_NAME`. Read-only probe39480213981 verified
`linux3087.grserver.gr` against the configured server with normal CA and hostname
checks. Deployment first checks forward DNS, connects to the original configured
address, and uses the explicitly configured name for control/data TLS validation.
It does not disable verification or follow a different server address.

The action runs syntax and Node self-tests first, transfers only four backend files over TLS, verifies SHA-256 of staged files, saves existing remote files for recovery, places `app.js` last, triggers the Passenger restart marker, and tests health and evidence routes.

**Backend mode limits:** the four-file deployment does **not** apply the
PHP/MariaDB schema or prove the full PDF Learning/evidence pipeline. A200 health
alone is not a complete acceptance test. On a failed job, inspect the report and
confirm a safe rollback before retrying.

## Existing host-local evidence schema installation

The explicit `evidence_storage` payload installs only four versioned storage
files and a hash-bound request under the existing `tools/storage` directory.
It requires the additional confirmation `INSTALL-EXISTING-EVIDENCE-SCHEMA`.
This payload does not replace the Node backend or restart Passenger.

The existing host-local cron348 consumes the request while holding the existing
storage lock. It verifies all code hashes and the exact `piratecartography`
database, creates a private0600 database snapshot, then applies the additive
`pc_he_*` migration. Success preserves the applied request; failure quarantines
it instead of repeating backups/DDL every five minutes. Ordinary sync without
an explicit request never initiates a migration. No new public administrative
endpoint, database, cron job or backend is created.

After installation, the same importer ingests source-bound UNREVIEWED evidence
and checks citation database readbacks inside the transaction. A schema request
may explicitly select existing numeric run IDs for one-time evidence replay.
No historical verification or human review state is promoted.

The private `pct-evidence-schema-last.json` and `pct-research-storage-last.json`
receipts record the actual migration, backup checksum and recent import counts.
The read-only FTPS diagnostic exports only approved receipt fields/code hashes;
it never reads credentials or backup contents. Transfer success remains
`STORAGE_FILES_STAGED_AWAITING_HOST_LOCAL_MIGRATION` until those host-produced
receipts and the requested evidence counts have been checked.

The frontend, 3D, GitHub Pages, and research query selectors are not touched by this workflow.
