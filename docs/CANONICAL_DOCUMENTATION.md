# Canonical documentation map

**Purpose:** prevent old implementation notes, dated audits and experimental UI documents from being mistaken for the current Piratecartography/JARVIS system specification.

## Canonical current documents

These define the current system and take precedence over older notes:

- `docs/SYSTEM_SPEC.md` — system architecture, 11 research lanes, evidence states, storage and recovery.
- `docs/general-research-doctrine.md` — research doctrine, discovery retention and scientific boundaries.
- `docs/source-acquisition-contract.md` — acquisition/provenance contract.
- `docs/HUMAN_REVIEW_VERIFICATION_PROTOCOL.md` — human review and final verification.
- `docs/HISTORICAL_GOLD_CASES.md` — HISTORICAL_GOLD rules.
- `docs/COMMAND_CENTER_PRODUCTION.md` — production Command Center architecture.
- `docs/MARIADB_RESEARCH_STORAGE.md` — primary structured research-results persistence.
- `docs/EVIDENCE_STORE.md` — optional S3-compatible durable object-store route.
- `docs/JARVIS_CONTROLLED_DISPATCH.md` — current JARVIS dispatch policy.
- `docs/JARVIS_ORCHESTRATOR_ARCHITECTURE.md` — current supervisory architecture.
- `benchmarks/v4/README.md` — current validation/benchmark methodology.

If two documents conflict, the more specific canonical document above and the executable policy/schema in the repository take precedence.

## Operational/reference documents

Useful runbooks or implementation references, but not the canonical statement of overall system state:

- `docs/JARVIS_ARCHIVE_BROWSER.md`
- `docs/MARIADB_CONNECTIVITY_GATE.md`
- `docs/MARIADB_GATEWAY_DEPLOYMENT.md`
- `docs/MARIADB_MIGRATION_RUNBOOK.md`
- `docs/LIBRARY_AGENT_WRITE_SCOPE.md`
- `docs/EVENT_CONTEXT_POLICY.md`
- `command-center/DEPLOYMENT.md`
- `command-center-v5/README.md`

## Historical snapshots / engineering records

Retained for auditability and chronology. They must **not** be read as current system status:

- `docs/ARCHIVE_CONNECTION_AUDIT_2026-10-12.md`
- `docs/CONNECTOR_VERIFICATION_MATRIX_2026-10-12.md`
- `docs/VENETIAN_CONNECTOR_GATE_2026-10-12.md`
- `docs/VENICE_NETWORK_AND_OFFICIAL_DATA_FALLBACK_2026-10-12.md`
- `docs/research-reliability-repair.md`
- `docs/audits/**`
- Benchmark v1/v3 frozen baselines and older evidence runs.

Historical snapshots are not deleted because they are part of the provenance of how the system evolved.

## Legacy diagnostic component

`docs/JARVIS_LIVE_OBSERVER.md` documents the retained read-only observer adapter. It is useful for diagnostics and regression checks, but it is **not** the current JARVIS operating mode. Current policy is `controlled_dispatch`.

## Experimental UI

`command-center-v5/README.md` describes an experimental visual client. It is not the production-system specification and does not define research semantics.

## Cleanup rule

Do not delete an old audit merely because it is outdated. Instead:
1. keep dated evidence and audits immutable where possible;
2. mark them as historical snapshots;
3. update canonical documents when current architecture changes;
4. avoid duplicating current system status across many files;
5. check executable policy/configuration against documentation during maintenance.
