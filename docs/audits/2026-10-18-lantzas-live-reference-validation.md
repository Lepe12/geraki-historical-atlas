# Lantzas retrieval validation

User requested a real search for Πέτρος Λάντζας and investigation of missing/irrelevant references.

## Actual acquired reference inspected

J. M. Floristán, «(Arz)obispos griegos en Roma y España (1596-1602)», *Erytheia* 26 (2005), pp. 187–212. [PDF](https://dialnet.unirioja.es/descarga/articulo/2233252.pdf).

Printed page **195**, PDF page **9**, was visually inspected on 2026-10-18. It contains the wording “a través de Pedro Lantzas, agente griego al servicio de los españoles”. This establishes the presence of this name/reference in the consulted secondary article, not independent verification of every historical statement.

Footnote **32** cites:

- Μ. Θ. Λάσκαρις, «Πέτρος Λάντζας, διοικητής της Πάργας (1573) και όργανον των Ισπανών εν Ηπείρω (1596–1608)», *Αφιέρωμα εις την Ήπειρον*, Αθήναι 1956, pp. 103–118, 237–253.
- Κ. Μέρτζιος, «Μία άγνωστος περιπέτεια της Πάργας και ο κερκυραίος Πέτρος Λάντζας», *Ηπειρωτική Εστία* 9 (1960), pp. 889–892.

Those two items are citations **as cited by Floristán**. Their original pages have not been inspected in this validation. The acquired PDF remains durably stored at `evidence/runs/39107988812/travellers/library_acquisition/48d74cd4cb19953e2420b731.pdf`.

## Reproduced retrieval defect and repair

`bibliographic_queries()` returned an empty list on the already acquired Greek Wikipedia text in `evidence/runs/39107988812/travellers/library_acquisition/0776ab8aa5e8bbd1cbdd1db4.txt`. After repair it extracts five title queries, including the Ioannou study and Gürkan dissertation. It recognizes reference headings and unquoted author-year entries, retains bounded search and avoids treating arbitrary quoted prose as references. The citation-query budget is now explicit/configurable (default six, maximum twelve), instead of silently stopping at three.

The UI now displays a recorded zero-based PDF scan index as its one-based PDF page number when a PDF locator exists. It does not infer printed pagination from that index.

## Actual requests

- Controlled request: `jarvis_dispatch_requests/lantzas-search-validation-20261018.json`; dispatcher run **39114181350**; research run **39114188705**. Uses the previous 1577–1583 interval for comparison.
- Broad reference request: `library_discovery_requests/lantzas-reference-validation-20261018.json`; research run **39114506622**. Has no date restriction and includes the already acquired Floristán PDF as an explicit source lead. Search forms Pedro Lanza / Pedro Lantzas are provisional identity hypotheses derived from recorded source text, not proof that every namesake is the target.

The user did not impose a date restriction, so the broad request is the relevant completion check. Workflow completion, archival import and UI rendering must be reported only after observation. No historical VERIFIED promotion is authorized by this test.

A second concrete false positive was reproduced on the archived 1836 Sicilia book credited to Pietro Lanza, principe di Scordia. Authorship-clause matches now remain provisional unless another metadata field supports subject relevance. The discovery is retained and an independent description can still establish topical relevance. This classification is recalculated by the existing snapshot builder; it does not establish historical identity.

The decisive display defect was reproduced using the actual Floristán PDF: section extraction retained three named passages as REVIEW_CONTEXT because date/action interpretation remained unresolved. These existed in `structured_output/extracted_findings.json`, but the snapshot exposed only event candidates and catalogue discoveries. The snapshot now publishes explicit named acquired-text passages as `ACQUIRED_TEXT_REFERENCE` discoveries with their existing locator, prioritizes them in default discovery order, and leaves claims and VERIFIED state unchanged. Adjacent-topic-only passages, conflicting given names, fiction/book-review contexts and out-of-scope dates do not enter the related-reference list. A regression test covers this distinction, including PDF page indexing.
