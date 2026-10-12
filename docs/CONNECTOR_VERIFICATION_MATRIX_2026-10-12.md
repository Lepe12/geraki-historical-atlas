# Connector verification matrix — 2026-10-12

Source: GitHub Actions PCT run 38285556230, per-lane repository discovery logs. Status applies to **catalogue search execution**, not archival completeness or historical verification.

| Target | Observed status | Hits | Classification |
|---|---|---:|---|
| PARES / Archivo General de Simancas | EXECUTED | 3 | CONNECTED — native PARES catalogue search; AGS attribution + ES.47161.AGS reference + signatura verified |
| Biblioteca Digital Hispánica | EXECUTED | 3 | CONNECTED — catalogue |
| BSB | EXECUTED | 20 | CONNECTED — catalogue |
| Deutsche Digitale Bibliothek | API_KEY_REQUIRED | 0 | BLOCKED — DDB_API_KEY missing |
| The National Archives Discovery | EXECUTED | 0 | CONNECTED — query completed, no hits |
| British Library | AUTH_OR_BROWSER_REQUIRED | 0 | BLOCKED — anonymous search not configured |
| Nationaal Archief | EXECUTED | 6 | CONNECTED — catalogue |
| Delpher | EXECUTED | 20 | CONNECTED — catalogue |
| Archives diplomatiques | EXECUTED | 18 | CONNECTED — catalogue |
| Gallica/BnF | EXECUTED | 20 | CONNECTED — catalogue |
| Archives nationales | AUTH_OR_BROWSER_REQUIRED | 0 | PARTIAL — open data exists but full catalogue connector absent |
| Internet Culturale | EXECUTED | 0 | CONNECTED — query completed, no hits |
| SIAS / Archivio di Stato di Venezia | AUTH_OR_BROWSER_REQUIRED | 0 | BLOCKED — search request mechanics unverified |
| SIAS / Italian State Archives | AUTH_OR_BROWSER_REQUIRED | 0 | BLOCKED — search request mechanics unverified |
| İSAM Kütüphanesi | EXECUTED | 7 | CONNECTED — catalogue |
| Türkiye Devlet Arşivleri / BOA | AUTH_OR_BROWSER_REQUIRED | 0 | BLOCKED — researcher authentication and CAPTCHA |

## Work queue — concrete acceptance gates

1. **PARES/Simancas: COMPLETE.** Native search acceptance gate passed in Actions run 38295298857; three dynamically discovered AGS descriptions verified with stable archival references and signaturas.
2. **SIAS/Venice and Italian state archives:** inspect official advanced-search form mechanics; test real query and record metadata before enabling a connector.
3. **Archives nationales:** implement a separately named **open-data inventory** route using the official published inventory dataset (31,001 finding aids) and/or digitized corpus (>700 sets). Do not represent this as complete archive coverage.
4. **British Library:** test its public interim archives/manuscripts catalogue where technically supported; the official Z39.50 MARC21 service requires registration and credentials.
5. **DDB:** obtain and configure official DDB_API_KEY before claiming access.
6. **BOA:** maintain authenticated/manual gate; do not attempt CAPTCHA bypass.

All statuses must be based on repository-specific returned records, not green GitHub jobs. Original inspection and historical verification remain separate gates.

Official references:
- https://www.archives-nationales.culture.gouv.fr/ouverture-des-donnees-des-archives-nationales
- https://www.bl.uk/services/collection-metadata-services
- https://pares.cultura.gob.es/ParesBusquedas20/catalogo/description/2
- https://sias-archivi.cultura.gov.it/cgi-bin/pagina.pl?RicVM=ricercaavanzata
- https://katalog.devletarsivleri.gov.tr/
