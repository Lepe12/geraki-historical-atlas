# NABOU — real 17th-century map source + local historical-map OCR

## Confirmed authentic source

**Jean André Brémond, _Portolan atlas of the Mediterranean Sea and western
Europe_, 1670**, Library of Congress Geography and Map Division,
LCCN 2005634040, catalogue: https://www.loc.gov/item/2005634040/.
The archival record advertises IIIF; however, catalogue verification **does
not** mean the raster or IIIF manifest was downloaded or georeferenced.
Provenance record: `data/historical-map-sources/loc-2005634040.json`.

Run the **source access probe**:
```sh
python3 tools/historical_map_source_probe.py --out /tmp/loc-portolan-iiif.json
```
The report distinguishes confirmed IIIF metadata from HTTP/network blocks.
The candidate LoC URL may be stale or blocked; never invent scans or locations.

## Real offline, no-fee OCR fallback: Tesseract

This is a **real** OCR executable applied to GeoTIFF pixels, not the
University of Minnesota's mapKurator ML model. Set up on a local machine:
```sh
# Debian/Ubuntu (one-time):
sudo apt-get install tesseract-ocr tesseract-ocr-eng tesseract-ocr-fra
python3 -m pip install rasterio pyproj pillow
```
Additional trained language files, e.g. `ell` / `ita`, may be required for
Greek and Italian maps; mapKurator's existing English labels dataset must
not be assumed multilingual.

The input **MUST** be correctly georeferenced in advance with honest human
ground control points using QGIS/GDAL, saved as GeoTIFF with meaningful
transform/CRS. An unreferenced LoC image is NOT valid input to spatial plotting.

```sh
python3 tools/historical_map_ocr.py \
 --geotiff /secure/sources/br%C3%A9mond-1670-georeferenced.tif \
 --output /secure/review/bremond-ocr-unreviewed.geojson \
 --map-source "loc:2005634040" \
 --source-url "https://www.loc.gov/item/2005634040/" \
 --rights "CHECK_ITEM_SPECIFIC_RIGHTS" \
 --title "Brémond, Portolan Atlas of Mediterranean Sea and Western Europe (1670)" \
 --languages fra --start-year 1670 --end-year 1670
```

The output has original image SHA-256, map footprint polygons, OCR score and
explicit unverified status. Neither a high OCR score nor polygon location
establishes historical correctness. A label's polygon is its image-text
footprint, not a settlement geometry or archaeological site. Period is
**map date**, not place lifespan.

After the local researcher reviews labels, optional WHG matching can run
with a personal API token from https://whgazetteer.org (never in UI/commits):
```sh
WHG_API_TOKEN='<local private token>' python3 tools/historical_map_intelligence.py reconcile-whg \
 --input /secure/review/bremond-ocr-unreviewed.geojson \
 --output /secure/review/bremond-whg-candidates.json
```
Alternatively use the independent mapKurator output adapter from
`tools/historical_map_intelligence.py import-labels` when georeferenced
mapKurator output exists and its dataset/model licence allows use.

**Oct 2026 WHG guidance:** historical start/end are hard API filters; for old
maps they often exclude contemporary-indexed place records. We now retain
map time context in source metadata without passing the years as hard WHG
filters. Human review must still check historical time compatibility.

Finally, open the `historical-map-lab.html` viewer and upload the resulting
GeoJSON (and optionally candidate JSON) from your device. Nothing is
silently saved to NABOU's verified memory.

## What's implemented vs genuinely unfinished

Implemented: offline Tesseract OCR over a real georeferenced raster,
source-bound OCR polygons with provenance, candidate matching transport,
browser review display, tests with a real Tesseract execution on explicitly
synthetic GeoTIFF data, and a genuine 1670 archival source **catalogue**.

Unfinished/blocked:
- Acquiring the **original** 1670 IIIF canvas images if LoC blocks automated
  access; the source probe is authoritative about its own HTTP attempt only.
- Georeferencing the original scan with expert-reviewed ground control points.
- Running and benchmarking the university mapKurator spotter models against
  Italian/Greek/French script; no third-party model weights are installed.
- Real WHG reconciliation without operator-owned token.
- Historian review of individual labels, page regions and place identities.
- Promotion to NABOU evidence database **only after** source inspection and
  approval, not a blind GeoJSON import.
- Production Plesk integration is separate from GitHub Pages deployment.

**No invented labels, geographic coordinates, archive scans, pirate bases or
verified maritime routes are included with this feature.**
