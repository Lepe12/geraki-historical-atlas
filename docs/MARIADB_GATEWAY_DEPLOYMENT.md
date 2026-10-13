# Read-only HTTPS gateway — deployment gate

## Current state
- The user confirmed a **PASS** from a Plesk-local PHP script on 2026-10-13: MariaDB connectivity and 16 imported staging records.
- This repository contains a **prototype**, not a deployed endpoint. **No remote access has been established** and no agents have been switched.
- Server-local MariaDB stays on `localhost:3306`. Never expose port 3306 or DB credentials publicly.

## Files
- `tools/gateway/pct-staging-gateway.php`: authenticated HTTPS-only aggregate read endpoint.
- `tools/gateway/check_gateway.py`: HMAC-authenticated remote smoke test.

## Deployment prerequisites (not yet performed)
1. Review the PHP endpoint and hosting restrictions before deployment. Use a dedicated HTTPS path with TLS configured; keep it isolated from WordPress and avoid changing existing site routing.
2. Deploy only the gateway PHP file to a deliberately chosen HTTPS-accessible location. The existing private `piratecartography-system/pct_db_config.php` must stay **outside** `httpdocs`.
3. Configure **server-side environment** `PCT_DB_CONFIG_PATH` as the absolute path to that private config file and `PCT_GATEWAY_SECRET` as a cryptographically random secret of at least 32 bytes. Confirm Plesk's PHP handler actually passes these variables to the endpoint. Do not put secrets in GitHub files, public webroot, or chat.
4. Configure the client secret in GitHub Actions secrets only after deployment, plus `PCT_GATEWAY_URL` in variables/secrets. Execute `python tools/gateway/check_gateway.py` once manually and verify PASS.
5. Do **not** enable the ten agents yet. This endpoint supports only fixed read-only counts, **not** general record reads/writes, historical research, or production synchronization.

## Security and limits
- Requests require HTTPS, signed HMAC SHA-256, and timestamps within 60 seconds.
- The nonce is signed but **not stored**. A captured valid request can be replayed within that window; safe here only because the endpoint is strictly read-only and returns fixed aggregates.
- The server currently uses its existing DB user, which may have write permissions. For production, create a dedicated least-privilege read-only DB account.
- Use rate limiting / IP restrictions where available, monitor access logs, and rotate secrets on suspected exposure.
- No server deployment, user secret configuration, endpoint URL, remote PASS, or agent migration is claimed by this commit.

## Next implementation milestone
After verified remote read-only access: build a separate evidence-aware storage adapter, schema validation, provenance tests, and reversible feature-flagged rollout. Do not interpret a technical PASS as validation of historical claims.
