# Research reliability repair

The discovery layer now ranks source metadata against request identity, while retaining ambiguous and excluded leads. Publication dates affect priority only; they never establish event dates. Generic place controls cover both Milos and Naxos; no source identifiers or presumed events are injected. Optional `target_context` accepts `type` and explicit `region_terms`; these are search constraints, not evidence.

The ten-lane workflow invokes the registered specialist workflow and feeds its records into the travellers lane. Archive-specific, general and specialist queries share bounded query budgets. Missing specialist artifacts and access errors remain explicit. A single regional recovery wave runs when no event candidate survives and regional context is supplied.

Acquisition checkpoints after each object. Defaults: up to three batches of 100 eligible candidates, bounded by 360 seconds. Ambiguous records and deferred work remain in the saved backlog. Resume by restoring the durable lane workspace, including acquired files and the request JSON, setting `PCT_REQUEST_FILE`, and rerunning `python3 tools/acquire_library_candidate.py`. Completed objects are skipped; request mismatch fails closed. This is resumability, not an unlimited automatic cross-run scheduler.

## Human review v2

ACCEPT requires literal boolean `original_inspected: true`, a finite numeric quality score from 0 to 1, reviewer and source text, a locator with source ID/URL plus printed page/folio and scan index/leaf or canvas ID. `evidence_examined` is a nonempty array of `{path, sha256}` objects for files under the review workspace. `candidate_evidence_sha256` must equal `review_validation.candidate_digest(candidate)`. These integrity checks cannot prove that a human actually inspected an image.

VERIFY revalidates the review and files. It requires `claim_matrix_sha256` equal to `review_validation.digest(claim)`, exact claim text/scope agreement, structured genealogy and corroboration assessments (`assessment`, `evidence_refs`), valid timezone-aware assessment timestamp, enumerated contradiction status, and lists of limitations, uncertainties and falsification targets. Old malformed review records require a new explicit review; they are not silently converted.

## Metrics

Evaluator v3 uses contextual prose for event dates and excludes URL/filename identity matches. Candidate precision and unsupported-claim rate remain null until independently labelled. Case detection is separately named. Old benchmark scores are preserved as legacy data and excluded from new aggregation pending reevaluation. Successful jobs never imply VERIFIED historical findings.

## Validation

`python3 tools/scientific_benchmark.py` includes six integration/regression tests (with multiple adversarial cases) covering place collisions, second-island generality, resumable queues, invalid review rejection, valid human-gate flow and stale claims/files, URL-date leakage, and specialist ingestion. `python3 tools/adversarial_scientific_benchmark.py` retains existing evidence-state controls. All use synthetic fixtures; they are not historical ground truth.
