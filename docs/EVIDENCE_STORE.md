# Durable Evidence Store

The research engine supports any **S3-compatible durable object store**. This keeps the system independent of ChatGPT, GitHub Actions runner disks, and a single storage vendor.

## Required repository secrets
- `PCT_EVIDENCE_ENDPOINT`
- `PCT_EVIDENCE_BUCKET`
- `PCT_EVIDENCE_ACCESS_KEY`
- `PCT_EVIDENCE_SECRET_KEY`
- optional `PCT_EVIDENCE_REGION` (default `auto`)
- optional `PCT_EVIDENCE_PREFIX` (default `evidence`)

Compatible examples include Cloudflare R2, AWS S3 and other S3-compatible services.

## Durable key
`evidence/<research_job_id>/<source_id>/<file>`

Every upload creates an evidence index containing SHA-256, byte count, MIME type, repository/lane provenance, inspection=false and verification=NEEDS_EVIDENCE.

**Hard gate:** storing a file is not inspection, corroboration, or verification.

The uploader intentionally fails closed when storage secrets are absent. GitHub Actions artifacts remain temporary until a durable backend is configured.
