> **ENGINEERING HISTORY / RETAINED AUDIT RECORD.** This file records earlier reliability repair work and observed runs. It is not the current system specification. See `docs/SYSTEM_SPEC.md`, `docs/general-research-doctrine.md` and `benchmarks/v4/README.md`.

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

`python3 tools/scientific_benchmark.py` includes eight integration/regression tests (with multiple adversarial cases) covering place collisions, second-island generality, resumable queues, invalid review rejection, valid human-gate flow and stale claims/files, URL-date leakage, and specialist ingestion. `python3 tools/adversarial_scientific_benchmark.py` retains existing evidence-state controls. All use synthetic fixtures; they are not historical ground truth.

Connector adaptation also accepts diagnostic-prefixed native JSON, preserves French inventory identifiers/call numbers, and distinguishes process failures from keywords occurring in successfully returned source text. Partially completed specialist artifacts can be ingested.

## Observed end-to-end outcome (2026-10-14)

Canonical full run: https://github.com/Lepe12/geraki-historical-atlas/actions/runs/38487321987
Library run: https://github.com/Lepe12/geraki-historical-atlas/actions/runs/38487321899
Engine revision under that live test: `31a556fae4688ef11c11b99310b225878dada87c`.
All ten lanes and six specialist jobs completed; escalation was skipped. Successful completion does not imply complete archive coverage.

Across lanes: 1,891 repository candidates, 349 acquisition records, 216 acquired objects (counts include cross-lane duplicates), zero accepted event candidates and zero VERIFIED events. The original baseline run 38461577591 had 1,522 candidates, 632 acquisition attempts and 33 acquired objects. These counts do not measure historical precision.

Travellers: 206 acquisition records, 128 acquired objects, 158 deferred, 452 held for review, 816 total leads. Regional recovery actually ran. Six specialists made 126 connector searches and added zero records; 82 blocker entries were recorded (repeated attempts, not 82 distinct archives). PARES returned 502/503, Moreveneto lacked API confirmation, and the French finding-aid search is not full catalogue coverage.

The acquired set includes Description exacte des isles de l'Archipel (1703), Naukeurige beschryving (1688), and editions of Tournefort. An OCR context in Tournefort mentions a corsair of Provence at Milo, but lacks a locally resolved event date and original-page inspection. It remains EVENT_DATE_UNRESOLVED, not an established event for 1660–1680. The raw queue is preserved at evidence/runs/38487321987/travellers/event_first_hits/event_hits.json.

### Post-run regression repair

Inspection exposed false retrieval priority: the regex `pirat` matched inside `respiratory`, and a place/name match plus generic historical wording admitted personal names and unrelated disciplines. The follow-up adds word-start boundaries, requires both geographic and historical context for place acquisition priority, holds explicit medical/modern-intelligence topic collisions, and places near-period editions ahead of modern contextual material. Ambiguous records remain recoverable.

Replaying all 816 preserved records with this follow-up yields 223 PRIORITY, 591 REVIEW_REQUIRED and 2 EXCLUDE_FROM_ACQUISITION. This is a triage distribution, not measured precision. All observed regression examples (medical paper, CIA title, congressional personal name, ship named Milo, butterfly article) lose automatic priority. Eight new regression/integration tests plus eight existing context tests pass; existing adversarial controls also pass. Remote 5xx errors are classified from the final exception line rather than a `timeout=` string in the traceback.

This latest filter correction is validated by replay of the completed live dataset and offline tests; a further full network run was not performed for that follow-up. No human inspection, independent corroboration, or live MariaDB import read-back is claimed. Acquisition supports bounded resumable batches, not an unlimited autonomous cross-run scheduler. Ranking and chronological extraction remain heuristic and require further labelled evaluation.
