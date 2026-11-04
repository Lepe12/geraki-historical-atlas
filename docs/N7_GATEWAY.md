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

## N7 → Qwen 7B GitHub bridge (review-only)
Once this PR is merged and the existing Node service is deployed/restarted,
an authorized `POST /pct-api/live/n7/code` accepts a JSON object with:
- `task`: 8–2000 characters (concrete frontend coding request);
- `target_files`: an array of 2–3 distinct items selected only from
  `jarvis-intelligence-chamber/navigation-rail.css`,
  `jarvis-intelligence-chamber/photon-windows.css`,
  `jarvis-intelligence-chamber/nabou-shell.css`.

The server sends a **fixed** GitHub Actions dispatch to
`nabou-coder-v03.yml` on `main`, always with `apply_changes=false`.
This runs the existing Qwen2.5 Coder 7B code workflow and saves a preview
artifact. It **does not** write, merge, or deploy AI-proposed changes.
Operator authorization, configured GitHub token, browser Origin controls and
rate limits match existing N7 dispatch. The server token must have permission
to trigger Actions. The response HTTP 202 proves acceptance by GitHub only,
not completion of the model inference; inspect the GitHub Actions run.

Smoke checks: `node --check server/command-center-live/app.js` and
`node --test server/command-center-live/n7-gateway.test.js`.
Production integration still requires reviewed merge and live host deployment.
