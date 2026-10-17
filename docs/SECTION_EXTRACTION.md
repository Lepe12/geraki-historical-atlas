# Source-attributed section reading

`tools/section_extraction.py` runs inside EVENT-FIRST on acquired text with known acquisition provenance. It adds a reading aid alongside the conservative legacy proximity matcher, without changing original inspection, genealogy, corroboration or human-review gates.

The extractor reads complete paragraphs, tracks standalone year headings and matches supplied name variants. Surname associations require a named document or a preceding explicit name; conflicting given names are held. Explicit paragraph dates override section dates. Adjacent-topic/pronoun context is retained for review rather than promoted to an event. Action vocabulary includes administrative/diplomatic predicates. Fiction/review contexts and unresolved dates stay visible as findings but do not become event candidates. No global expansion of the legacy 300-character context rule is used.

Outputs:

- `structured_output/extracted_findings.json`: all source-attributed findings, including unresolved material.
- `event_first_hits/event_hits.json`: provisional section candidates plus existing OCR/metadata leads.
- `research_dossier/answer.json` and `answer.md`: chronological, source-attributed excerpts for the question's date range, with gaps and limitations.
- Candidate events, claim-evidence matrix and command-center snapshot carry acquisition URLs, text ranges, date basis, identity-association uncertainty and cited-page references.

Each excerpt is an exact substring of the acquired text, identified by source-text SHA-256, character and line ranges. PDF scan indexes and cited printed-page numbers are separate fields. A secondary page citing p.283 does not establish that its own locator is p.283, or that the underlying original has been inspected. Actors remain UNKNOWN and locations unresolved unless an independent stage establishes them.

This implementation is deterministic section reading, **not LLM semantic synthesis**. The existing optional LLM client is not configured in the parallel research workflow; this change does not invent a provider, credentials, model execution or a historical conclusion. The answer is an attributed evidence digest, not an adjudicated narrative. Full semantic extraction and clause-level date/actor resolution remain explicit limitations; multiple dates and source-expressed uncertainty are flagged. All new candidates remain unverified, uninspected and pending controlled extraction.

Validation: synthetic controls cover heading dates, Greek inflection/surnames, different given names, Latin person and place requests, unrelated paragraphs, conflicting dates, fiction, PDF/cited-page separation, anonymous text, social exclusion and the complete EVENT-FIRST → verification → answer flow. Replay on an already acquired Corfu Museum text from run 39069048557 produced 15 provisional candidates instead of zero; this is routing evidence, not validation of those historical accounts. Fresh workflow acceptance must inspect the preserved answer, evidence ranges and unchanged verification gates.
