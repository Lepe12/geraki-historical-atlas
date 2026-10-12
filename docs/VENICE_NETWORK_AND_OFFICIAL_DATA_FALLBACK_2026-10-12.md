# Venetian connector network and fallback verification — 2026-10-12

## Live network test
Workflow: `.github/workflows/moreveneto-network-diagnostics.yml`, successful run 38289196869.
- DNS: `asve.arianna4.cloud` -> `144.91.85.87`; `aw-unifi-graphql.netseven.it` -> `95.217.45.43`.
- Backend refused TCP connections on HTTPS 443 and HTTP 80, for GET and OPTIONS at `/` and `/graphql`.
- The public SPA host returns HTTP 200 `text/html` on `/graphql` and `/api/graphql`; these are SPA fallback HTML, NOT GraphQL API endpoints. OPTIONS returned HTTP 405.
- Therefore no successful catalogue API search has been verified. Browser automation in the same GitHub runner also yielded no observed GraphQL response.
- Do not infer that the remote server universally blocks GitHub runners: service outage or firewall policy are also possible.

## Official archival-data fallback
The Italian Ministry of Culture open-data catalogue publishes historic SIASVe datasets and metadata (2014–2015), including CSV, RDF, Turtle and N-Triples distributions:
- https://dati.beniculturali.it/lodview/resource/fonte-SIASVE.html
- https://www.dati.gov.it/node/view-dataset/dataset?id=92978c2b-e8b2-450d-ac7b-6261b5a39c27
The official Archivio di Stato di Venezia confirms the current moreveneto system incorporates earlier SIASVe descriptions:
- https://www.archiviodistatovenezia.it/it/patrimonio/moreveneto.html

This is a legitimate historical metadata fallback, not evidence of live current Moreveneto search. Download and verify actual rows before labelling a data connector CONNECTED.

## Status
MOREVENETO: BLOCKED_REMOTE_NETWORK.
SIASVE_OPEN_DATA_FALLBACK: DISCOVERED_NOT_YET_DOWNLOADED.
