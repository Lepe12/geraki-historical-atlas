# Piratecartography Source Acquisition Contract v1.6

This document defines the handoff between Citation Chase and the IIIF Source Acquisition workflow.

## Trigger condition
Use Source Acquisition when Citation Chase identifies a cited original work whose exact page image has not been inspected and a legal IIIF Presentation manifest is available.

## Request
- manifest: IIIF Presentation v2/v3 manifest URL
- pages: exact printed Arabic page numbers, comma-separated
- source_id: stable citation/source identifier when known

Workflow: `.github/workflows/iiif-source-acquisition.yml`

## Resolver rules
1. Printed pagination is not the scan/canvas ordinal.
2. Only a unique printed-page label match may be acquired automatically.
3. Ambiguous, Roman-numeral, folio, or unnumbered pagination is unresolved; do not guess an offset.
4. A catalogue entry, secondary citation, mirror, OCR snippet, or workflow Success status is not proof that the original was inspected.

## Return package
The workflow returns an artifact containing:
- `printed_<page>.jpg` for each uniquely resolved requested page
- `report.json` with manifest, target pages, canvas IDs, labels, image URLs, byte counts, missing/ambiguous pages, and acquisition status

## Citation Chase acceptance gate
Citation Chase may set `Original Inspected = true` only after the acquired page image itself has been visually inspected and its printed pagination/content confirmed. Historical claims must then be recorded from that page, with uncertainty preserved.

## Validated reference test
Robert Saulger, BSB bsb10447069:
- printed p.305 -> scan/canvas 323
- printed p.310 -> scan/canvas 328
- printed p.314 -> scan/canvas 332
- printed p.317 -> scan/canvas 335

This test demonstrates acquisition and pagination resolution only; it does not establish source independence or corroboration.
