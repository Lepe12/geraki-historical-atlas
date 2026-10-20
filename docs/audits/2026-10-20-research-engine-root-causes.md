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
