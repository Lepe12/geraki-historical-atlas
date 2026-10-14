# JARVIS Intelligence Chamber — Independent 3D experiment

New, independent visual application in `jarvis-intelligence-chamber/`, NOT based on V5. Existing stable Command Center and V5 are untouched.

## Rendering

The active page uses `world3d.js` with **Three.js 0.184.0** loaded as an ES module from esm.sh. It creates a genuine WebGL 3D scene: PerspectiveCamera, physically spatial agent nodes, Three.js point-cloud particles, orbit rings, curved links with traveling event markers, fog, additive glow sprites, interactive raycasting and smooth orbital navigation. Desktop and mobile share the same camera system.

Older `chamber.js` and `gpu-field.js` have been retained as non-active experiments only; **index.html does not load them**.

## Explore

Serve the folder over HTTP; opening through file:// may block remote modules. Drag to orbit; wheel to zoom; click a node to read its visual concept dossier; focus selected; reset camera. The interface uses illustrative agent categories and does NOT claim live runs, scientific validation, or historical geography.

## Verification status

Source changes and GitHub write confirmations verified. A real browser interaction/rendering test **has not yet passed** in this session (external asset fetching was unavailable). Do not call the result production-ready or APEX-quality until Chromium visual inspection and performance review have been performed.

## Reference and licensing

Original UI implementation; no APEX source code embedded in world3d.js. Technical inspiration: https://github.com/RubenM1990/APEX-UI (MIT). Spatial navigation inspiration: https://www.eveonline.com/new-eden-map. EVE's world positioning is *not* used for historical places.
