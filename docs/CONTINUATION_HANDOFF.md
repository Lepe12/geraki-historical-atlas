# Automatic continuation handoff

The hourly schedule is a fallback, not the only restart mechanism. After each
bounded scheduler pass, a separate job checks out published main and reads the
checksum-bound latest answer, validation report and active checkpoint queue.
It dispatches `research-continuation.yml` using the existing GitHub Actions token
only after new examined items, or new review/synthesis responses, are durable.
The workflow therefore needs `actions: write`; no new secret or service is used.
The global scheduler concurrency group serializes queued passes.

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
