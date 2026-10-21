# Reading priority and claim-level evidence

The next semantic analysis reads substantive target-period passages before weakly related material from a different document. Previously document diversity was applied after only two coarse relevance fields, allowing an ancient Roman piracy discussion and bibliography to precede useful passages from a document already sampled.

`tools/research_priority.py` ranks thematic evidence by passage-level place, period coherence, event/use vocabulary and genre. Publication dates do not become event dates. Diversity applies within a relevance tier. Bibliography, catalogue entries, short fragments, negative statements and conjectures remain in the inventory. Primary-source metadata is only a reading-order hint, never proof of authenticity or independence. The answer records the policy and selection reasons in `selection_priority`.

## Actual corpus comparison

The retained acquisition snapshot `evidence/runs/39377319867/semantic_reanalysis_39381959769/derived_sources` was processed before and after the change with the same collection rules. This snapshot is older than the current live inventory; its count must not be substituted for the live queue count.

- 3,720 records before and after; 0 lost IDs, 0 new IDs, 0 duplicate IDs; every evidence record, text and occurrence locator unchanged.
- `e-5c0b61e1effb11bf5e88`, discussing a port guide and Joseph Roux (1764): rank 35 → 2.
- `e-bd82168a9bd58aea9d3c`, discussing corsair residence and Ottoman fleet avoidance: rank 34 → 3.
- `e-83b706fec0dec672185d`, a mixed-period paragraph beginning with Rome and the Gabinian Law (67 BCE): rank 2 → 77.

The machine-readable comparison, excerpt hashes and existing source locators are in [audits/research-priority-comparison.json](audits/research-priority-comparison.json). This is an offline comparison on real stored evidence, not an independent accuracy benchmark or a new live inference result. Broad context can still rank highly; the policy is heuristic and exposes its reasons for inspection.

## Claim support is separate from exhaustive coverage

`claim_evidence_assessment` reports whether the existing semantic reviewer supports a quotation, rejects it, records an actual contradiction, or supports a source-attributed hypothesis. A supported quotation does not require every unrelated corpus excerpt to be read, and does not establish historical truth. Document counts do not establish source independence. The rendered answer states the outstanding historical checks: original inspection, source genealogy, independent corroboration, contradiction search and human review. This annotation does not substitute for canonical review receipts or change VERIFIED gates.

No coverage limit is relaxed and no pending citation is marked resolved by ranking. Citation identity still requires a separate check against the intended work; acquired text or title overlap alone is insufficient. Complete citation resolution and full corpus coverage are not claimed by this change.

## Continuation and validation

The changed semantic module deliberately creates a new conservative checkpoint generation under the existing migration rules. Earlier generations remain archived; this change does not claim their extraction batches will be reused across that migration. Within a generation the existing durable continuation is retained. The next scheduled/automatic run loads the new policy from main; offline ranking tests do not prove that run has finished.

Validation: 63 tests passed across reading priority, semantic answers and durable continuation. The existing Research execution safety workflow also includes the new priority tests. The historical verification status remains unchanged.
