# JARVIS Intelligence Chamber — Independent V0

A standalone, from-zero visual experiment exploring APEX-level cinematic composition with EVE Online star-map navigation mechanics. This is **not** V5 or an adaptation of V5. V5 and the stable Command Center remain unchanged.

## Open

Navigate to `jarvis-intelligence-chamber/index.html` using a static HTTP server, or open its published GitHub Pages path if your Pages deployment publishes the repository root. It uses relative paths and no external JavaScript frameworks. Google Fonts is optional and requires internet access.

## Controls

- Drag to orbit the spatial constellation
- Scroll / + / − to zoom
- Select a node to open its informational dossier
- Focus to navigate towards the selected node
- Reset camera
- Left menu: preset focus zones

## Deliberate constraints

- This is a **visual proof of concept**: it does not dispatch jobs or show historical evidence.
- All agents, their positions and links are illustrative topology; no geographic coordinates, historical routes, or verification claims.
- The scene uses a custom Canvas 2D painter with 3D camera projection. It is **not** WebGL/Three.js, and does not reproduce the APEX particle shader or EVE's renderer.
- No APEX copyrighted source code was copied into these files.
- MIT-licensed APEX-UI code was studied as a technical and art-direction reference: https://github.com/RubenM1990/APEX-UI
- Inspired by EVE Online's navigable maps: https://www.eveonline.com/new-eden-map

## Quality gate

1. Syntax check `node --check chamber.js`
2. Serve and interact with the page in a desktop browser
3. Review screenshot/recording side by side with APEX and EVE reference
4. Test performance, contrast, interaction and mobile
5. Only after visual sign-off consider transitioning to GPU-based Three.js/WebGL renderer and connecting to real JARVIS data.

**No claim of APEX-level visual parity is made by this initial implementation.**
