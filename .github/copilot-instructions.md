# NABOU//X — GitHub Copilot repository instructions

You are contributing to **NABOU//X / Pirate Cartography Historical Research System**, not a greenfield website. Favor small, evidence-backed changes to the existing codebase and avoid unnecessary rewrites.

## Before changing code
- Read `docs/SYSTEM_SPEC.md` for the canonical SOURCE-FIRST / EVENT-FIRST research contract.
- Read `docs/COMMAND_CENTER_PRODUCTION.md` and `docs/MARIADB_RESEARCH_STORAGE.md` when work touches deployment, live feeds, data or research workflows.
- Inspect the relevant implementation, existing tests, and actual call sites before proposing changes.
- Distinguish confirmed problems from hypotheses. Record a reproducible baseline for performance or reliability work.

## Strict protected boundaries
- **Do not modify** the established 3D map's core, camera, canvas, renderer, overlays, queries, backend or API contracts unless the task explicitly requires it and receives separate review.
- Specifically treat `jarvis-intelligence-chamber/map-3d*`, `gpu-field.js`, `world3d.js`, `historical-map-*`, `voyage-3d*` and related render/camera modules as protected.
- Preserve the existing JARVIS Chamber navigation layout, left rail, Greek user-facing labels, historical maps, agent workflows, WebSocket feeds and evidence presentation.
- Never modify production directly: no automatic deployment, merges, live host writes, Plesk/WordPress edits, `.htaccess` changes or secret updates.
- Do not read, print or commit access tokens, private credentials, personal manuscripts or private archival sources.
- Never relax authentication, CORS, file-access restrictions, evidence validation or scientific safeguards to make a test pass.
- The dedicated MariaDB `piratecartography` store and Evidence Store are canonical research infrastructure. Do not alter schemas, provenance, source truth, verified flags or historical records incidentally.
- Do not replace existing production functionality with mockups, fabricated results, AI-generated citations, or demo datasets.

## Coding workflow
1. Explain the specific problem and identify affected files.
2. Make the smallest reversible change that solves the request. Prefer isolated modules and preserve working behavior.
3. For performance work, include real before/after measurements, an identical environment and the methodology. Distinguish lab data from live production measurements.
4. Add or update targeted tests and run relevant checks. Report the exact commands and whether each test passed; never claim unexecuted tests.
5. Use a feature branch and open a **draft Pull Request**, with changed files, risk analysis and evidence. Do not merge or deploy without explicit operator approval.

## If asked to build an autonomous agent or writing feature
- Keep new components isolated from the 3D core and the research backend.
- Treat LLMs as interchangeable providers. Do not assume a proprietary subscription or embed API keys in browser code.
- Preserve full original source text and provenance for historical transcription; identify unreadable text explicitly. Never hallucinate citations.
- For Greek fiction editing, preserve authorial voice, continuity and explicit approval of edits; do not silently rewrite whole manuscripts.

## What a good PR contains
- Purpose and scope; changed files.
- Baseline, methodology, and after-result where measurable.
- Relevant test results and limitations.
- Explicit statement that protected subsystems and production remain untouched.
