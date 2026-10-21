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
