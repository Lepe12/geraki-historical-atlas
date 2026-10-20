# NABOU 1662 portolan: human OCR reading and control-point workflow

## What is genuinely implemented

In the **published NABOU Historical Map Lab**, follow the link to
`jarvis-intelligence-chamber/historical-map-review.html`. The browser
supports two **local-only** inputs:

1. Original JPG/PNG (same bytes as the exact OCR source scan, max 35 MB).
2. `nabou-unlocated-historical-map-ocr-v1` JSON from the real GitHub Actions
   1662 François Ollive / Aegean portolan OCR artifact.

The browser cryptographically compares SHA-256 over the uploaded original
image bytes against `source.image_sha256` in the OCR JSON. If they differ,
no review or GCP actions are allowed. A locally loaded image is not uploaded
to NABOU's production backend or the public Pages server.

Every OCR label is drawn as a **pixel bounding rectangle** directly
over the original. Search, minimum-confidence filtering, zoom, pan,
previous/next navigation and individual operator transcription decisions
are supported.

Accepting a corrected text reading **does not** approve a historical place
identity. Rejections are retained. Reviewer and timestamp are recorded in
exported JSON, which remains `historically_verified:0`.

### Manual GCP capture (not automatic georeferencing)

Choose **Σημείο ελέγχου**, click the feature in the source image, then add:

- Pixel X/Y (from the exact source raster)
- WGS84 longitude/latitude entered by an operator
- A feature/place description
- Independent HTTPS reference for the coordinates
- Reviewer

Each saved GCP has `state:GCP_PROPOSED_NOT_VERIFIED`.
Click **Εξαγωγή GCP για QGIS** to download a CSV; QGIS is responsible for
checking projection, residuals, distortions and ground control quality.
The output **is not** an automatically georeferenced historic map.
Do not use the GCP output as a place-geometry or route claim.

### Reference authentic source

- François Ollive, 1662 *Aegean Sea and Dardanelles*, originally BnF Gallica
  `btv1b59010993`, Wikimedia Commons public-domain scan. The authentic
  OCR run 39384731803 produced **527 raw snippets**, most need careful
  proofreading; they are not 527 identified place names.
- Source image and OCR can be downloaded from
  GitHub Actions artifacts, or from the attached files in the initial NABOU
  conversation. The review page intentionally does not bundle or re-upload
  the authentic source bytes.

## How to validate

```sh
node --test jarvis-intelligence-chamber/historical-map-review-core.test.mjs
node jarvis-intelligence-chamber/historical-map-review-browser.test.cjs
```

The browser test uses an explicitly **synthetic** 1-pixel image, not a
fabricated historical map, and checks SHA-256, reading correction, an
unverified GCP and local JSON export. It runs inside the existing
3D Visual Gate to catch UI regressions without touching `chamber.js`,
`gpu-field.js`, the camera, GPU renderer or Mediterranean map core.

## Still required for true historic georeferencing

- Expert identification of 4–10+ ground control points distributed across
  the 1662 portolan, each supported by independent geographical evidence.
- Quantify geographic distortion: an affine fit may fail on a portolan, and
  control points must be assessed for deformation; use QGIS/GDAL warping and
  independent hold-out checks.
- Review the OCR manually; handwritten slanted/place labels remain difficult.
- Only after a scientifically defensible georeference, create WGS84 place
  **candidates** and reconcile with WHG using the user's token.
- Operator decision, provenance and explicit citation before accepting any
  historical identity into the knowledge graph.
- A backend upload/review protocol has **not** been added here; local JSON
  exports must not be called a persistent memory or Plesk deployment.

No university mapKurator model weights were installed in this change.
