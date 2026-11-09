# N7 is maintained in independent-ai-bot

The authoritative N7 code is in `Lepe12/independent-ai-bot`.
`tools/n7` and `tools/library` in this repository are a generated distribution,
retained at their existing paths for deployment/research compatibility.
**Do not edit those files here.** Make a single change in the canonical repository,
then run **Sync canonical N7 sources**. A daily check can also propose a generated
update. The sync opens a PR; it never writes directly to main or the live service.

`n7-distribution.json` identifies the exact source commit and every file hash.
**N7 canonical distribution integrity** compares those bytes to the private
canonical checkout, so a second hand-edited implementation fails verification.
For local integrity only: `python3 tools/check_n7_distribution.py`.

The existing `PCT_GITHUB_DISPATCH_TOKEN` private cross-repository connection is
used for checkout and synchronization PRs. If it cannot read canonical contents
or write a PR in this repository, synchronization fails visibly; it must not
silently fall back to an unverified copy. No credential is stored in the manifest.

Historical map/research orchestration and production credentials remain here.
Existing deployment preflight, approvals, backups, hash verification and rollback
remain in force. Refer to canonical `docs/SOURCE-OF-TRUTH.md` for the remaining
live-baseline/clean-install gate; this consolidation alone is not a production
deployment or a claim that the starter root server is the full live application.
