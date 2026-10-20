# Historical Map Research Phase 2 — NABOU//X

## Actual scope / scientific status

This phase extends the *working* Historical Map Lab. It does **not** install
Minnesota mapKurator model weights and does not claim successful historical
georeferencing of François Ollive's 1662 Aegean portolan. The original source
image is available with SHA-256 audit; **no independently approved GCP set**
has yet been supplied. The browser's manually captured points are marked
`GCP_PROPOSED_NOT_VERIFIED`.

The existing `chamber.js`, `gpu-field.js`, 3D camera, zoom, renderer and
Mediterranean map were **not modified**.

### A. Better reading, not automatic truth

```bash
python3 tools/historical_map_multiangle_ocr.py \
 --image /local/ollive-1662-original.jpg \
 --out /secure/review/ollive-rotations-unlocated.json \
 --source-id commons:1662-ollive-aegean-dardanelles \
 --source-url 'https://commons.wikimedia.org/wiki/File:1662_Portolan_chart_of_the_Aegean_Sea_and_the_Dardanelles_by_Fran%C3%A7ois_Ollive.jpg' \
 --rights 'Public Domain Mark 1.0 / original BnF Gallica' \
 --title 'Ollive Aegean and Dardanelles 1662' \
 --year 1662 --language fra --angles 0,90,270
```

Local Tesseract examines the original image under three orientations,
maps word rectangles back to the exact source-pixel coordinate space, removes
overlapping duplicate detections and produces an unlocated OCR JSON file
compatible with the human-review UI.

The real image is being processed in GitHub Actions. **A higher candidate
count is NOT higher historical reading accuracy**. Source-reader review and
a labelled benchmark dataset remain necessary. No paid APIs.

### B. Georeferencing with genuine held-out points

Open the published `historical-map-review.html` with the source image and
the matching raw/multi-angle OCR JSON. Select reliable, widely distributed
landmarks on the source map, supported by modern place coordinates and an
independent HTTPS reference. Export human review JSON. Make a scientific split:

- **Control:** 4 or more GCPs fit the affine transformation.
- **Hold-out:** 2 or more entirely independent GCPs measure predictive
  error without participating in the fit. Select hold-outs BEFORE examining
  errors to avoid cherry-picking.
- The original image SHA-256 must match the human-review file exactly.
- The fit uses EPSG:32635 metres and reports training RMSE, held-out RMSE,
  maximum held-out error and per-point errors.
- Ill-conditioned/control-clustered fits are rejected.
- Results are *candidates*. Period portolans may have local distortions
  incompatible with one affine fit.

```bash
python3 tools/historical_map_georeference.py \
 --review /secure/review/nabou-portolan-human-review.json \
 --image /secure/source/original-ollive-1662.jpg \
 --controls gcp_0001,gcp_0002,gcp_0003,gcp_0004 \
 --holdouts gcp_0005,gcp_0006 \
 --report /secure/review/geo-candidate-1662.json
```

No GeoTIFF is exported by default. To create a clearly **UNAPPROVED**
*candidate* GeoTIFF for external inspection, add
`--candidate-geotiff /secure/review/candidate-1662.tif --max-holdout-m 5000`.
This is a user-chosen error guard, **not a scientific approval threshold**.
An operator/historian must review residuals, geospatial distortions,
independent checks and historical evidence before approving any places.

### C. Learning and active research agents

Active `jarvis_specialist_worker.py` results now include
`historical_evidence.historical_map_catalogue` when operator queries
actually concern historic maps/ports/cartography. These are static curated
catalogue leads with links, not a claim of newly executed archive searches,
verified event locations or direct OCR acquisition.

The map learning bridge consumes the source-hash-locked manual review:

```bash
python3 tools/historical_map_learning_bridge.py \
 --review /secure/review/nabou-portolan-human-review.json \
 --image /secure/source/original-ollive-1662.jpg \
 --output /secure/review/nabou-map-learning-staging.json
```

The above is **DRY RUN ONLY**: it does not save anything in NABOU memory.
Only corrected OCR readings with named/timestamped human review are exported;
they retain pixel source locators and explicit unresolved-place status.

Adding `--save-staging --memory data/naboux_memory.json` explicitly
writes to a *separate* `map_review_staging` collection, never to verified
PDF chunks, named entities, historical event attestations or live Plesk.
This action is never performed automatically.

### D. What still blocks historical proof / production

1. **Original map expert GCPs:** Need actual reviewed locations from the
   1662 chart and independent coordinates; this integration creates no
   fictional georeference. Field review and residual analysis must be done.
2. **University mapKurator model:** Still not installed or benchmarked
   against handwritten Greek, Italian, Latin and French labels.
3. **WHG credential:** Explicit user-owned WHG token is still required for
   the provider's real reconciliation endpoint; never place it in Pages.
4. **Plesk:** Source code, unit tests and GitHub Pages deployment are not
   proof that production Node API routes/database migrations are installed.
5. **End-to-end source → reviewer → accepted historical event:** This is
   still unverified. A corrected map label is NOT a verified place identity.
6. **Geographic layer:** The live 3D renderer is intentionally untouched.
   Unreviewed map labels are NOT plotted as confirmed pirate bases.

### E. Tests

```bash
python3 -m unittest -v \
 tools.test_historical_map_georeference \
 tools.test_historical_map_multiangle_ocr \
 tools.test_historical_map_learning_bridge \
 tools.test_historical_map_agent_bridge
```

GitHub CI additionally runs Tesseract against the genuine public-domain
1662 chart and stores result artifacts including image SHA-256.
The georeference unit tests rely on explicitly **SYNTHETIC** point pairs
instead of claiming real cartographic ground truth.

Technical heritage:
- Minnesota mapKurator (OCR/map-name matching output architecture).
- Pittsburgh World Historical Gazetteer (candidate reconciliation).
- Leiden maritime chart georeferencing (historical archival methodology).
- Stanford ORBIS (historical route-network methodology only, no Roman
  travel times or routes imported into 17th-century sea research).
