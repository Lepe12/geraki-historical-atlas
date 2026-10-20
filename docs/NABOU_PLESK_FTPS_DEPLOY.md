# NABOU//X: Plesk FTPS deployment setup

Status: **NOT CONNECTED** until a valid FTPS account and its remote folder are verified. The PR checks only confirm source syntax and tests; they do not prove Plesk connectivity or live deployment.

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

The action runs syntax and Node self-tests first, transfers only four backend files over TLS, verifies SHA-256 of staged files, saves existing remote files for recovery, places `app.js` last, triggers the Passenger restart marker, and tests health and evidence routes.

**Limits:** FTPS deployment does **not** apply the PHP/MariaDB schema and does **not** prove the full PDF Learning/evidence pipeline. The schema and data migration must be validated separately. A 200 health alone is not a complete acceptance test. On a failed job, inspect the logs and the server, and confirm a safe rollback before retrying.

The frontend, 3D, GitHub Pages, and research query selectors are not touched by this workflow.
