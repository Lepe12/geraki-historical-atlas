# NABOU research engine: actual failures and current correction, 20 October 2026

The four fresh cases completed. **None passed research acceptance.** Successful
unit tests or a green workflow do not reverse the actual research reports.
The machine-readable baseline and issue ledger are in
`evidence/integration_validation/2026-10-20/root-cause-ledger.json`.

| Case | Acquired document/OCR URLs | Model proposals | Accepted answer paragraphs | Final result |
|---|---:|---:|---:|---|
| Lantzas | 7 | 2 | 0 | Latin nobles were retrieved; target identity remained unresolved; final review failed |
| Kapsis | 14 | 0 | 0 | Wrong extraction shape and passage selection; an attempted repair still failed |
| Milos 1660–1680 | 11 | 2 | 0 | Final Greek answer invented details and assigned the question period to undated text |
| Eastern Mediterranean toponyms | 66 | 2 | 0 | A conjecture and damaged column text were not faithfully synthesized |

These are counts of acquired URLs and proposed model claims, not independent
sources or verified facts. The coordinator report is
[evidence/validation_cases/39304821565/report.json](../../evidence/validation_cases/39304821565/report.json).

The acquisition, representation, selection and synthesis failures are distinct:

- The thematic `place_match` crash was reproduced and fixed; the actual retry
  completed with nine PDFs, two OCR images, one candidate and 256 unresolved
  passages. A subsequent real-byte verification replay created a claim/evidence
  row while retaining zero historical verification.
- Existing two-column extraction joined unrelated sentences. New reanalysis now
  derives text in reading order from each existing PDF, records both hashes and
  actual page boundaries, and preserves original files. This is reanalysis of
  acquired material, not a new blind search.
- Document diversity had displaced complete in-scope Kapsis passages with
  unknown-date modern name lists. Temporal relevance now takes precedence.
- Prompt-only JSON requests did not prevent the actual model from returning
  actor objects instead of literal strings. Stage-specific llama.cpp schema
  decoding now constrains entity arrays, evidence IDs and supported citation IDs.
  The same byte, date and citation gates still run after generation.
- The tested Qwen2.5-7B Greek prose was unreliable. Primary synthesis is now
  requested in English, using short source-attributed paragraphs and explicit
  uncertainty. Greek translation is a separate unvalidated step. No claim of a
  validated automatic Greek answer is made.
- A flagged draft may be revised once using its actual review, then must pass a
  new final review. Flags are never silently ignored; malformed review output or
  a second failed review still blocks publication of an accepted answer.

The actual four-case retry is
[39372264436](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39372264436).
It checks the real llama.cpp schema grammars and runs extraction, claim review,
synthesis and final review on derived texts. Results must be inspected before
changing the acceptance status.

Lantzas also needs better source coverage, not just a different prompt. A separate
new search and declared bibliographic followup is running under
[39372433114](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39372433114).
It supplies the previously documented Floristán2005 and Gürkan2014 public PDF URLs,
then searches and follows references. This is explicitly a followup with known
bibliographic seeds, not a blind recall score. The Gürkan title was corrected
against the actual PDF first page: *My money or your life: The Habsburg hunt for
Uluc Ali*, DOI10.14201/shhmo201436121145. It is not the separate2012 dissertation.

Anemi now passes a live query and parses literal titles: one piracy result and
10 of853 Crete results in run39308313775. More Veneto descriptive GraphQL search
also passes its positive control. SIAS timeouts, PARES/Books rate limits,
Academia's403 and BOA researcher login/CAPTCHA remain separate observed access
limitations. Their independent fallback catalogues are not native access.

Isolated MariaDB/PHP source replay, idempotence, foreign keys, rollback, review
history, restart readback and backup restoration passed. **Production installation
has not been verified:** the latest production evidence and signed-agent routes
return404, and this environment has no bound Plesk management connection. The
reviewed deployment package is ready; production backup/migration is not claimed.

Historical Greek OCR quality, handwriting recognition, portolan georeferencing,
independent source genealogy and independently annotated accuracy comparisons
remain incomplete. Machine confidence is not historical verification. No UI,
colour or 3D renderer source was changed.

## Observed followup and next live validation

The completed Qwen2.5-7B retry39372264436 still produced **zero accepted answer
paragraphs in all four cases**. It sometimes rejected a faithful French paraphrase
because an unnamed prison was not identified, and copied a contradictory example
from the final-review prompt. The fresh Lantzas followup39372433114 acquired nine
document/OCR URLs, including the two declared seed papers, but also returned zero
accepted model claims. Neither run passed research acceptance.

The following corrections are now on main:

- Generic `archipelago` remains a search alias but cannot establish Mediterranean
  geography by itself. The actual corpus replay now selects the Astypalaia
  author's English abstract and excludes the Bahamas passage from the bounded
  model sample. See `source-selection-replay.json` in the integration evidence.
- Final reviews explain source support before deciding. Unsupported decisions
  must identify literal unsupported words in the answer, and each paragraph
  requires exactly one decision. Individual claims are reviewed separately to
  avoid repeating every source context in an overflowing combined prompt.
- Model messages omit engine-only sentence offsets. The actual acquired Gürkan
  passage now fits the6500-character selection budget:5392 instead of6737
  characters. Its quotation and durable offsets are unchanged. See
  `actual-source-budget-replay.json`. This is a selection replay, not inference.
- A documented bibliography correction applies only when the actual PDF SHA256
  matches the inspected record. The original acquisition metadata remains
  untouched. The first followup used an incorrect Gürkan subtitle; the immutable
  old receipt is retained, and corrected derived metadata records its basis.

Actual model comparison and four-case reanalysis are running under
[39376752977](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39376752977).
The candidate is the official Apache2.0 Qwen3-8B Q4_K_M model, revision
`7c41481f57cb95916b40956ab2f0b139b296d974`, verified against the official LFS
SHA256. It requires no paid API. The controls include faithful English/French
source attributions and a deliberately false date/verification claim. These are
controlled diagnostics, not independently annotated historical accuracy scores.
The run pins its checkout; later corrections are not silently retrofitted into
an already running execution. A fresh end-to-end discovery run remains necessary
before claiming the current engine meets the acceptance criterion.

Credential metadata audit39374009832 returned403 for secret and variable names.
Their presence is **unknown**, not proven absent. The environment list returned200
with github-pages. No hosting management connection has been verified. The
previous bulk-context inventory was blocked by GitHub before execution and was
removed; it must not be approved as a deployment workaround.

Both models passed the three actual source-fidelity controls in39376752977;
this does not establish full historical accuracy. The core semantic default is
now the tested official Qwen3-8B profile while configured provider/model overrides
remain available. The fresh11-lane end-to-end request is
[39377319867](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/39377319867),
with no seeded source URLs and required semantic acceptance. Its actual query
expansion and preflight completed; lane acquisition and final synthesis remain
running at this checkpoint.

Citations now retain creator/publication metadata. Source versions retain their
parent and analysis run IDs and durable Git path, so identical text in different
runs does not leave an ambiguous stored relative path. A shared content key
explicitly prevents counting versions as independent corroboration. Failed or
interrupted calls preserve a running/failure receipt, and the workflow records
validation even after synthesis failure; partial progress never passes final
answer acceptance.

The actual first page of the Astypalaia secondary study was visually inspected.
The source-attributed hideout/provisions claim and the author's **most likely**
Vathy hypothesis are recorded separately in
`evidence/source_inspections/2026-10-20/astypalaia-abstract.json`. This developer
inspection is neither an independent gold benchmark nor proof that the automated
pipeline has passed. Underlying primary-source inspection and independent
corroboration remain pending.
