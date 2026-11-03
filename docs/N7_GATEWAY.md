# N7 operational gateway (proposed)
This feature reuses the existing Top.Host/Plesk Command Center Node process; it does **not** create a second public server or modify the Atlas renderer.

## Endpoints after merging and deploying
- `GET /pct-api/live/n7/status` — public, read-only summary of the existing live run. `connected: false` means no snapshot has been observed; it does **not** assert that the Plesk process is down.
- `POST /pct-api/live/n7/dispatch` — **operator bearer token required**, JSON body `{"target":"Research piracy at Naxos in 1670"}`. Accepts 3–500 characters, forwards only to the pre-existing `jarvis-controlled-dispatch.yml` workflow on `main`, and rate-limits to one accepted request per 10 seconds per process. Returns HTTP 202 with request ID on accepted GitHub dispatch, **not** a claim of successful research execution.

Required host environment: `PCT_OPERATOR_TOKEN` and `PCT_GITHUB_DISPATCH_TOKEN`, already used by the existing service. Never write either token to GitHub or browser JS. A request with an Origin header is accepted only from `https://lepe12.github.io`. Server-to-server clients may omit Origin but still need the operator bearer token.

## Integration
The only change to `app.js` is a require and a dispatch to the small `n7-gateway.js` router. Existing `/health`, `/status`, `/dispatch`, WebSocket, knowledge ingestion, scientific verification gates, and 3D rendering remain untouched.

## Validation and rollout
1. Run `node --test server/command-center-live/n7-gateway.test.js` and `node --check server/command-center-live/app.js`.
2. Review the draft PR; do not automatically merge or deploy.
3. On the Plesk host, deploy the reviewed commit using the existing `tools/gateway/deploy_command_center_live.sh` check and restart the current Node application.
4. Query `GET https://www.piratecartography.com/pct-api/live/n7/status`; confirm the schema. Verify unauthenticated POST returns 401. Execute authorized POST only after reviewing production credentials and GitHub workflow permissions.
5. Verify the GitHub workflow run starts and live status advances. Track an end-to-end run before describing this as production-ready.

## Limitations
This is a controlled JARVIS workflow dispatch bridge, **not** a general shell, editor, autonomous coding agent or server administrator. No arbitrary command execution, filesystem writes, direct MariaDB access or unattended production deployment is permitted through N7.
