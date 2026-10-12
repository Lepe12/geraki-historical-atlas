# AGENT PIRACY — CANONICAL MASTER

**Status:** Active canonical entry point  
**Repository:** Lepe12/geraki-historical-atlas  
**Last verified:** 2026-10-12

## Purpose

Agent Piracy is a persistent archival-research system for piracy, corsairing, maritime conflict, intelligence networks and related Mediterranean/European research. GitHub is the durable source of truth. Chat history or model memory must never be treated as the sole store of system state.

## Operating rule

A connector is **CONNECTED** only after a real live query returns verifiable catalogue records from the claimed institution. A green workflow, reachable website, search form, or third-party index is not sufficient.

Historical research must:
1. Prefer primary sources.
2. Separate facts, interpretations and hypotheses.
3. Preserve exact archival references and provenance.
4. Never fabricate records, references, signaturas, quotations or document contents.
5. Distinguish catalogue metadata from inspection of an original/digitized archival document.

## Ten research lanes

1. **british** — British archival and printed-source research.
2. **dutch** — Dutch archival and printed-source research.
3. **french** — French archival and printed-source research.
4. **german** — German archival and printed-source research.
5. **italian_states** — Italian states outside the dedicated Venetian lane.
6. **north_african** — North African sources and related European collections.
7. **ottoman** — Ottoman/Turkish archival and bibliographic sources.
8. **spanish_simancas** — Spanish Monarchy research, especially Archivo General de Simancas/PARES.
9. **travellers** — travellers, published narratives and complementary eyewitness/source traditions.
10. **venetian** — Venice / Archivio di Stato di Venezia and related Venetian collections.

Research-lane definitions and run evidence are preserved under:
- `evidence/runs/*/research_lanes/`
- `evidence/runs/*/lane_discovery/`

Primary orchestration:
- `.github/workflows/pct-parallel-multi-agent.yml`
- `.github/workflows/library-source-discovery.yml`

## Connector verification status — 2026-10-12

Authoritative detailed matrix:
`docs/CONNECTOR_VERIFICATION_MATRIX_2026-10-12.md`

### CONNECTED

- **PARES / Archivo General de Simancas** — CONNECTED, native PARES catalogue.
  - Native dynamic search verified in GitHub Actions run **38295298857**.
  - Acceptance evidence: `evidence/PARES_SIMANCAS_ACCEPTANCE_2026-10-12.md`
  - Discovery connector: `connectors/pares_simancas_discover.py`
  - Strict verifier: `connectors/pares_simancas_verify.py`
  - Verified dynamically discovered examples:
    - 7021381 — `ES.47161.AGS/3.9.2.5//SSP,LIB,369`
    - 2764708 — `ES.47161.AGS/3.9.2.6//SSP,LIB,318`
    - 2764707 — `ES.47161.AGS/3.9.2.6//SSP,LIB,317`
  - Scope: catalogue metadata verified; originals not inspected.

- **Biblioteca Digital Hispánica** — CONNECTED, catalogue.
- **BSB** — CONNECTED, catalogue.
- **The National Archives Discovery** — CONNECTED, query path verified; a zero-hit query is not a connector failure.
- **Nationaal Archief** — CONNECTED, catalogue.
- **Delpher** — CONNECTED, catalogue.
- **Archives diplomatiques** — CONNECTED, catalogue.
- **Gallica / BnF** — CONNECTED, catalogue.
- **Archives nationales** — CONNECTED through the separately implemented official open-data route; do not misrepresent open-data coverage as complete archival catalogue coverage.
- **Internet Culturale** — CONNECTED, query path verified; zero hits may be legitimate.
- **İSAM Kütüphanesi** — CONNECTED, catalogue.

### BLOCKED / NOT YET ACCEPTED

- **Deutsche Digitale Bibliothek** — BLOCKED pending official `DDB_API_KEY`.
- **British Library** — BLOCKED / public anonymous archival search route not yet accepted.
- **Archivio di Stato di Venezia / Moreveneto** — BLOCKED_REMOTE_NETWORK.
  - Official SPA: `https://asve.arianna4.cloud/`
  - GraphQL backend discovered but remote GitHub execution cannot currently reach it.
  - Code: `connectors/moreveneto_search.py`, `connectors/moreveneto_browser_search.py`, `connectors/moreveneto_record_verify.py`
  - Gate/status: `docs/VENETIAN_CONNECTOR_GATE_2026-10-12.md`
  - Do not label CONNECTED until a live archival-record acceptance gate passes.
- **SIAS / Italian State Archives** — BLOCKED / mechanics not yet accepted.
- **Türkiye Devlet Arşivleri / BOA** — BLOCKED by researcher authentication/CAPTCHA. Never bypass CAPTCHA.

## PARES / Simancas acceptance gate

The connector became CONNECTED only after the following complete chain succeeded:

`native PARES search -> dynamically returned IDs -> explicit Archivo General de Simancas attribution -> live catalogue description -> ES.47161.AGS reference -> non-empty signatura -> stable PARES record URL`

GitHub Actions run **38295298857** passed with 3 verified records and zero verifier errors.

The working discovery strategy filters native PARES result rows by explicit `Archivo General de Simancas` attribution before strict record verification. This avoids unnecessary requests and does not depend on hardcoded record IDs.

## Evidence and persistence

Persistent evidence lives under:
- `evidence/`
- `evidence/runs/`
- `docs/`
- `connectors/`
- `.github/workflows/`

Evidence store documentation:
- `docs/EVIDENCE_STORE.md`
- `evidence/README.md`

Airtable backup material is also preserved in:
- `backups/airtable/`

GitHub commits, code and evidence are the durable system state. Conversation memory can help navigation but must not override repository evidence.

## Recovery / continuation protocol

When a new model/session resumes Agent Piracy:

1. Read this file first.
2. Read `docs/CONNECTOR_VERIFICATION_MATRIX_2026-10-12.md`.
3. Inspect the relevant connector under `connectors/`.
4. Inspect its workflow under `.github/workflows/`.
5. Read its acceptance evidence/gate document.
6. Check the latest GitHub Actions run before changing status.
7. Never downgrade or upgrade connector status based only on recollection.
8. Continue from repository state, not from chat assumptions.

## Canonical status rule

**CONNECTED means proven access to real source records.**
**PARTIAL means useful mechanics are proven but the full acceptance gate is not.**
**BLOCKED means an external technical/authentication/network requirement prevents acceptance.**
**DISCOVERED means an endpoint/dataset has been identified but not yet proven as a working connector.**

This file is the canonical navigation document for Agent Piracy. Detailed evidence remains authoritative for individual connector claims.


## Architecture v2 — 2026-10-12

Three general research-engine upgrades are canonical:

1. **Parameterized research command.** `.github/workflows/pct-parallel-multi-agent.yml` exposes workflow-dispatch inputs for target, aliases, date range and research purpose. `tools/request_context.py` accepts those inputs without requiring a bespoke request JSON. Push-triggered durable JSON requests remain supported.

2. **Auditable multilingual/historical query expansion.** `tools/historical_query_expansion.py` creates lane-specific event-vocabulary queries while preserving researcher-supplied historical name variants. Generated queries are stored in each repository plan. The engine must not invent unsupported historical spellings.

3. **Complete candidate processing by default.** Artificial first-N acquisition and exact-page caps were removed from the canonical multi-agent workflow. Exact-page processing checkpoints every candidate and records unmapped candidates explicitly. Verification gates remain unchanged: exhaustive processing does not imply verification.

Regression run **38297211798** confirmed correct request routing. The Italian-states lane generated 24 auditable expanded queries and completed through exact-page/health as `OPERATIONAL_WITH_EXPLICIT_BLOCKERS`.

These are generic Agent Piracy capabilities and must never be specialized to a benchmark place, person or event.


## Request integrity gate — 2026-10-12

Agent Piracy now pins every research run to one canonical request identity before the ten research lanes execute.

Canonical controls:
- `tools/request_identity.py` creates a deterministic SHA-256 over the normalized request.
- Every run receives a `research_job_id`.
- `prepare` resolves the request once and passes the same `request_file`, `request_sha256` and `research_job_id` to all ten lanes.
- `tools/verify_request_integrity.py` fails if lane payloads disagree.
- `tools/research_system_health.py` independently checks the durable evidence from all ten lanes and sets `request_fingerprint_ok`.
- The aggregate GitHub gate fails if ten-lane health or request fingerprint consistency fails.
- `.github/workflows/library-source-discovery.yml` also resolves, pins and revalidates the same request within its run.

Accepted regression:
- GitHub Actions run **38298585128** — SUCCESS.
- Ten lane reports present: true.
- Ten lanes operational: true.
- `request_fingerprint_ok`: true.
- All 10 lanes used:
  - request file: `agent-piracy-architecture-v6-20261012.json`
  - research job: `agent-piracy-38298585128-31852297c6f8`
  - SHA-256: `31852297c6f8d37d54e2e8413bb8d52d368148e92292f2d4d31e61ee6db6f056`
- The aggregate log ended with: `TEN-LANE REQUEST INTEGRITY GATE PASSED`.
- Library workflow run **38298585150** also completed SUCCESS with the pinned-request workflow.

This gate proves that all ten lanes executed from the same research request. It does not by itself verify any historical claim.
