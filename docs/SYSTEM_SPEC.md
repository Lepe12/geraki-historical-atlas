# Piratecartography Historical Research System — System Specification

**Status:** canonical recovery specification  
**Architecture:** SOURCE-FIRST + EVENT-FIRST, multi-archive, actor-optional  
**Test data:** Kythnos/Thermia is validation data only and MUST NOT be hard-coded into the architecture.

## 1. Purpose
This repository is the durable research engine. ChatGPT or any other UI is only a client/controller. The system must remain recoverable if a model, chat, plugin, or interface disappears.

## 2. Durable components
1. **GitHub repository** — code, workflows, connectors, doctrine, schemas and recovery documentation.
2. **Dedicated MariaDB database `piratecartography`** — host-local durable research runs, reports, source/event candidates and provenance. Existing Airtable data remains a legacy snapshot and separate Atlas consumer; it is not the default agent-results writer.
3. **Evidence Store** — durable copies of legally/technically retrievable manifests, OCR/full text, acquisition reports and exact-page images/PDFs. GitHub Actions artifacts are transient transport/cache and MUST NOT be the sole copy.
4. **UI/client** — ChatGPT today; replaceable. No canonical evidence or unique system state may live only in chat memory.

## 3. Research contract
Research Request → place/date/aliases → travellers/contemporary literature + parallel archive lanes → multilingual historical query expansion → candidate ranking → Citation Chase → locate digital object → acquire available OCR/full text → EVENT-FIRST search → exact-page mapping → exact scan acquisition → original visual inspection → event/date/place extraction → actor attribution only if evidence permits → source genealogy/independence → corroboration → Verification → QA → SOURCES/EVENTS/PLACES.

Rules:
- Event-first; perpetrator is an attribute, not a prerequisite.
- UNKNOWN actor is valid.
- Catalogue metadata, OCR hits and successful downloads are discovery evidence, not historical verification.
- Verification requires original-page inspection, defensible extraction, source genealogy and independent corroboration.
- Never infer independence merely because two publications differ.
- Preserve historical aliases such as Archipel/Arcipelago/Archipelago/Archipelagus.

## 4. Parallel research lanes
The engine defines eleven source-family lanes:
1. greek
2. travellers
3. spanish_simancas
4. venetian
5. french
6. british
7. dutch
8. german
9. italian_states
10. ottoman
11. north_african

A successful GitHub job does NOT imply the named archive was searched. Repository execution must be recorded explicitly as EXECUTED; unsupported targets remain CITATION_CHASE_WEB_OR_API_CONNECTOR_REQUIRED.

## 5. Connector architecture — 2026-10-12
The connector layer is now normalized through `tools/connectors/repository_connectors.py` and `tools/lane_repository_discovery.py`. Every result carries repository/lane provenance and an explicit connector status.

Implemented anonymous/public execution paths:
- BSB Alma SRU + IIIF routing.
- The National Archives (UK) Discovery API.
- Internet Archive search/acquisition/OCR/exact-page route.
- BnF General Catalogue SRU as the stable BnF discovery path when direct Gallica SRU is blocked.
- Biblioteca Nacional de España SRU / Biblioteca Digital Hispánica discovery path.
- Archives diplomatiques public catalogue search.
- Internet Culturale public catalogue search.
- Nationaal Archief public search/open-data route.
- Delpher/KB SRU.
- Google Books public discovery.
- İSAM public DSpace/AtoM discovery fallback.
- Deutsche Digitale Bibliothek connector when `DDB_API_KEY` is supplied.

Explicit blockers are preserved rather than faked:
- PARES/Archivo General de Simancas: interactive/browser research target; no stable anonymous API is claimed.
- Türkiye Devlet Arşivleri/BOA: authenticated interactive catalogue.
- SIAS/Archivio di Stato archive-specific search: retained as a research target until a stable anonymous term-search connector is proven.
- British Library and Archives nationales: retained as targets; no general anonymous machine-search API is claimed.

A lane can be operational through a proven public counterpart/fallback while a named archive in that lane remains blocked. Never translate lane success into a false claim that every listed archive was searched.

## 6. Evidence-state model
Immutable progression:
DISCOVERED → LOCATED → ACQUIRED → EXACT_PAGE_MAPPED → ORIGINAL_INSPECTED → EXTRACTED → GENEALOGY_CHECKED → CORROBORATED → VERIFIED.

The automated workflow now also creates explicit post-acquisition queues/reports:
- `original_inspection/inspection_queue.json`
- `source_genealogy/genealogy_queue.json`
- `corroboration/corroboration_queue.json`
- `verification/verification_gate.json`
- `qa/qa_report.json`
- `structured_output/candidate_events.json`

These files complete the workflow stages without pretending that a machine download has been visually inspected. If original inspection/genealogy/corroboration are absent, the verification gate remains blocked.
Failures/holds: ACCESS_BLOCKED, CITATION_DEAD_END, NEEDS_EVIDENCE, PAGINATION_UNRESOLVED.
No acquisition action may directly set VERIFIED.

## 7. Evidence Store contract
Every persisted evidence object should have:
- research_job_id
- source_id / repository identifier
- repository + lane
- canonical source URL/identifier
- acquisition timestamp
- object type: manifest | metadata | OCR | PDF | page_image | report
- printed page/folio and scan/canvas index when known
- SHA-256 checksum
- parent/source genealogy pointer
- rights/access note
- inspection status
- verification status

Recommended durable layout:
evidence/<research_job_id>/<source_id>/manifest/
evidence/<research_job_id>/<source_id>/ocr/
evidence/<research_job_id>/<source_id>/pages/
evidence/<research_job_id>/<source_id>/reports/

Large binaries should NOT be committed blindly to normal Git history. Use a durable object store/library; retain manifests/checksums/indexes in the repository/database.

## 8. Structured storage — MariaDB primary, Airtable legacy
Primary research-results database: `piratecartography` on the existing Top.Host server.
Adapter and recovery: `docs/MARIADB_RESEARCH_STORAGE.md`, `tools/storage/pct_research_store.php`, `tools/storage/schema.sql`.
The host-local importer preserves GitHub run reports and never promotes evidence to VERIFIED.

Legacy Airtable base: appML9NlhzlVMoGjb
Tables:
- PLACES tbluvDJfE42j5qxMa
- SOURCES tblVnmghyTX7B2EgD
- EVENTS tblr7KI6LCxpFnp1I
- ROUTES tblsRfozlMSZ03w7M
- RESEARCH JOBS tblXWi37TDh1ZqrX6

The Airtable schema and IDs must also be exported/versioned in this repository so the database can be reconstructed.

## 9. Recovery procedure
If ChatGPT/UI disappears:
1. Clone this repository.
2. Read this file and docs/general-research-doctrine.md.
3. Restore required repository secrets/connections.
4. Restore the dedicated MariaDB adapter and additive schema, then import the preserved GitHub run trees. Confirm the legacy Airtable schema/snapshot only when restoring migrated records or the existing Atlas consumer.
5. Confirm Evidence Store credentials/location and checksum index.
6. Run positive controls before research:
   - BSB: bsb10447069 must resolve to a valid manifest and retrievable scan while available upstream.
   - TNA: execute a known catalogue query and record EXECUTED.
   - Internet Archive: run acquisition → OCR → event-first → exact-page control.
7. Only after controls pass, submit new research jobs.
8. Never promote legacy discovery records to VERIFIED without the verification gates.

## 10. Backup rule
No irreplaceable component may exist in only one of:
- chat/model memory,
- GitHub Actions artifacts,
- a temporary runner filesystem,
- a single external URL.

Canonical code/specification lives in GitHub; primary research-results state in the dedicated MariaDB database with versioned compressed payloads and import audit; legacy Airtable records retain schema/record snapshots; acquired evidence stays in the durable Evidence Store with checksums/indexes.

## 11. Hardening status
Completed:
1. GitHub Evidence Store pilot with SHA-256 indexes and selected durable scans.
2. Automatic run evidence preservation for all eleven lanes.
3. Airtable schema snapshot versioned in GitHub.
4. Automated timestamped Airtable record backup to GitHub.
5. Repository-specific discoveries merged into the common Citation Chase/acquisition pipeline with provenance.
6. General request-driven library/OCR/EVENT-FIRST stages; Kythnos/Crevelier are no longer hard-coded in engine logic.
7. Post-acquisition inspection/genealogy/corroboration/verification/QA stages.
8. Per-lane and aggregate eleven-lane system-health reports.

Remaining external-access work is repository-specific, not architectural: authenticated/browser-only archives and optional-key APIs stay explicit blockers until credentials or a stable legal machine interface are available.


## Airtable schema recovery snapshot

Canonical structural backup path: `backups/airtable/schema/airtable_schema_2026-10-12.json`.
It preserves base/table/field IDs, names, types, descriptions and link-field structure for PLACES, SOURCES, EVENTS, ROUTES and RESEARCH JOBS. This is a structural recovery snapshot; record-data export is a separate backup layer.


## 12. Airtable durable record backup
Workflow: `.github/workflows/airtable-durable-backup.yml`.
The first live backup succeeded in GitHub Actions run 38243014838 and commit `711076fc328d37daa59d3aa487e6056aa22a36fb`, under `backups/airtable/records/20261012T113000Z/`. The snapshot contains PLACES, SOURCES, EVENTS, ROUTES, RESEARCH_JOBS and a manifest. Scheduled backups use the repository secret `AIRTABLE_TOKEN` and never expose the token in repository files.


## 13. Host-local MariaDB results persistence

The research workflow defaults to `PCT_STORAGE_BACKEND=mariadb`. Durable lane results are committed to GitHub and queued through `MARIADB_STORAGE_INTENT.json`; the hosting-local importer writes them to the dedicated database. The queue report never claims that a database write already happened. Actual import, read-back, idempotency and recurring-task evidence are in the host-local storage audit and `docs/MARIADB_RESEARCH_STORAGE.md`.

No public writer API, open database port, WordPress changes, or embedded DB credentials are required. The five additive `pc_research_*` tables preserve research jobs, document versions, compressed original payloads, searchable candidates and import history. Existing `pc_mig_*` tables stay intact. Airtable synchronization is an explicit rollback mode, not a second default writer.


## 14. Research Discovery retention contract
Research Discovery and Scientific Claims are separate views over the same durable evidence trail.

- No weak, unresolved, contradictory or off-target discovery is silently deleted.
- `PRIORITY`, `REVIEW_REQUIRED` and `EXCLUDE_FROM_ACQUISITION` are automation dispositions, not visibility/deletion states.
- Every retained lead carries **Research Value** and **Evidence Confidence** as separate 0–100, non-probabilistic scores.
- Research Value measures whether a lead is worth pursuing.
- Evidence Confidence measures evidence maturity/traceability for claim use.
- A low Evidence Confidence score blocks overclaiming but never hides the research lead.
- Claim records expose an auditable trail from discovery through exact locator, original inspection, extraction, genealogy, corroboration, contradiction search, human review and final verification.
