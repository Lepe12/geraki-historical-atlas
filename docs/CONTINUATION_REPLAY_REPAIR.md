# Immutable replay inputs and isolated continuation holds

Observed failure: coordinator [39599701398](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39599701398) published both corpora, then held the entire chain. Parent `39377319867` had legitimately migrated to the new reading-priority generation with 6 examined passages and 13 archived from the preceding generation. Parent `39477358672` failed `CONTINUATION_RECEIPTS_INVALID`. The handoff decision for the healthy parent was true, but the aggregate all-parents guard prevented its restart.

## Reproduced cause

For parent `39477358672`, batch `f685f7c16d7f45be18f17217370162d325f948976f41b1f117a34662359f9027` was replayed, then its model proposal failed current extraction validation. The model repair overwrote that batch's current payload. The answer still referred to the pre-repair payload hash `64c9740b75b531933c098393194dcc0f5b9b5aec7a7e3cc1615423f98a08834d`. The stored batch had a valid self-checksum, but no longer matched the answer's replay receipt. The other two replayed batches and replayed reviewer response matched. This was a provenance bug, not a failed download or permission problem.

## Repair

`Continuation.receipt()` now writes a source-and-payload-addressed immutable replay snapshot before a repair can change the current batch. The semantic answer cites that snapshot, while the current extraction cache can retain the repaired proposal. Validation remains strict. The handoff additionally checks the immutable snapshots' source binding, filename and payload checksum. Existing failed audit records are not rewritten into passes.

Mixed handoff decisions now restart only the progressing corpora. Failed parent IDs are passed in the existing coordinator's declared `excluded_run_ids` input and carried through that automatic chain. The failed checkpoint step still fails and logs its reason; it does not become green because another parent progressed. The dispatch step uses `always()` with an explicit positive restart output, so a failed parent cannot freeze an independently healthy one. Later scheduled/manual runs can retry held parents after repair. All-failed and repeated-sample cases do not self-restart.

Changing the semantic implementation creates one conservative cache generation under the existing rules. Previous generations remain archived; no reuse across that migration is claimed. Following passes within the new generation must demonstrate reuse and advancement.

Validation: 106 local tests passed, including an integration reproduction of cached-proposal repair, snapshot corruption rejection, mixed healthy/failed parents and inherited holds. The existing production smoke [39599701354](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39599701354) independently passed public health checks on three origins, signed agent-search HTTP 200, three unsigned endpoint HTTP 401 controls and the signed invalid-event HTTP 400 control. These checks establish operation and authorization, not historical VERIFIED evidence.
