# Research execution speed

The initial research workflow transfers lane evidence to one publisher per run.
Workers use a shallow, filtered checkout that excludes unrelated run evidence,
old specialist runs and backups. Consumers include the current run and wait for
its lane publisher. All research/verification gates remain unchanged.

## Evidence durability

Each worker first runs the existing `preserve_run_evidence.py`, including its
large-file chunking and provenance index. It packs the preserved lane directory
with a SHA-256 manifest. GitHub artifacts are transport, never the only archive.
The publisher checks the archive checksum, run/lane binding, exact file set,
regular-file paths, sizes and individual hashes before recovering any bundle.
It commits all available lanes through `publish_research_outputs.py`, whose
existing Git object readback verifies the durable publication. Missing lane
transports are reported after available evidence is preserved; incomplete or
failed research is never promoted to success or VERIFIED.

One publisher per run removes the eleven simultaneous lane pushes. Separate
runs and the existing aggregate/synthesis publishers still use the existing
optimistic publication/retry mechanism. This is not a global queue that could
silently cancel pending research runs.

## Reuse

The engine already caches extraction groups and stage responses in its bound
research continuation checkpoint. Those bindings and validation gates are
unchanged. A response for another request, source version, model or stage is
not treated as interchangeable. Python package downloads/wheels now have a
separate OS/architecture/Python/dependency-bound pip cache. Official model
revision and checksum verification still runs after restoring model files.

## Measurements

`research-speed-check.yml` compares the previous full-history checkout with the
current-run sparse checkout on GitHub-hosted runners, and records elapsed time
and materialized working-tree size in job summaries. Times are observations,
not service guarantees; runners and network conditions differ. Runner-minutes
summed across parallel jobs must not be described as elapsed user wait time.

The optimized profile also runs actual local-Git publication tests: evidence is
packed, recovered into a shallow sparse clone, committed, pushed to a temporary
bare remote and read back by Git blob identity while preserving unrelated runs.
It tests damaged archives, changed files, traversal/symlinks, duplicate lanes,
missing lanes, byte preservation and idempotency.

CPU model inference remains a separate cost. This change does not switch models,
remove claim review, enable paid services or promise a fixed response latency.
