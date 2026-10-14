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


## Superseding update — 2026-10-14 18:29 UTC
- User explicitly approved public HTTPS transport on existing pct-live subdomain and accepted Let's Encrypt terms.
- Let's Encrypt certificate installed for pct-live.piratecartography.com, expiry 2027-01-12.
- Proxy mode disabled ONLY on site 751: nginx-only Passenger. Main WordPress settings unchanged.
- Actual external HTTPS health on https://pct-live.piratecartography.com/pct-api/live/health returned 200 with baseline 38533094395; original www health also rechecked 200.
- Actual WSS client on the server connected to wss://pct-live.piratecartography.com/pct-api/live/ws/piratecartography/latest and received pct-command-center-bootstrap-v1 with 10 agents.
- Added masked control-frame handling for close and ping to app.js in commit bae80a0a6da5bb6d4091fa50bb015fd1a4b47a19. Exact deployed SHA256 f8b7a8e21f64709526a2c4036a3073e64128fad9a63b835f464fdd3b324d2482. Backup app.js.before-ws-control retained outside document root. Restart requested via Plesk.
- Post-deployment self-test PASS and actual public WSS close code 1000, wasClean=true.
- Existing task 349 changed to HTTPS health on pct-live, every minute, no notifications; Plesk confirmed saved.
- Chamber bridge, production smoke and hostname assertion changed to approved pct-live endpoint. No UI redesign.
- Workflow jarvis-v5-live.yml run 38614811956: transport-tests SUCCESS and production-live-smoke SUCCESS, verified through GitHub jobs API.
- Original www WSS route has NOT been proven repaired; the approved subdomain is the working transport.
- Baseline is existing recorded control run 38533094395 with zero verified historical events. Transport PASS does not assert historical accuracy.
- Pages path-trigger edit remains NOT applied after automatic approval review rejection even following specific approval. No indirect bypass performed.
- Chromium public-site verification was blocked by cloud credential protection; 3D live display remains UNVERIFIED. No end-to-end UI success claimed.
