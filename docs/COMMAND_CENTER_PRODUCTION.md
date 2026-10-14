# Command Center production deployment

## Architecture

Production data path:

`JARVIS / GitHub Actions -> GitHub OIDC -> Plesk live service -> WebSocket -> GitHub Pages Command Center`

Durable fallback:

`GitHub evidence -> command-center/live/latest.json -> GitHub Pages`

The durable fallback is real research data and contains no preview/demo records.

## Public UI

`https://lepe12.github.io/geraki-historical-atlas/command-center/`

Default backend:

`https://www.piratecartography.com/pct-api/live`

Health endpoint:

`https://www.piratecartography.com/pct-api/live/health`

WebSocket:

`wss://www.piratecartography.com/pct-api/live/ws/piratecartography/latest`

## Plesk Node application

Application root:

`/var/www/vhosts/piratecartography.com/piratecartography-gateway/server/command-center-live`

Startup file: `app.js`

Node.js: 18 or newer.

Application URL: mount the Node application at `/pct-api/live`.

The process listens only on `127.0.0.1` using the `PORT` supplied by Plesk and should be exposed through Plesk/Nginx HTTPS reverse proxy. Do not expose MariaDB and do not place DB credentials in the Node application.

Run before activation:

```sh
cd /var/www/vhosts/piratecartography.com/piratecartography-gateway
sh tools/gateway/deploy_command_center_live.sh
```

No npm packages are required.

## Authentication

Browser GET and WebSocket reads are public read-only operational research state.

POST `/events` accepts only GitHub Actions OIDC JWTs with:

- issuer `https://token.actions.githubusercontent.com`
- audience `piratecartography-command-center`
- repository `Lepe12/geraki-historical-atlas`
- ref `refs/heads/main`
- valid RS256 signature from GitHub JWKS.

No reusable API secret is stored in GitHub.

## Scientific boundary

The service transports workflow state only. It cannot set `VERIFIED`, cannot update MariaDB historical evidence, and cannot replace human review.
