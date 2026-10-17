# Research pipeline repair acceptance

Baseline: run 39067726975, Greek person query and 1577–1583 range. This is a regression case, not a person-specific engine rule.

Observed failures: sequential repository queries exceeded 300 seconds; native/external archives at the end of the queue remained unexecuted; generic public source pages/PDFs stayed LOCATED; a social post became a candidate and a person name became its place; the final snapshot claimed COMPLETED despite a failed lane.

Changes:

- Repository discovery now uses fair rounds with four workers, durable checkpoints and resumable query queues. Each pass runs at most three rounds; the workflow automatically continues for up to six passes. Finished queries are not repeated. Exhausted budgets remain explicit PARTIAL coverage, not negative search evidence. Key/access blockers are retained.
- General public HTML/plain text and PDF acquisition records canonical URL, checksum, files and PDF scan indexes. It follows at most two linked document URLs and searches up to three explicitly quoted bibliographic titles per lane. Unresolved citations and acquisition failures stay recorded. Network requests and redirects reject private/local destinations; no login/paywall bypass is provided.
- PDF text is extracted with poppler. A scan index is not a printed page. Empty scanned PDFs require OCR; no original inspection or historical verification is inferred. Exact PDF hit locators enter the inspection queue.
- IA downloads no longer silently choose an arbitrary issue's text or PDF metadata text when multiple OCR files exist without a matched filename.
- Person targets do not become places. Social posts remain discoveries/context leads and are excluded from automatic event candidates. All evidence gates remain in force.
- Workflow execution and coverage completeness are distinct from scientific verification. Failed lanes report FAILED, bounded incomplete coverage reports PARTIAL, and the mission cannot claim COMPLETED while either persists.

Validation: 72 offline regression tests plus the command-center snapshot script passed. Controls include fair scheduling/resume, interrupted checkpoints, actual PDF extraction/page boundaries, linked-document provenance, social post retention, person/place separation, and failed snapshot propagation. Live acceptance requires rerunning the complete baseline query and inspecting coverage, acquisition files/locators and the actual mission state; successful code checks alone are not historical research validation.
