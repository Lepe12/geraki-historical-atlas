# Plesk production live backend — 2026-10-14

Status: HTTP health restored; public WebSocket and current Pages UI are NOT passing end-to-end.

## Existing infrastructure
- Same Plesk server and subscription as piratecartography.com.
- Main WordPress document root remains httpdocs; main-domain Node.js remains disabled.
- Managed Passenger app host: pct-live.piratecartography.com (Plesk site 751).
- Application root: piratecartography-gateway/server/command-center-live.
- Startup: app.js. Node: /opt/plesk/node/24/bin/node. Document root: application-root/public.
- public/.htaccess contains Require local. External HTTP health returned 403.
- HTTP-to-HTTPS redirect was disabled ONLY on the internal app host, with explicit user approval.
- Passenger startup guard and a loopback net listener in the SAME managed process were added in commit 5a70a6142e8ea9b51efb664616b47b574236bbcc.
- Main /pct-api/live is reverse-proxied to 127.0.0.1:8787. Public HTTPS certificate settings remain unchanged.
- Plesk scheduled task 349 runs a local managed health request every minute, with no notifications:
  curl -fsS --max-time 20 -H "Host: pct-live.piratecartography.com" http://127.0.0.1:7080/pct-api/live/health
  Output: application-root/managed-health-last.json. No standalone daemon is launched by this task.

## Verified checks
- Existing service self-test PASS after startup changes.
- Managed local HTTP health 200.
- Loopback HTTP health 200.
- Public HTTPS /pct-api/live/health 200 with real baseline run 38533094395.
- Loopback WebSocket bootstrap received schema pct-command-center-bootstrap-v1 and 10 recorded agent entries.
- Public WSS FAIL: HTTPS request observed HTTP 101 but no Upgrade response header; actual WebSocket clients failed to connect.
- GitHub run 38561412510 was rerun; transport-tests PASS, production-live-smoke FAIL with LIVE_TRANSPORT_FAIL WebSocket failed to connect.
- No historical fixtures, evidence promotions, databases, credentials or WordPress content were changed.

## Unfinished
- Correct WebSocket Upgrade forwarding through the existing front proxy. Do not claim the front proxy is fixed from HTTP 101 alone; require an actual client bootstrap.
- Generated Nginx configuration is not readable by the subscription user (EACCES); custom Nginx directives are not exposed in this account.
- The public Pages chamber was observed as an older VISUAL SIMULATION build. The existing atlas-pages.yml push paths omit jarvis-intelligence-chamber/**.
- Adding that path to automatic Pages deployment was rejected by automatic approval review as a CI/CD change requiring specific user authorization; it was NOT applied. Do not bypass that rejection.
