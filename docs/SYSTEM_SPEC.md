# Piratecartography Historical Research System — System Specification

**Status:** canonical recovery specification  
**Architecture:** SOURCE-FIRST + EVENT-FIRST, multi-archive, actor-optional  
**Test data:** Kythnos/Thermia is validation data only and MUST NOT be hard-coded into the architecture.

## 1. Purpose
This repository is the durable research engine. ChatGPT or any other UI is only a client/controller. The system must remain recoverable if a model, chat, plugin, or interface disappears.

## 2. Durable components
1. **GitHub repository** — code, workflows, connectors, doctrine, schemas and recovery documentation.
2. **Airtable research database** — structured SOURCES, EVENTS, PLACES, ROUTES and RESEARCH JOBS.
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
The engine defines ten source-family lanes:
1. travellers
2. spanish_simancas
3. venetian
4. french
5. british
6. dutch
7. german
8. italian_states
9. ottoman
10. north_african

A successful GitHub job does NOT imply the named archive was searched. Repository execution must be recorded explicitly as EXECUTED; unsupported targets remain CITATION_CHASE_WEB_OR_API_CONNECTOR_REQUIRED.

## 5. Connector state — 2026-10-12
- British/TNA Discovery: catalogue connector empirically operational.
- German/BSB: SRU catalogue connector empirically operational. Positive control bsb10447069 validated IIIF and acquired a reference scan; non-digitized/catalogue-only BSB identifiers may correctly return 404.
- Travellers/Internet Archive: automated discovery/acquisition/OCR/event-search/exact-page path empirically demonstrated.
- Gallica: GitHub Actions request encountered HTTP 403; do not claim connected.
- PARES/Simancas, ASVe/SIAS, British Library, Nationaal Archief/Delpher, DDB, Internet Culturale, BOA/İSAM and North-African specialist repositories: connector work pending unless a later run explicitly supersedes this status.

## 6. Evidence-state model
Suggested immutable progression:
DISCOVERED → LOCATED → ACQUIRED → EXACT_PAGE_MAPPED → ORIGINAL_INSPECTED → EXTRACTED → GENEALOGY_CHECKED → CORROBORATED → VERIFIED.
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

## 8. Airtable canonical base
Base: appML9NlhzlVMoGjb
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
4. Confirm Airtable base/table schema from the versioned schema snapshot.
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

Canonical code/specification lives in GitHub; structured research state in Airtable plus schema snapshots; acquired evidence in durable Evidence Store plus checksums/indexes.

## 11. Next hardening tasks
1. Choose/provision the durable Evidence Store.
2. Add automatic evidence index + SHA-256 generation.
3. Export/version Airtable schema.
4. Merge repository-specific discoveries into the common acquisition pipeline with provenance.
5. Implement remaining archive connectors one by one with positive controls.
6. Add automated system-health report covering all ten lanes.
