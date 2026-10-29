# Open collections: David Rumsey maps + Internet Archive texts

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
