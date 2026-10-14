# Human Review and Final Verification Protocol

## Principle

Technical workflow success is not historical verification. Discovery must remain visible even when it cannot yet support a claim.

## Canonical evidence progression

`DISCOVERED -> LOCATED -> ACQUIRED -> EXACT_PAGE_MAPPED -> ORIGINAL_INSPECTED -> EXTRACTED -> GENEALOGY_CHECKED -> CORROBORATED`

Human oversight is then layered on top:

`HUMAN_REVIEWED -> VERIFIED`

A record may remain unresolved at any earlier stage without being deleted from Research Discovery.

## Human review

Use `tools/apply_human_review.py` with an explicit review JSON.

An ACCEPT review requires, at minimum:

- candidate_id;
- named reviewer;
- evidence examined with hashes;
- `original_inspected = true`;
- exact source locator (archive/source identifier plus page/folio/leaf/canvas as applicable);
- controlled statement of what the source says;
- source-quality assessment;
- `decision = ACCEPT`;
- binding to the current candidate evidence checksum.

An accepted review makes the candidate review-eligible. It does **not** make it VERIFIED.

## Final verification

Use `tools/finalize_verification.py` with a separate verification record.

VERIFY requires the accepted review plus:

- exact claim text and scope;
- binding to the current claim-matrix checksum;
- source-genealogy assessment;
- corroboration assessment;
- contradiction-search status;
- recorded uncertainties, limitations and falsification targets;
- named verifier;
- revalidation of inspected evidence.

Only this explicit gate may set `verified = true`.

## Source genealogy

Different repositories, editions, translations or later retellings are not automatically independent sources. Shared identifiers/canonical sources are dependent by default; uncertain relationships remain unresolved until assessed.

## Negative findings

Absence of a finding is not evidence of absence unless search scope, repository coverage, access blockers and limitations are documented.

## Research Discovery vs Scientific Claims

A low-confidence, contradictory, rejected-for-acquisition or unresolved lead remains available in Research Discovery. Scientific verification controls claim strength, not whether the researcher is allowed to see the lead.
