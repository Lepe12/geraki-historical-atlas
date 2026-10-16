# Full-text discovery before catalogue triage

`tools/fulltext_discovery.py` runs in the travellers lane after repository discovery and before candidate ranking. A name absent from catalogue metadata can therefore still produce a source lead from the book's contents.

Two actual search paths are used:

- Internet Archive Full Text: the public endpoint and Lucene mode used by the upstream `internetarchive` Python client, `internetarchive/search.py`, `_full_text_search`. Highlights are kept separately; snippets from different pages are never joined as evidence of co-occurrence.
- IIIF Search API: the search service declared in a registered or discovered book's manifest. The source pool consists of current request source leads, discovered manifests and previously registered `acquisition_requests/*.json`. No test author, actor or book ID is embedded in the engine. IIIF annotation canvas IDs are mapped through that same manifest's actual page labels. An index page number from IA is not treated as a printed page.

Greek transliterations and limited spelling/inflection alternatives are explicitly **query hypotheses**, not attested aliases. A possible person match requires a capitalized name and place in the same nearby passage, plus requested role vocabulary where supported. Results stay `POSSIBLE_TARGET`, `original_inspected: false`, `verified: false`. A modern retelling is not automatically independent corroboration or a contemporary source; publication year is displayed separately.

The search is bounded: four IA queries with five indexed hits each; up to six available manifests and six query terms per manifest, with a shared 150-second budget. Unavailable services, malformed responses and exhausted budgets are recorded. This does not claim exhaustive corpus coverage. OCR can miss or corrupt names, and transliterations do not cover every historical spelling.

The complete report, query provenance and available page OCR are preserved under `fulltext_discovery/` in the existing durable run evidence. Results enter the existing discovery inventory, acquisition ranking and Command Center snapshot; no second database or backend is introduced.

Regression controls: `PYTHONPATH=tools:tools/orchestrator python3 -m unittest tools.test_fulltext_discovery`. The live positive control uses a source already registered by the project and must return a real OCR passage and manifest-mapped page, rather than a catalogue name match. A control success never sets historical claims to VERIFIED.
