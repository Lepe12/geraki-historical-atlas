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

The accompanying, not yet published scheduler patch advances at most two explicitly enrolled research runs every
six hours, serially, through the existing semantic reanalysis workflow. Each pass
has bounded query/model budgets. Review/synthesis waits while extraction coverage
is pending. New evidence can require new batches. This is bounded coverage of the
acquired corpus, not exhaustive recall across all archives. The schedule becomes
active only when merged to the default branch; no production execution is claimed.

Research acceptance blocks on deferred passages or unresolved cited-work tasks.
The pure offline production-report evaluator separates technical and public results: public network
failures/502/503 and failed OIDC negative controls block the combined PASS.
These probes do not establish production MariaDB write/readback or historical truth.

Validation: 78 deterministic Python tests passed across continuation, cited-work
acquisition, semantic answers, engine validation, citation search, acquired analysis,
source routes and execution safety. Four workflow YAML files parsed. No real model
inference, archive search, production deployment or historical verification was
performed for this patch. The new regression cases use simulated model/connector
responses and test continuation, source invalidation, byte locators, retry retention,
and rejection of false green results.

Publication boundary: automatic approval review rejected changes to the main
research workflow and to the existing production probe, citing repository-write/
OIDC/secrets publication scope, the existing external credential flow, and the
semantic pipeline's existing ability to send acquired text to a configured LLM. Those
files and the scheduler/reanalysis workflow changes remain an unapplied local
patch pending explicit approval. No workaround or production deployment was used.
The draft PR contains the coverage acceptance guard, pure checkpoint storage and
a pure offline report evaluator. The engine integration remains in the full patch. Production
probe integration and automatic scheduling are not active from this PR alone.
