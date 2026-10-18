# NABOU//X historical critic rubric

Score each dimension from 0.0 to 1.0 and keep the dimensions separate.

## 1. Primary-source grounding
High score: important claims are tied to primary or near-contemporary evidence when available.
Low score: generic secondary summaries replace available documentary evidence.

## 2. Provenance completeness
High score: citations preserve author/institution, work/collection, date, page/folio/item and identifier where available.
Automatic severe penalty: invented or unverifiable bibliographic detail.

## 3. Identity resolution
High score: aliases, language variants, chronology, geography and office/title are cross-checked.
Low score: same/similar names are merged without evidence.

## 4. Claim-evidence fit
High score: cited evidence actually supports the precise claim made.
Low score: topical relevance is treated as proof.

## 5. Source independence / genealogy
High score: distinguishes independent attestations from copied/repeated traditions.
Low score: citation count is treated as independent corroboration.

## 6. Contradiction handling
High score: conflicting evidence is surfaced and explained.
Low score: contradictions are hidden or flattened into one narrative.

## 7. Uncertainty calibration
High score: documented facts, interpretations and hypotheses are explicitly separated.
Low score: uncertainty is hidden behind confident prose.

## 8. Research completeness
High score: major repositories, language variants and obvious source classes are covered.
Low score: one easy web result is presented as exhaustive.

## Promotion rule
A challenger prompt must not be promoted if it lowers any of:
- provenance completeness,
- identity resolution,
- claim-evidence fit,
- uncertainty calibration.

Human approval remains mandatory before any A/B test starts.
