# Question coverage and batched research publication

The normal Kimolos research run `41630296108` took 53:08, but its three accepted
paragraphs did not answer the requested merchant-anchorage and drinking-water
question. Quotation fidelity, reading completion and geographic relevance did
not establish question coverage. Its original outputs remain unchanged.

## Behavior after this change

* Request-derived multilingual anchorage, freshwater, piracy and captivity
  facets lead the repository, library and Internet Archive full-text query
  queues. Explicit negative instructions such as “Do not infer piracy” do not
  create a positive piracy requirement. Broad searches and all discovered leads
  remain available. No place or presumed actor is hard-coded into the engine.
* The excerpt ranker boosts passages addressing those facets. Supported claims
  addressing them receive review priority. General history is retained but is
  held out of the answer when it addresses none of the requested facets.
* The existing final reviewer assesses each requested facet separately in the
  SAME model call as quotation fidelity. A decision can be ADDRESSED,
  NOT_ADDRESSED or UNCERTAIN and must explain its evidence or gap. It is bound
  to the exact request, cited claim statements/quotations and answer sections.
* The independent acceptance report recomputes lexical coverage and reads the
  actual final-review response or source-bound cached response, checking its
  receipt checksum and binding. A stored green coverage label is insufficient.
  Missing, uncertain or negative decisions keep acceptance INCOMPLETE. Separate
  primary-source metadata is required when contemporary/archival support was
  requested; the model's PRIMARY_SOURCE label alone does not qualify.
* The answer renders explicit missing requirements in Greek. General paragraphs
  moved out of the answer remain in `question_scope_context_sections`; claims,
  quotations, source occurrences and original research files are preserved.

The controlled vocabulary is deliberately bounded. Other subjects report
`NOT_ASSESSED`; this change does not claim universal question understanding.
Lexical overlap is only a negative guard. A positive model assessment remains
provisional and cannot establish original inspection, source independence or
historical verification. Edition dates are never assigned as event dates.

## Publication

Durable checkpoint commits, concurrent-writer protections, allowed output paths,
regular-file-only checks, retry logic and per-file readback remain in place.
The publisher now obtains changed blob identities from one NUL-delimited raw
diff, updates the separate index in one batch, and reads the published tree
once to compare every expected blob identity. This also handles tabs and Greek
characters in filenames safely.

For 300 files, the previous publisher needed 300 `ls-tree`, 300 `update-index`
and 300 file-specific `rev-parse` operations. The replacement uses one batch
index update and one tree readback, plus the existing commit/fetch/push operations.
This is a reduction in Git operations, NOT a measured full-research speedup.
No claim is made that the earlier 16:03 publication time has disappeared.

## Verification

`tools/fixtures/kimolos_question_scope_41630296108.json` is a provenance-labelled
projection of the real run's accepted sections and cited claims, including the
original answer SHA-256. It is a regression fixture, not new source research.
It now produces missing requirements `anchorage` and `freshwater`; its three
general paragraphs are retained as context.

Tests also cover a synthetic positive engine flow with exactly one extraction,
one claim review and one final review; fabricated coverage labels, changed
receipt bytes, secondary sources presented as primary, and one facet standing
in for another. Actual isolated Git remotes test 300-file publication, concurrent
writers, filenames containing tabs/Greek characters, code/symlink rejection and
missing readback detection. Existing shard, continuation and semantic tests run
alongside these in the Historical Evidence workflow.
