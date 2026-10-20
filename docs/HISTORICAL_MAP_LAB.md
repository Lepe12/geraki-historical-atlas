# NABOU Historical Map Lab — university technology pilot

This is a **real** isolated map-label visualization and WHG candidate pipeline,
not an installation of the Minnesota mapKurator ML model. The 3D core remains
unchanged. It does not infer historical events, pirate bases or sea routes.

## University research heritage

- **University of Minnesota, mapKurator** — georeferenced map labels as GeoJSON
  polygons, OCR labels, post-OCR labels and external entity suggestions:
  https://github.com/knowledge-computing/mapkurator-system
- **University of Pittsburgh, World Historical Gazetteer** — scoped
  reconciliation suggestions, with provider attribution and human approval:
  https://docs.whgazetteer.org/content/technical/apis.html
- **Leiden, historical map georeferencing** — methodological basis for keeping
  image-to-earth transformation separate from historical identity resolution.
- **Stanford ORBIS** — route analysis is **future work**; no Roman-era travel
  network is imported or claimed valid for 17th-century shipping.

No third-party model weights/datasets are bundled. The MIT-licensed upstream
code and restricted datasets have separate licensing requirements; consult
source terms before importing real output.

## Import labelled, pre-georeferenced historical map data

Obtain the map source, rights and GeoJSON exported with geographic **WGS84**
longitude/latitude coordinates. Scan-pixel or projected metre geometries are
NOT accepted; perform and verify georeferencing beforehand (e.g. QGIS/GDAL).
The input may contain `text`, `postocr_label`, `score` and `osm_id`
mapKurator-style properties.

```bash
python3 tools/historical_map_intelligence.py import-labels \
  --input /path/to/mapkurator-georeferenced.geojson \
  --output /path/to/nabou-historical-features.geojson \
  --map-source "institution:collection:map-id" \
  --source-url "https://institution.example/item/123" \
  --rights "REPLACE_WITH_ACTUAL_SOURCE_RIGHTS" \
  --title "REPLACE_WITH_DOCUMENT_TITLE" \
  --crs EPSG:4326 --start-year 1650 --end-year 1700
```

This command does **not** run OCR, AI label spotting or re-georeferencing.
`start-year` and `end-year` are map/source dating hints, not claimed
lifespans of towns. The script does not create exact quotations or verified
attestations.

## Optional WHG reconciliation (operator/server only)

Create your personal WHG API token in your WHG account. Keep it in a local
secret store or server environment; NEVER in GitHub Pages, commits or web UI.

```bash
export WHG_API_TOKEN="..."  # insert privately, not in shared logs
python3 tools/historical_map_intelligence.py reconcile-whg \
  --input /path/to/nabou-historical-features.geojson \
  --output /path/to/nabou-whg-candidates.json \
  --namespaces whg,gn
```

This sends **only place labels and temporal query hints** to WHG, no uploaded
document bytes. WHG may have rate limits, token requirements, and source-specific
licences. The candidate output retains the response's attribution. Matching
scores measure text/relative match quality, NOT historical identity.

## Use in NABOU

Open `jarvis-intelligence-chamber/historical-map-lab.html` or from **Η έρευνά μου
→ Ευρήματα και πηγές → Ιστορική χαρτογραφία — Map Lab**. Import the normalized
GeoJSON, optionally the WHG candidate file. Files are parsed **locally in your
browser**; uploaded data is not saved back to the server.

Maps display label-footprint geometries only, not verified places. The initial
map intentionally has no claims or plotted historical places until a real,
properly attributed dataset is supplied. Search/year filter and feature details
work without WHG credentials. The coastline uses Natural Earth world-atlas
loaded from the public jsDelivr CDN; offline the GIS grid still renders.

## Validation

```bash
python3 -m unittest tools.test_historical_map_intelligence -v
node --test jarvis-intelligence-chamber/historical-map-core.test.mjs
```

Before declaring "end-to-end historical map intelligence":
- Inspect a real 17th-century maritime map and confirm the IIIF/map provenance.
- Produce correct EPSG:4326 map-text label polygons through a reproducible
  georeferencing + OCR / mapKurator run with permitted models.
- Validate OCR accuracy on Greek/Italian/French/Latin cartography.
- Obtain WHG access and evaluate candidates with source/contextual review.
- Test the deployed Pages lab including real loaded files.
- Integrate approved identity relations with NABOU Evidence Layer & GIS; never
  automatically promote candidate places to historical claims.
- Test temporal marine route analysis on period-appropriate navigational
  evidence, not the Stanford ORBIS Roman network.
