# Piratecartography Historical Research / GERAKI Historical Atlas

This repository is the durable code, evidence and operational specification for the Piratecartography historical-research system and the GERAKI Historical Atlas.

## Current architecture

- **JARVIS** is the supervisory research orchestrator.
- **11 geographic/source-family research lanes**: Greek, travellers, Simancas/Spanish, Venetian, French, British, Dutch, German, Italian states, Ottoman and North African.
- **Specialist agents** add timeline, identity, contradiction, source-genealogy and related research functions.
- **Research Discovery** retains weak, unresolved, contradictory and off-target leads instead of silently deleting them.
- **Scientific Claims** remain separately gated by exact source location, original inspection, extraction, source genealogy, corroboration and human review.
- **MariaDB** is the primary structured research-results store; GitHub preserves durable run evidence and audit state. Airtable remains a legacy/Atlas consumer.
- **Command Center** consumes real JARVIS run state. UI state never promotes historical claims to VERIFIED.
- **Historical Benchmark v4** is the current scientific-validation framework.

## Canonical documentation

Start with:

1. `docs/CANONICAL_DOCUMENTATION.md`
2. `docs/SYSTEM_SPEC.md`
3. `docs/general-research-doctrine.md`
4. `docs/HUMAN_REVIEW_VERIFICATION_PROTOCOL.md`
5. `docs/COMMAND_CENTER_PRODUCTION.md`
6. `docs/MARIADB_RESEARCH_STORAGE.md`
7. `benchmarks/v4/README.md`

## Scientific boundary

A successful connector, workflow, download, OCR hit, catalogue record or AI-generated candidate is **not** historical verification. Only the explicit evidence and human-review gates may produce VERIFIED research output.

## GERAKI Historical Atlas

The Atlas remains a separate publication/visualization consumer. Its data-integrity rules still apply:

- no automatic geocoding;
- no silent coordinate replacement;
- missing information stays unavailable;
- schematic route lines are not asserted historical tracks;
- planned, intelligence/network and reconstructed routes must remain visually distinguishable.

The research engine must not publish raw discovery material into the Atlas as established fact.
