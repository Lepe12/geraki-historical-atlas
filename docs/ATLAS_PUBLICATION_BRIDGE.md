# VERIFIED Research → Atlas Publication Bridge

## Purpose

The Atlas is a publication consumer, not a research-discovery database. This bridge enforces a one-way, fail-closed path:

`DISCOVERY → REVIEW → VERIFIED → APPROVE_FOR_PUBLICATION → EVENTS / SOURCES / PLACES → Atlas`

Raw, rejected, contradictory, unresolved and merely discovered material stays in Research Discovery and is never published as established fact.

## Mandatory gates

Publication requires all of the following:

1. The candidate exists in `evidence/runs/<run>/<lane>/structured_output/candidate_events.json`.
2. The candidate is explicitly marked `verified=true`.
3. A matching record exists in `verification/final_verifications.json`.
4. That record has `decision=VERIFY` and `verified=true`.
5. A separate human publication approval uses `decision=APPROVE_FOR_PUBLICATION`.
6. The approval is SHA-256 bound to the exact final verification record.
7. Event, source and optional place fields are explicitly supplied by the approver.
8. Coordinates are never generated. If coordinates are supplied, latitude and longitude must both be present and the approver must state `Approximate` or `Verified`.

A successful research workflow, MariaDB import, catalogue hit, OCR match, candidate extraction or HUMAN_REVIEWED state is not sufficient.

## Provenance and idempotency

Every published Airtable row receives:

- `Publication Key`
- `Research Run ID`
- `Publication Approved UTC`

The publication key is derived from run ID, lane, candidate ID and the exact final-verification checksum. Re-running a publication updates the same rows rather than silently creating duplicates.

The current Atlas Airtable base is `appML9NlhzlVMoGjb`; the bridge writes only to the existing `EVENTS`, `SOURCES` and `PLACES` tables.

## Source of truth

MariaDB remains the primary structured research store and GitHub remains the durable evidence/audit store. The publication bridge reads the durable, hash-bound verification evidence because the MariaDB storage adapter deliberately does not promote items to VERIFIED. Publication therefore cannot be caused by storage persistence alone.

## Usage

Copy `publication/APPROVAL_TEMPLATE.json` to `publication/approvals/<name>.json` and fill it only after final verification.

The release workflow is manual:

`Publish VERIFIED Research to Atlas`

Supply the approval-file path. The workflow rebuilds and validates the publication bundle from the current evidence, publishes idempotently to Airtable, then preserves both the approved bundle and the publication audit under `publication/approved/` and `publication/audit/`.

## Safety boundary

The bridge does not:

- geocode places;
- replace coordinates;
- infer missing dates, actors, event types or place mappings;
- publish unverified research;
- treat Airtable publication as scientific verification;
- delete Research Discovery material.
