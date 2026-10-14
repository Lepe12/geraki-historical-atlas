> **HISTORICAL SNAPSHOT — NOT CURRENT CANONICAL STATUS.** This document is retained for audit chronology. For current architecture/status use `docs/CANONICAL_DOCUMENTATION.md` and `docs/SYSTEM_SPEC.md`.

# Archive connection audit (12 October 2026)

**Verified execution:** GitHub Actions run 38282522266 completed all 10 research lanes and synchronized 165 *unverified* source candidates to Airtable. Lane success is not proof of access to every named archive.

| Lane | Working machine route | Outstanding target |
|---|---|---|
| Travellers | Internet Archive; Google Books | Individual holdings |
| Spanish | BNE / Biblioteca Digital Hispánica | PARES / Simancas interactive |
| Venetian | Internet Archive; Internet Culturale | ASVe / SIAS |
| French | BnF SRU; Archives diplomatiques | Archives nationales general catalogue |
| British | TNA Discovery | British Library |
| Dutch | Nationaal Archief; Delpher | Collection-specific digitization |
| German | BSB SRU + IIIF | DDB requires `DDB_API_KEY` |
| Italian states | Internet Culturale | SIAS / individual state archives |
| Ottoman | İSAM | BOA authenticated catalogue |
| North African | Public surrogate collections | Native archive interfaces |

## Verified official access constraints and new findings

- British Library: its official metadata service currently describes **authenticated Z39.50 MARC21 access for eligible libraries**; do not treat this as anonymous access to manuscripts. https://www.bl.uk/services/collection-metadata-services
- PARES: public search results and archival description pages are accessible, including Simancas; the public archive-level page exposes **EAD3 export**. This is a potential *record-specific metadata acquisition* route, **not yet a proven general search connector**. https://pares.cultura.gob.es/ParesBusquedas20/catalogo/description/2
- SIAS: official advanced search exists, with archive complex, producer and repository fields. A compliant HTML form integration requires inspecting actual requests and testing; do not label it CONNECTED yet. https://sias-archivi.cultura.gov.it/cgi-bin/pagina.pl?RicVM=ricercaavanzata
- Archives nationales France: official open data includes published finding-aid lists and a digitized corpus; authority data has a SPARQL endpoint. These are **partial, specialized discovery routes**, not a full archival catalogue API. https://www.archives-nationales.culture.gouv.fr/ouverture-des-donnees-des-archives-nationales ; https://github.com/ArchivesNationalesFR/Referentiels
- BOA: official catalogue presents researcher login and CAPTCHA, so it must remain an authenticated/manual target. https://katalog.devletarsivleri.gov.tr/
- DDB: existing connector requires a configured API key; BSB already works independently.

## Work still required

1. Validate PARES EAD3 export for individual catalogue records; preserve identifier and archival hierarchy.
2. Evaluate SIAS public advanced-search request mechanics without bypassing restrictions.
3. Add Archives nationales official open-data/authority discovery as *separate named sources*, never as full Archives nationales coverage.
4. Test DDB only if the secret exists; report API_KEY_REQUIRED otherwise.
5. Extend health reports to separate lane success from archive coverage. Keep historical verification gated on original-page inspection and independent corroboration.

No new archive is marked CONNECTED in this audit without a successful repository-specific query.
