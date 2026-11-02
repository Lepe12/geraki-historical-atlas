# Initial semantic reading on GitHub Actions

The first research pass now defaults to up to four GitHub-hosted CPU readers.
`initial_semantic_shards` controls this first pass (1, 2 or 4; default 4).
`semantic_shards` continues to control later continuation rounds, with its
existing default of 1. Evaluation mode, disabled inference and tiny reading
queues keep the single-runner path. This adds no inference provider or hosting.

After durable lane publication, one preparation job ranks the acquired corpus
using the existing small embedding model. It freezes the reading order and
near-duplicate metadata with hashes of current source records, the normalized
request and the existing checkpoint generation. It does not run the inference
model. Every reader validates that plan before applying the same filters and
sentence windows. Round-robin assignment therefore uses identical pending
batch boundaries on every reader, even if neural ranking would differ locally.

Each reader uses the existing engine in shard mode for extraction and claim
review. It performs no final synthesis and cannot publish to main. Three new
batches and a 900-second model-call budget bound each reader; unfinished work
remains explicitly pending. Checkpoint/response files and each reader's report
travel in checksum-verified, path-restricted artifacts. Queue/active pointer
files are not overlaid between readers. Conflicting checkpoint bytes fail closed.

A separate collection job preserves all available work with the existing Git
output publisher and readback before starting the final model. Missing readers
remain explicit in the durable summary. Artifacts are transport, not the sole
archive. The final job uses the pinned engine code, restores the published
corpus and runs the existing merge mode: no new extraction, cached claim reviews
replayed through current validation, then one combined synthesis/final review.
The final parallel review budget is 900 seconds; remaining work is not relabelled
as complete. Source verification and automatic-continuation settings stay intact.

Regression tests use four isolated repository copies and simulated model calls:
all excerpts are assigned once, changed source/plan/configuration is rejected,
transport tampering cannot overwrite the checkpoint, and merge makes no new
extraction or repeat claim-review calls. These verify orchestration and evidence
integrity; they are not a measured historical-model latency benchmark. Actual
wall time still includes source acquisition, runner availability and final review.
