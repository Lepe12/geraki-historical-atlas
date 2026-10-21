# Research continuation and honest acceptance

The engine previously selected at most three extraction batches on every run.
This change checkpoints source-bound extractor responses and advances the next
three unfinished batches. Reused proposals pass current validators and undergo
new claim reviews before synthesis. Failed responses stay pending. Long excerpts
are split into overlapping spans with exact source offsets; unfit metadata stays
explicitly blocked. Original passage counts and derived segment counts differ.
A source, question, code, or model-routing change invalidates reuse. Queue and
response writes are atomic. Original lane artifacts are not rewritten.

The existing cited-work continuation now retains deferred work, retries unsuccessful
queries up to three times, preserves attempt history, and keeps unresolved citations
visible. Continuation acquisition runs in dedicated lane copies. Existing title
matching, catalogue-vs-document checks and source-reading logic remain in force.
Acquisition/title matching does not prove edition identity or source independence.

The scheduler advances at most two explicitly enrolled research runs every
hour, serially, through the existing semantic reanalysis workflow. Each pass
has bounded query/model budgets. Review/synthesis waits while extraction coverage
is pending. New evidence can require new batches. This is bounded coverage of the
acquired corpus, not exhaustive recall across all archives. The schedule becomes
active only when merged to the default branch; no production execution is claimed.

Research acceptance blocks on deferred passages or unresolved cited-work tasks.
The pure offline production-report evaluator separates technical and public results: public network
failures/502/503 and failed OIDC negative controls block the combined PASS.
These probes do not establish production MariaDB write/readback or historical truth.

Validation: 79 deterministic Python tests passed across continuation, cited-work
acquisition, semantic answers, engine validation, citation search, acquired analysis,
source routes and execution safety. Four workflow YAML files parsed. These deterministic tests perform no real model inference, archive search,
production deployment or historical verification. The new regression cases use simulated model/connector
responses and test continuation, source invalidation, byte locators, retry retention,
and rejection of false green results.

Approval and activation: the user explicitly approved applying the full patch,
merging into main, and enabling the existing workflows with the local model and
existing GitHub OIDC authentication to pct-live.piratecartography.com on21October.
Earlier automatic-review blocks are superseded by that explicit approval.
The scheduler enrolls existing run39377319867 through a separate request marker;
it does not treat this continuation as a new blind-discovery benchmark.
Continuation uses48new model calls per execution, checkpoints completed
batches, and records incomplete coverage without claiming a complete answer.
Live execution results must be inspected separately before claiming success.

The real stored39377319867 corpus was read without inference:3720eligible
original excerpts,3738segments after exact-offset splitting,1119batches, and
zero oversized leftovers under the6500-character evidence budget. These counts
reflect the current collector and differ from the older stored sampling report.
Review/synthesis responses also checkpoint across bounded executions so a large
corpus cannot endlessly restart its final review. Reanalysis updates a checksum-
bound latest pointer consumed by the existing Command Center snapshot builder.
