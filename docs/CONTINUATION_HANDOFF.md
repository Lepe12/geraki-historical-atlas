# Automatic continuation handoff

The hourly schedule is a fallback, not the only restart mechanism. After each
bounded scheduler pass, a separate job checks out published main and reads the
checksum-bound latest answer, validation report and active checkpoint queue.
It dispatches `research-continuation.yml` using the existing GitHub Actions token
only after new examined items, or new review/synthesis responses, are durable.
The workflow therefore needs `actions: write`; no new secret or service is used.
The coordinator concurrency group serializes queued passes. Before selecting
work, the coordinator reads active Actions jobs and defers busy parent corpora,
including jobs started by the previous scheduler. Older unstarted coordinator
requests on main are coalesced by cancellation; active analyses are never
cancelled. Completion of a directly launched semantic workflow also wakes the
coordinator. These controls prevent a different corpus from holding the legacy
global lock over a corpus whose checkpoint is already ready to continue.

An expected INCOMPLETE result may hand off, but remains INCOMPLETE. A missing
publication, stale pointer, invalid checksum, failed model call,
lost completed item or repeated sample cannot start an immediate
self-loop. The handoff log records the exact reason. A completed semantic queue
also stops handoff. Citation-only or manual verification blockers remain visible;
this mechanism does not turn them into historical acceptance.

A code/configuration change may create a new checkpoint generation. Handoff
requires its own completed work and verifies that the previous generation and
its completed items remain durable. The log reports archived and current counts
separately; it does not count archived work as reused by the new algorithm.

Validation: `python3 -m unittest discover -s tools -p test_research_continuation_handoff.py`.
The tests cover durable progress, repeated work, stale or corrupt publication,
lost items, model failure, review progress, duplicate IDs and path traversal.
Live automatic dispatch and checkpoint reuse require actual Actions receipts;
installation and these tests alone do not establish that production succeeded.

## Observed deployment check, 2026-10-21 10:27 UTC

- Repair revision: `46b57474abaff976a92c67dc01d94c125a3efd49`.
- [Coordinator run 39584433530](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39584433530): 17 handoff tests passed; active parent `39477358672` was deferred, unstarted superseded coordinator `39582269312` was cancelled, and parent `39377319867` actually started in job `119170429825`. The running legacy analysis was preserved.
- [Safety run 39584433535](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39584433535) passed, including the new regression cases.
- The previously completed parent job `119150396300` in run `39578430849` published 457 files with readback at commit `5398174403cb6340fe197ecf69d9c870507da956`. It was INCOMPLETE, not a crash: 12/3,757 examined items, 3,745 deferred, 9 completed extraction calls, 0 reused batch receipts, 0 VERIFIED claims. Compared with the first execution, 5 examined evidence IDs overlap and 7 are new; algorithm changes created a different cache generation. This does not establish stable-generation reuse.
- At this checkpoint, the repaired pass is running. Its completion-triggered automatic dispatch and the following pass's checkpoint reuse have **not yet been observed**. The whole original research problem is therefore not declared resolved.

## Observed automatic handoff and stable-generation reuse — 2026-10-21 11:31 UTC

The initial functional continuation check now has two consecutive published
parent executions over more than one document. This establishes the observed
automatic handoff and checkpoint reuse for parent `39377319867`; full corpus
coverage and historical verification remain incomplete.

| Parent analysis execution | Trigger | Examined excerpts | Inventory | Batch caches | Response caches |
| --- | --- | ---: | ---: | ---: | ---: |
| [39584433530](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39584433530) | Repair push | 4 across 4 document-text hashes | 3,759 | 3 | 7 |
| [39588433287](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39588433287) | Automatic workflow_dispatch by github-actions[bot] | 8 across 8 document-text hashes | 3,765 | 6 | 14 |

- Handoff job `119182470715` passed its checksum/progress guard and dispatched
  the next run at **10:58:00 UTC**. Its actual log recorded
  `CHECKPOINT_GENERATION_MIGRATED:archived=12:current=4`. The older generation
  remains archived and is not counted as reuse under the new algorithm.
- Both executions use semantic module SHA-256
  `1943a90f4a29aadd0c5badac7811959ae19d627a164118d6ca82dd5ed1544bda`,
  the same question and active generation
  `492bd2c056987958f6ddad70275becbf5d9007dc5532d950c040a32c83c1651d`.
- The following execution actually replayed **3 extraction batch receipts and
  2 model response receipts**. All five receipt checksums were independently
  recomputed against the committed objects. All 3 previous batch objects and
  all 7 previous response objects retained their original Git blob identities.
- All 4 previously examined evidence IDs are still examined; **4 new IDs**
  were examined, **0 prior IDs were lost**, and the inventory has **0 duplicate
  IDs**. Six new inventory excerpts were added, so pending coverage rose from
  3,755 to **3,757** despite genuine examination progress.
- Both saved answer/validation pairs were checked against their published
  latest pointers, including the first pointer at immutable commit
  `2adce4a48e22c98cd8c32c3dbbb178a0a47e61cd`.
- The second publication succeeded with readback at
  [7e0973e574a989c2d537f3902f3ca5e131596ffa](https://github.com/Lepe12/geraki-historical-atlas/commit/7e0973e574a989c2d537f3902f3ca5e131596ffa):
  **470 files**, **2 publication attempts**. The parent job's exit 1 accompanies
  an expected INCOMPLETE validation result; there was no observed crash,
  timeout or publication failure. At this check the outer workflow is still
  processing the other parent corpus.
- Three excerpts from three different documents in the second answer were
  independently checked against their committed full-text bytes: **3/3
  SHA-256 matches, 3/3 exact substring matches, 3/3 scan-index matches** using
  actual form-feed page separators. The zero-based scan indexes are **0, 337
  and 2**. Printed pages remain null. No visual original inspection is claimed.
- The stored Command Center index for this parent is **PARTIAL**, generated
  **11:26:33 UTC**, rather than overall research acceptance. Browser rendering
  was not exercised in this check.
- The second validation report remains **INCOMPLETE**, with
  `RESEARCH_COVERAGE_PENDING` and `CITATION_FOLLOWUP_PENDING`.
  Its 5 model proposals, 4 automatically review-supported claims and 4 cited
  answer claims do not constitute historical verification: **VERIFIED = 0**.

The latest stored [production smoke report](../evidence/production_smoke/39550648189/report.json)
was checked at **05:38 UTC**: health HTTP 200 at all three configured origins,
signed OIDC agent-search HTTP 200, unsigned evidence/upload/review HTTP 401,
and the deliberately invalid OIDC event negative control HTTP 400 with
`invalid_event`. These are existing successful request receipts; no new
production/OIDC probe was run during this continuation check.

[Current validation](../evidence/runs/39377319867/semantic_reanalysis_39588433287/research_answer/validation_report.json)
and [active queue](../evidence/runs/39377319867/research_continuation/492bd2c056987958f6ddad70275becbf5d9007dc5532d950c040a32c83c1651d/queue.json)
remain the quantitative evidence. Automatic restart and an advancing reused
checkpoint have been demonstrated. Complete examination of the acquired corpus,
resolution of all cited works, original inspection, source genealogy,
corroboration and historical VERIFIED documentation have not been established.
