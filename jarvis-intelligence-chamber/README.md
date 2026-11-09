# NABOU//X research workspace

The active page is `index.html`. A labelled navigation rail opens Network, Researchers, My Research, and PDF Review. On smaller screens it becomes a labelled horizontal navigation row. The research composer has a separate reserved area; content panels scroll independently above it. Previous-run selection, sorting and export live inside My Research rather than duplicate navigation destinations.

The existing scene is preserved: `chamber.js` draws the projected network and `gpu-field.js` adds its WebGL atmospheric layer. This redesign does not change those renderers or the existing dark, cyan and gold palette. `world3d.js` and the other experimental shells are not loaded by this page.

Serve the repository over HTTP and open `/jarvis-intelligence-chamber/`. `file://` cannot load the ES modules reliably. The live bridge retains its existing HTTPS backend and durable snapshot fallback. The header distinguishes recorded data from connection state. A rendered scene or successful transport never establishes historical verification.

PDF review still requires explicit acceptance before saving knowledge. Dispatch and PDF persistence require their existing backend; this shell does not add credentials or change authorization.

## Validation

Use Node with Playwright available. An existing Chromium can be selected with `JARVIS_BROWSER_EXECUTABLE`:

```sh
node --test jarvis-intelligence-chamber/live-bridge.test.cjs
JARVIS_BROWSER_EXECUTABLE=/usr/bin/chromium node jarvis-intelligence-chamber/startup-feedback.test.cjs
JARVIS_BROWSER_EXECUTABLE=/usr/bin/chromium node jarvis-intelligence-chamber/workspace-layout.test.cjs
```

The workspace test uses synthetic transports, checks desktop/tablet/mobile layouts, navigation, filters, researcher focus, PDF empty state and dispatch failure recovery, and asserts that navigation, panels and composer do not overlap. Set `NABOU_SCREENSHOT_DIR` to an output directory to save screenshots. It never dispatches production research or writes knowledge.

## Research history and overview

Findings starts with a deterministic overview of recorded related references, claims, recorded contradictions and access blockers. These counts do not establish verification. Empty, active, completed and disconnected states have separate messages.

Previous research is searchable by topic or run number. The shared catalogue is `command-center/live/index.json`, generated from the durable `runs/*.json` snapshots. The snapshot publisher and Pages staging regenerate it automatically. Refresh it locally with:

```sh
python3 -B tools/orchestrator/build_research_history.py
```

The browser also remembers the 50 most recently viewed runs locally. If the catalogue is unavailable, the interface labels that limited fallback and offers retry; it does not claim to show all research. The complete catalogue stays searchable, with at most 100 matching rows rendered at once. A catalogue selection uses the existing per-run live/snapshot transport.

Mobile label layout is handled by `network-labels.js`; labels are enlarged, kept within the viewport, and culled when they overlap controls or each other. The scene renderer is unchanged. All researchers remain available in the labelled directory.

Additional checks:

```sh
python3 -B tools/test_research_history.py
node --test jarvis-intelligence-chamber/research-overview.test.cjs
JARVIS_BROWSER_EXECUTABLE=/usr/bin/chromium node jarvis-intelligence-chamber/research-flow.test.cjs
```

The flow test covers accepted dispatch, rejection of an unrelated run, progress, completed findings, history selection and persistence after reload against controlled browser transports. It does not certify production backend access or execute a real research job.


## One page per research run

«Η έρευνά μου» is the single run workspace. It contains the original question and period, a summary, per-agent work progress, pending review/access blockers, source findings with explicit page/excerpt availability, and chronological updates. In-page navigation jumps between these sections without changing research selection. The old separate Activity destination is removed; the network and researcher directory remain available for exploration.

Each selected run has a `?run=…` permalink, including after history selection or accepted dispatch. Pending/failed loads clear the previous dossier. Expanding progress or older updates is preserved when the same run receives an update, and reset when another run is selected. Unknown source pages, timestamps and progress percentages stay explicitly unavailable.

```sh
node --test jarvis-intelligence-chamber/research-dossier.test.cjs
```

### Professional atlas presentation

`professional-atlas.js` / `.css` add the NABOU dark/gold interface, geographic
place markers, searchable place list, ordered date range, source card, and mobile
layer drawer. They reuse the existing Natural Earth Mercator projection and the
existing 2D controls / WebGL extension API. Canonical renderers and world geometry
are unchanged. Researchers and nautical construction lines are optional layers.

`assets/nautical/terrain/professional-relief.png` is derived from the existing
NOAA ETOPO1 elevation raster (public domain, DOI: 10.7289/V5C8276M), using
`python tools/build_professional_relief.py` (NumPy and Pillow). It has the same
geographic extent and is clipped to the existing land geometry. It is a shaded
physical surface, not a historical territorial reconstruction. Place coordinates
are approximate city reference points; Chania and Candia/Heraklion are separate.

Dates scope the research prompt and dated source matches. Undated search results
can remain visible and require verification. Authority and port role are never
inferred from coordinates. The harbor illustration is explicitly illustrative.
Source cards use the selected research snapshot, restrict links to HTTP(S), and
make no automatic verification claim. The N7 button opens the existing assistant.

Verification: `node professional-atlas.browser.test.cjs`, `node atlas-pages.test.cjs`
and `node workspace-layout.test.cjs` (Playwright). Tests isolate external requests
and never dispatch production research.

Reference-style revision (preview): the 2D surface now uses a separate 1800×1105
16-bit elevation grid, resampled directly from the NOAA ETOPO1 2-arcminute source.
Its provenance, encoding, source query and source-grid hash are recorded in
`assets/nautical/terrain/mediterranean-elevation-2min.json`. Rebuild with
`tools/resample_professional_elevation.py <downloaded.csv>`, then
`tools/build_professional_relief.py`. Land colors, engraved elevation bands and
paper grain are illustrative styling; sea shading follows actual bathymetry.
Neither is historical territorial evidence. The original WebGL heightmap remains
unchanged. Desktop opening composition uses the existing wheel handler with a small zoom-out
gesture; all pan, zoom, clamps and geographic projections remain canonical.
