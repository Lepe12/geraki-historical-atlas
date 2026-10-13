# Context policy correction — 2026-10-13

The observed Milos run 38374191697 produced five candidate entries from three
distinct sources: an opera libretto (LoC 2010666089), The Grand Mogul (BnF
cb34833944r, repeated across three lanes), and the musical periodical Melos
10.Jg.1931. These are negative routing controls for this request, not evidence
of Cycladic piracy. Original files remain intact.

The new policy searches title and description independently, not serialized
catalogue JSON. Contributor lifespans, IDs, URLs and publication date fields
cannot supply event years. Place, historical action and candidate year must
occur within nearby narrative context. Ambiguous terms such as contributions
or Slavische no longer suffice alone; generic attack/fire language requires
maritime context. Cultural collisions are retained in the context review queue.
Supplied aliases and OCR years stay provisional, with no automatic geographic
equivalence or calendar conversion. Undated relevant leads remain reviewable.

Eight regression groups include the three observed false positives and six
explicitly synthetic multilingual positive routing sentences. These sentences
are not historical evidence. Passing the suite establishes these bounded
behaviors; it does not establish universal historical precision or recall.

The existing system-health step appends a retrospective machine review of all
preserved candidate files readable in its checkout. Each decision includes the
original file path and SHA-256. Both normalized_request and older
normalized_context/research_request envelopes are read. Missing identities/parsing failures are
reported as NOT_REASSESSED. Original candidate records, acquired evidence,
human review and VERIFIED flags are never overwritten. The report is preserved
in the current run's SYSTEM_HEALTH.json and imported as a document by the
unchanged MariaDB importer. It is a routing review, not human verification and
not an in-place repair of old candidate rows.

No workflow permissions, ten-lane scheduling, hosting, WordPress, .htaccess,
database credentials or five-minute importer settings change.
