# Piratecartography Evidence Store (GitHub pilot)

This directory is the first durable evidence-store pilot.

Rules:
- Store indexes, OCR, metadata, manifests, checksums, research reports, and selected critical page images/PDF extracts when repository size permits.
- Do not treat GitHub Actions artifacts as the sole durable copy.
- Acquisition or persistence never means historical verification.
- Every evidence item must retain research job ID, source ID, repository/lane provenance, original page/scan mapping when known, SHA-256 when generated, inspection status, and verification status.
- Large collections of scans/PDFs should later move to object storage while their indexes/checksums remain versioned here.

Layout:
evidence/<research_job_id>/<source_id>/{manifest,ocr,pages,reports}/
