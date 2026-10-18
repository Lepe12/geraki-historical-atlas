# NABOU//X release validation — 2026-10-18

## Published implementation

The redesigned four-destination workspace, per-run dossier, searchable history and mobile label layout were merged with current main, preserving the upstream cited semantic-answer renderer and its tests. Original scene and GPU renderer files were not changed.

- First successful Pages deployment: https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39107851423 (release `5aeb92d2c`).
- Subsequent successful deployment: https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39108246286 (`35a831bd2`).
- Production transport gate: https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39107851418 — successful health, GitHub OIDC ingestion/read-back and WebSocket bootstrap.
- Local validation after integration: 18 JavaScript tests, 3 history tests, snapshot test and 10 semantic-answer tests passed. Browser layout/rendering passed at 1440×900, 1024×768, 390×844 and 360×740; dispatch-correlation/history scenarios passed on desktop and mobile. The layout and startup suites were also checked with the CI-pinned Playwright 1.56.1.

## One real research run

- Explicit request: `jarvis_dispatch_requests/nabou-release-validation-20261018.json`.
- Question: primary/near-contemporary sources about Petros Lantzas, 1577–1583; preserve uncertainty and access blockers.
- The repository's existing push-triggered controlled-dispatch workflow was used because this cloud machine blocks the GitHub API. No duplicate engine or alternative backend was created.
- Controlled dispatch succeeded: https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39107977767.
- Actual engine run succeeded: https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39107988812.
- Read-back: `command-center/live/runs/39107988812.json` and `evidence/runs/39107988812/JARVIS_STATE_BOARD.json`.
- Recorded output: 11 selected lanes, 17 agents, 559 retained discoveries, 7 candidate claims, 68 blocker records, zero verified events. Lane execution does not establish that every named archive was searched successfully.
- Actual snapshot was downloaded using an immutable Git commit URL at `12c9a55f4246872bcc5e85eea3b2046e085e5706`; SHA-256: `290b193b4f15005c3e3a27d878cd514287932cb04fcce818d3b0d28dab445e4c`.
- The browser rendered that actual downloaded snapshot in the local current UI: correct target, period, completion state, permalink and all 7 claim cards with source-information sections. This was persisted-data playback, not a claim that the cloud browser connected to production.
- `MARIADB_STORAGE_INTENT.json` reports `QUEUED_HOST_LOCAL_IMPORT`; host-local import/read-back was not verified in this task.

## Real PDF, real local persistence

The existing 10-page PDF beginning “LA COMUNITÀ GRECA DI NAPOLI…” was inspected on PDF page 1 and used for a bounded persistence check:

- File: `evidence/runs/39070827107/travellers/library_acquisition/2136a43005d22adb0df51e2f.pdf`.
- SHA-256: `3bde5c976c238430a772fe598b0ddb79b5fb07fdf1adb5f6a62979fd0fe4a869`.
- Actual PDF.js 4.10.38 extraction, using assets downloaded from the official jsDelivr package path with TLS verification enabled.
- Browser extracted all 10 pages. Before approval the actual backend had no uploaded sources.
- One excerpt on PDF page 1 was selected for the storage test; the original Node service stored exactly that one accepted item, along with the source text/pages. Stored PDF bytes matched the original SHA-256; search/read-back found the saved item.
- Storage was isolated under `/tmp/nabou-release/knowledge` and not sent to production. Acceptance for a persistence test does not establish scientific or human historical verification. Printed pagination was not inferred from PDF page 1.

## Remaining external checks

This cloud instance's enforced network policy denies `api.github.com`, `lepe12.github.io` and `pct-live.piratecartography.com`. Domain additions were saved to the environment configuration draft; runtime activation requires the user's environment-settings Save and Publish action.

Consequently direct browser verification of the published site, dispatch from the actual public UI, production PDF upload/review/read-back and the new run's MariaDB import are unverified. Existing production-gate results are separately recorded above; they do not substitute for those unperformed operations.

The previous visual gate targeted removed cinematic/voice controls and was updated to exercise the current renderer/layout, run dossier, dispatch correlation, history and startup feedback. GitHub runner status is recorded below when available.

## Final visual gate

https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39108601738 succeeded on commit `12c9a55f4`. Renderer/responsive-layout checks, research dossier and dispatch-correlation/history checks, immediate startup feedback and visual-artifact upload all passed. WebSocket matching in the isolated browser suites is explicit across Playwright versions. The old failing cinematic-shell runs remain historical; they were not relabelled as passing.
