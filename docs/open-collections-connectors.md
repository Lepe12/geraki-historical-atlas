# Open collections: David Rumsey, Internet Archive, Gallica, Europeana, HathiTrust

`tools/connectors/open_collections.py` lets NABOU//X search two open sources for maps and
texts about Aegean pirates, corsairs and bases (ορμητήρια), including historical place names.

## Use

```
python3 tools/connectors/open_collections.py Milo Cerigo --rows 25 --output /tmp/hits.json
python3 connectors/david_rumsey_search.py "Candia"          # registry CLI (connector_runner)
python3 connectors/internet_archive_search.py "Cerigo" --year-from 1600 --year-to 1800
```

Each record has `title`, `creator`, `date`, `year`, `item_url`, `archive_url`, `source_name`,
`matched_query`, `matched_alias`, `alias_basis`, plus `evidence_level: DISCOVERY_ONLY` and `verified: false`.
Fields the catalogue does not give stay empty. Nothing is guessed.

## How it plugs in

- `tools/connectors/connector_registry.json` adds `internet_archive_texts` and `david_rumsey_maps`,
  both READ_ONLY, run by `connector_runner.py`. Their limits are in `connector_limits.json`
  (one request at a time, at least 1 s apart).
- `repository_connectors.dispatch()` handles "David Rumsey Map Collection" and "Internet Archive",
  so `audited_dispatch` writes http_audit receipts.
- `lane_repository_plan.py` adds David Rumsey to the travellers lane, and `lane_repository_discovery.py`
  expands the lane target through the gazetteer.
- Aliases come from `knowledge/pirates_bases.md` (section "Παλιά ονόματα τόπων") and from
  `tools/place_resolver.py`, which uses only SOURCED variants from the Wikidata gazetteer.
  Ambiguous names (e.g. Candia) are not expanded; a warning is added instead.

## Findings and limits (checked 2026-10-29)

- **David Rumsey:** the site's `robots.txt` disallows `/luna/servlet/as*` and `/luna/servlet/search*`
  (the LUNA search API) for all agents. We therefore search the Internet Archive mirror
  `collection:david-rumsey-map-collection` (~111k items) and return the canonical
  `davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~…` URL from each item's `source` field.
  That URL is used only when it is on davidrumsey.com; otherwise the archive.org URL is returned.
  How complete the mirror is, and how far it lags the live site, is unknown.
- **Internet Archive advancedsearch** searches metadata only, not OCR full text. It does not expand
  wildcards: `pirat*` silently returns 0, so the topic mode uses whole words in several languages.
- **Namesakes:** a bare `Milo` matches people and US places. Texts therefore default to a
  1450–1900 window (`--all-years` turns it off). Check the `coverage` field before trusting a hit.
- **Politeness:** no rate limit is documented. The connector identifies itself with its own User-Agent,
  uses 25 s timeouts, makes at most 1 request/s through ConnectorLease, and keeps a 7-day disk cache
  (`NABOU_OPEN_COLLECTIONS_CACHE`). HTTP 429 and 403 are reported as REMOTE_RATE_LIMITED and
  REMOTE_ACCESS_BLOCKED and are never retried around.

Tests: `PYTHONPATH=tools/connectors python3 -m unittest tools/connectors/test_open_collections.py`
(recorded fixtures in `tools/fixtures/open_collections/`, no network).

---

# Gallica, Europeana, HathiTrust (and Ανέμη)

`tools/connectors/open_collections_extra.py` adds three more read-only sources, using the same
client as above (User-Agent, 25 s timeout, ConnectorLease pacing, 7-day cache, no retry on 429/403)
and the same alias expansion and record shape (`DISCOVERY_ONLY`, `verified: false`, unknown fields empty).

```
python3 tools/connectors/open_collections_extra.py Milo Cerigo --rows 25 --output /tmp/hits.json
python3 tools/connectors/open_collections_extra.py Cerigo --source gallica --year-from 1600 --year-to 1800
python3 connectors/gallica_search.py "Candia"        # registry CLIs (connector_runner)
python3 connectors/europeana_search.py "Cerigo"      # needs EUROPEANA_API_KEY
python3 connectors/hathitrust_search.py "Cerigo"
```

| Source | Registry id | Route | Status (2026-10-29) |
|---|---|---|---|
| Gallica (BnF) | `gallica_bnf_digitized` | BnF catalogue SRU, digitized free-access only | works |
| Europeana | `europeana_search` | Europeana Search API v2 | works with a key; without one returns `API_KEY_REQUIRED` and sends nothing |
| HathiTrust | `hathitrust_bib` | Internet Archive OCLC numbers → HathiTrust Bibliographic API | works (lookup, not search) |
| Ανέμη (UoC) | — | — | not added: site unavailable (see below) |

Wiring: registry + limits entries; `repository_connectors.dispatch()` labels "Gallica (BnF digitized)",
"Europeana", "HathiTrust Digital Library"; Gallica is in the `french` lane, Europeana and HathiTrust in the
`travellers` lane (place-name queries only, `PCT_RUMSEY_QUERY_LIMIT` caps them as for Rumsey). The older
"Gallica/BnF" → `bnf_sru` (whole BnF catalogue) is unchanged.

## Findings and limits

- **Gallica:** `gallica.bnf.fr/robots.txt` has `Disallow: /*?` and `Crawl-delay: 5`, and the box gets a
  Cloudflare challenge (403) there, so Gallica's own SRU is **not** used and nothing tries to get around it.
  We query `https://catalogue.bnf.fr/api/SRU` (its robots.txt only disallows `/Connecter`; Crawl-delay 5,
  so the limit is 1 request per 5 s) with
  `bib.anywhere all "X" and bib.digitized all "freeAccess" and bib.publicationdate within "1450 1900"`.
  The SRU explain record defines `freeAccess` as digitized documents freely online in Gallica.
  The Gallica link is the record's UNIMARC 856$u; the IIIF manifest URL is built from the ark
  (documented Gallica pattern) and is not fetched. The catalogue search is metadata only (no OCR text).
  BnF sometimes sends a per-record diagnostic (`info:srw/diagnostic/1/131`) instead of a record; such
  records are skipped. `bib.date` gave 0 hits, so the year window uses `bib.publicationdate`.
- **Europeana:** needs an API key (free, from Europeana PRO). Put it in the env var `EUROPEANA_API_KEY`
  (never in the repo). `--demo-key` uses the public demo key from the Europeana docs and is meant only for
  a smoke test. The API echoes the key in `apikey` and in every item `link`; the connector masks it before
  caching, redacts `wskey` in request receipts and http_audit, and drops `utm_*` from item URLs.
  The year window is `qf=YEAR:[1450 TO 1900]`. Many hits are aggregated from other libraries
  (e.g. Biblioteca Marciana map sheets); `data_provider` names them. `year` is copied as given
  (one Marciana record says `151`).
- **HathiTrust:** full-text search (`babel.hathitrust.org/cgi/ls`) and catalog search are web pages behind a
  Cloudflare challenge; the old Data API was retired on 2024-07-17; the AUP forbids automated bulk retrieval
  except via HathiFiles/Datasets. The **Bibliographic API** (`catalog.hathitrust.org/api/volumes/brief/json/…`,
  up to 20 ids per call) is official and works, but it is "not a search API". So we find OCLC numbers with
  an Internet Archive texts search (`… AND oclc-id:* AND year:[1450 TO 1900]`) and look them up there.
  This only finds books that are also on archive.org with an OCLC number; it is a subset, not HathiTrust's
  own search. Each record gives rights (`Full view` / `Limited (search only)`) and the volume links.
  The hathitrust.org robots.txt could not be read from the box (challenge) or via WebFetch (timeout).
- **Ανέμη (anemi.lib.uoc.gr):** on 2026-10-29 the box got a TLS chain error (TLS checks were not turned
  off), and robots.txt and `index.tkl?verb=Identify` (OAI-PMH base URL listed in the old OAI registry)
  returned "Προσωρινή Διακοπή Υπηρεσίας / Service Temporarily Unavailable". No new connector was written;
  the existing `anemi_public` connector is unchanged. Re-check the OAI-PMH endpoint when the site is back.
- **Namesakes:** `Milo` also matches people, Venus de Milo and Cicero's *Pro Milone*. Check `coverage`
  and titles before trusting a hit.

Live smoke test (2026-10-29, `Milo Cerigo --demo-key --rows 25`, aliases on, 1450–1900), unique records
returned (catalogue totals for the bare name in brackets):
Gallica Milo 46 (108), Cerigo 54 (55); Europeana Milo 97 (243), Cerigo 101 (194);
HathiTrust Milo 29 (IA 113), Cerigo 13 (IA 9).

Tests: `PYTHONPATH=tools/connectors python3 -m unittest tools/connectors/test_open_collections_extra.py`
(recorded fixtures, no network; see `tools/fixtures/open_collections/README.md`).
