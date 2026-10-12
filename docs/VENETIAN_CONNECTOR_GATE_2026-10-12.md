# Venetian archival connector: verified routing and access gate (2026-10-12)

## Primary official catalogue
- Archivio di Stato di Venezia: https://archiviodistatovenezia.it/it/patrimonio/moreveneto.html
- Official moreveneto portal: https://asve.arianna4.cloud/
- General Italian SIAS: https://sias-archivi.cultura.gov.it/cgi-bin/pagina.pl?RicVM=ricercaavanzata

## Verified scope
The Archivio di Stato di Venezia identifies **moreveneto** as its current catalogue. It states that the legacy SIASVe records have been migrated into moreveneto, with nearly 15,000 archival descriptions, plus finding aids and some digitized reproductions. General SIAS is a distinct national descriptive system; it must not be mislabeled as the Venetian moreveneto catalogue.

## Connector status
- VENICE_MOREVENETO: OFFICIAL_PORTAL_CONFIRMED; SEARCH_API_UNVERIFIED; 0 confirmed query results.
- ITALY_SIAS: OFFICIAL_ADVANCED_SEARCH_CONFIRMED; FORM_SUBMISSION_UNVERIFIED; 0 confirmed query results.
- These are discovery gates, **not** CONNECTED search lanes.
- Do not claim a catalogue match, original document, stable archival reference, or API access from landing-page availability.

## Next acceptance test
1. Inspect the moreveneto browser application's network requests and identify a documented or stable public search endpoint; avoid assuming its internal API.
2. Execute a live archival query (e.g. Senato or bailo) and capture actual record identifiers, titles, dates, provenance and stable URLs.
3. Verify at least one returned description belongs to Archivio di Stato di Venezia.
4. Only then mark SEARCH_CONNECTED. Original page acquisition and historical corroboration remain separate gates.
5. For national SIAS, independently validate real advanced-form submission and returned record metadata.

Source: Archivio di Stato di Venezia official moreveneto page (above), consulted 2026-10-12.
