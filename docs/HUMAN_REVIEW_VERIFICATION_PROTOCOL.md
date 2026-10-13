# Human Review and Final Verification Protocol

## Principle

Technical workflow success is not historical verification.

A machine-generated candidate may advance only through explicit evidence states and human decisions.

## Review sequence

1. DISCOVERED
2. LOCATED
3. ACQUIRED
4. ORIGINAL_INSPECTED
5. EXTRACTED
6. CORROBORATED
7. HUMAN_REVIEWED
8. VERIFIED

The operational evidence state list remains seven machine/evidence stages; HUMAN_REVIEWED is an oversight status layered before final VERIFIED.

## Human review

Use `tools/apply_human_review.py` with an explicit review JSON.

An ACCEPT review requires:

- candidate_id
- reviewer
- evidence_examined
- original_inspected = true
- exact_locator (page / folio / image / archival unit)
- source_says
- source_quality_score
- decision = ACCEPT

An accepted human review marks the candidate:

- HUMAN_REVIEWED
- verification_eligible = true
- verified = false

It does **not** produce VERIFIED status.

## Final verification

Use `tools/finalize_verification.py` with a separate verification JSON.

VERIFY requires:

- prior ACCEPT human review
- verification_eligible = true
- original inspection
- exact locator
- extracted statement of what the source says
- explicit claim_text
- explicit claim_scope
- source_genealogy_assessment
- corroboration_assessment
- recorded limitations
- named verifier

Only this explicit gate may set:

`verified = true`

## Source genealogy rule

Repository diversity, multiple editions, translations, quotations, or repeated later narratives do not establish independent testimony.

`SOURCE_GENEALOGY.json` is produced cross-lane. Exact shared identifiers or canonical URLs are automatically marked NOT_INDEPENDENT. Similar title/creator records are review leads only and remain independence-unknown.

## Negative rule

Absence of a finding is not evidence of absence unless repository coverage, search scope, access blockers, and limitations are explicitly documented.
