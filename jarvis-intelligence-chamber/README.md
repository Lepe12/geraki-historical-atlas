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
