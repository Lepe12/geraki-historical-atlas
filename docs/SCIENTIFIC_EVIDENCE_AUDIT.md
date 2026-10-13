# Scientific evidence-gap audit

`tools/scientific_evidence_audit.py` reads preserved candidate-event records, their request context and review sidecars. The existing aggregate-health step includes its complete report in `SYSTEM_HEALTH.json`; workflow permissions, ten lanes and storage schedules are unchanged.

Run manually:

```sh
python3 tools/scientific_evidence_audit.py --output scientific-audit.json
python3 -m unittest discover -s tools -p test_scientific_evidence_audit.py
```

The audit distinguishes recorded evidence states from historical verification. It hashes its candidate and available sidecar inputs, preserves candidate index as well as ID, retains source pointers, groups repeated identities provisionally and lists missing documentation per record. Empty candidate files remain in the coverage count; malformed files are explicitly reported.

Recorded bibliography, exact-page mapping, inspection attestation, controlled extraction, date/place extraction, genealogy evidence, independent supporting chains and human-review attestation are checked separately. Documentary fields such as `inspection_evidence`, `inspection_reviewer`, `extraction_evidence`, `genealogy_evidence`, and `corroboration_evidence` are audit expectations; absent legacy fields mean the proof is not recorded in the examined data, not that the historical assertion is false. Legacy booleans alone do not establish these gates. A complete documentary trail still requires substantive manual evaluation and never receives automated VERIFIED status.

Source filename/catalogue identity grouping is neither proof of bibliographic equivalence nor independent corroboration. Catalogue hits are not contemporary eyewitness evidence. A missing printed page paired with leaf 0 is held as PAGINATION_UNRESOLVED, even when an image filename exists.

Scope: GitHub-preserved candidate-event records. This is not a fresh census of live MariaDB, legacy Airtable, or a visual inspection of every source. The host-local importer can preserve the aggregate report through its existing process; a GitHub commit or queue does not prove a database import. No source records, review decisions, WordPress components or database settings are rewritten.
