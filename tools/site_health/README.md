# Live site health check

`check_site.mjs` loads https://lepe12.github.io/geraki-historical-atlas/jarvis-intelligence-chamber/ in headless
Chromium (2D page, then `?map3d=1`). It fails on:
- uncaught JS errors,
- same-site requests answering 400 or above,
- broken images,
- broken same-site links, and external links or assets answering 404/410,
- a 3D map that never becomes ready or has no canvas.

Other external hiccups (403, 429, 5xx, timeouts) are only reported as warnings.
It is read-only: every non-GET request the page tries is blocked.

It runs nightly at 01:00 UTC (03:00 Athens in winter, 04:00 in summer) via `.github/workflows/site-health-nightly.yml`,
and it can also be started by hand (workflow_dispatch). If it fails, it opens or updates one issue labelled
`site-health`; once the site is healthy again, it closes that issue. The report (JSON) and a 3D screenshot are uploaded
as artifacts.

Local run: `npm i --no-save playwright@1.56.1 && npx playwright install chromium && node tools/site_health/check_site.mjs`.
