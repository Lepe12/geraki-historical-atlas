# PIRATECARTOGRAPHY — JARVIS V3
## IMMERSIVE HISTORICAL RESEARCH CHAMBER
### Canonical art direction, UX architecture & implementation brief
Version: 1.0 | 2026-10-14 | Status: DESIGN SPECIFICATION — NOT DEPLOYED

> North star: The researcher should feel they have entered a different world, yet be able to establish precisely what was found, where it came from, and whether it is historically justified. Wonder at entry; rigor at every decision.

## 0. Scope and non-negotiable constraints

This is a build-ready design brief, **not** a statement that features already exist. It does not authorize replacing the production UI. Implement in a separate preview branch or route before promotion.

- KEEP the repository Lepe12/geraki-historical-atlas, existing atlas and all research evidence. Do not destroy or replace source data, backend, or the JARVIS orchestrator.
- KEEP geographic accuracy: real vector map / terrain datasets with provenance and attribution; no AI-generated or hand-drawn substitute for coastlines, islands, distances or archival locations.
- KEEP current live API and durable snapshot fallback as distinct data states. Zero/unknown is never silently mapped to a success value.
- KEEP one verified GitHub Pages publisher for the combined atlas + command center; no competing workflows.
- KEEP scientific rules: primary-source preference, catalogue metadata distinguished from original examination, original/independent source genealogy, contradiction checks and mandatory explicit human approval for verified claims.
- No fake archival references, counters, mission progresses, verified statuses, historical events, or map tracks. Demonstration data only in unmistakably marked DEMO mode, not production.
- No credential exposure, public approval endpoint without authenticated authorization, invented confirmation, or silent mutation of historical conclusions.

## 1. Creative concept / the world

Working visual name: **THE ARCHIVE CHAMBER**. Product brand stays **PIRATECARTOGRAPHY · JARVIS**.

Think of an alternate-universe maritime observatory: a research room suspended between 17th-century chartmaking and advanced analytical technology. It has a geographically faithful Mediterranean as its stage, atmospheric depth, subtle brass instruments, illuminated glass surfaces, archival fragments, and sophisticated information projection. The interface belongs to the world; it must never look like a generic admin dashboard with a themed wallpaper.

Reference principles (inspiration, not direct visual cloning):
- Perception / Iron Man 2: spatial clarity and cinematic information choreography — https://www.experienceperception.com/work/iron-man-2/
- Star Citizen ARK Starmap: the map is a navigable environment, not an image in a card — https://robertsspaceindustries.com/en/starmap
- NASA Eyes on the Earth: immersive 3D tied to real geospatial/scientific data — https://eyes.nasa.gov/apps/earth/
- Ideum Command Center: responsive, interactive layers, not nonfunctional VFX — https://ideum.com/portfolio/command-center-of-the-future
- Fraunhofer OPZ: human-centered operational picture and decision support — https://www.fkie.fraunhofer.de/en/departments/mms/opz.html

Art direction: restrained cinematic grandeur, not neon saturation, steampunk cliché, pirate skulls, clutter, fake AI or historical fantasy presented as factual research.

## 2. Visual identity / design tokens

### Palette (initial specification; contrast validation required)
- Abyssal background: #040D15 (primary immersive background)
- Deep maritime glass: #0B2230 (panels, 88–96% opaque where text overlays imagery)
- Copper-brass: #CBA76A (interactive focus, selected items and precision ornaments)
- Sea-glass teal: #5FC6C6 (links, geographical highlights and active routes)
- Archival ivory: #E9DFC9 (body text and document panels)
- Slate secondary: #A9BCC4 (supporting text)
- Verified green: #73C79C **only after explicit gate passes**
- Conflict vermilion: #DA7667 (contradictions, blocked actions)
- Review amber: #E4B66A (review needed / cannot claim verified)

Never use brass for every border or glow. Decorative glows should be sparsely applied to consequential objects only. Color must not be the sole status carrier.

### Typography
- Editorial heading font: elegant serif family (e.g., Cormorant Garamond or Cinzel used sparingly, font licensing/load performance checked).
- Functional text: accessible UI sans (e.g., Inter or system sans).
- Archival text: legible reading font; never use ultra-thin serif for source transcriptions.
- Desktop UI body: minimum 14px, normal content 15–16px, evidence text 16–18px, section heading 20–28px; map labels readable by zoom and density.
- No 9px mission-control microtext as primary information. No information critical to scientific evaluation rendered solely on a glowing background.

### Material, composition and iconography
- Textured dark glass with subtle light falloff, fine etched brass, parchment accents confined to evidence reading surfaces.
- Archival thumbnail types: manuscript, correspondence, map, catalogue page, seal. Each image requires a real asset plus source/license metadata; absent image => clean no-image state.
- Icons: locally consistent 20/24px family; distinct signs for archive, port, fort, town, ship, agent, source, uninspected original, verified original, contradiction.
- Avoid highly detailed visual decorations over geographic coastlines or obscuring selected claims.
- Live scene may use fog-of-depth and soft parallax, but true map base must remain legible.

## 3. Information architecture / immersive spaces

Design as five focused operational spaces, not five pages of unrelated boxes.

### SPACE A — ARRIVAL / PORTAL
Purpose: first impression and frictionless entry.

- Geographically accurate Mediterranean visible immediately, from a cinematic oblique perspective (not fake geometry).
- Subtle light travels over existing coastlines and archival nodes. JARVIS glyph awakens to STANDBY / LIVE / OFFLINE — matching actual connection.
- Product heading: Piratecartography; subtitle: The Historical Intelligence Chamber.
- Primary call to action: **Νέα έρευνα**. Secondary: **Συνέχεια τελευταίας έρευνας** if a real run exists. Third: **Εξερεύνηση Άτλαντα**.
- Portal intro limited to <= 1.5 seconds and skipped automatically for repeat navigation; immediate Skip / Enter action; honor reduced-motion. Never block access to search.
- No automatically populated discoveries unless backed by a production data source.

### SPACE B — THEATER MAP / EXPLORE
Purpose: geospatial exploration and orchestration.

Desktop target at 1440 × 900:
- Main navigable terrain/map uses roughly 65–75% of available visual area (not just 35% between two permanent sidebars).
- Top overlay: elegant product bar; search; active research target/date span; modes as compact navigation.
- Left floating, collapsible **Mission Dock** (approx. 300px expanded): target, period, research command, run identity, agent status, clear real connection state.
- Right **Context Dock** (approx. 340px expanded) appears when selecting a historical event, place, archive, source or agent. No permanently empty static rail.
- Bottom slim **Chronology Deck** / time scrubber (only when dated historical records exist). A second **Evidence Tray** opens on request.
- JARVIS core is a compact ambient instrument anchored outside map center, never a giant ornament hiding Sicily, Crete or the Aegean.
- Archives map layer: use documented headquarters/reference city points; never pretend the dot is the location of a historical event.
- Historic locations: stored authoritative coordinates only, with accuracy and source; do not relocate uncertain records.
- Routes: solid for actually documented movement only when supported; dashed for strongly reconstructed; dotted for uncertain/hypothetical. Explicit legend, visible date scope, references and uncertainty.
- User can toggle neutral geographic, relief, archives, documented events, routes, territorial context (when sourced), contradiction hotspots.
- Clicking pin: zoom focus → overview of place/time → linked primary evidence. Never route directly from pin to generic task logs.

### SPACE C — EVIDENCE LAB
Purpose: do serious scholarly work without losing atmosphere.

On selection, switch to a reading-first workstation:
- Left panel: source collection, folders, archive & period facets.
- Main pane: high-resolution digitized original (if licensed/available), iiif viewer with zoom/rotation/page references; if unavailable, factual catalogue metadata placeholder.
- Side pane: citation details, exact signatura, stable source URL, provenance, record date, retrieval method, original inspected? by whom? when?, language, transcription, translation, extraction confidence.
- Claim linkage: show sentences claimed, exact evidence fragment/page, independent corroborations, derivative citations and alternate readings.
- Split-screen compare up to 2–3 sources with synchronized highlighting and page references.
- Three explicit content statuses: catalogue record located; digitized document inspected; historical assertion interpreted. These must not collapse to a generic "found."
- Citation export and shareable record location require stable identifiers. Nothing invents a signatura or original content.

### SPACE D — TIMELINE & NETWORK
Purpose: reveal relationships and disputed chronologies.

- True time scale with year markers and range control; events anchored to sourced dates, date uncertainty as range, unknown dates unplaced or clearly floating.
- Network lines connect people, places, ships and institutions only when link is evidence-backed; proposed interpretations rendered distinctly.
- Show provenance on selecting edge, including sources and independent vs derivative source classification.
- Prevent force-directed graph layouts from being mistaken for geographic maps. Separate network visualization from cartographic coordinates.
- Entry pathways: from a chosen event open its timeline and network, never lose researcher context.

### SPACE E — DECISION CHAMBER / HUMAN REVIEW
Purpose: deliberate and auditable decisions.

- Large readable source dossier, not a tiny approval button over an animated world.
- Left: candidate claim in precise Greek, temporal + spatial scope, historical claim type.
- Center: supporting evidence with exact references, cited quotations (within permission), images/original status, source genealogy.
- Right: contradictions, unresolved objections, method checks and decision summary.
- Researcher decisions: Approve (only if gate criteria pass), Reject, Return for More Evidence, Mark Unresolved.
- Backend-only authenticated write; each decision stores who, when, what, rationale, evidential snapshot and previous status. Audit is append-only.
- Default state: CANDIDATE / NEEDS_REVIEW. No automatic VERIFIED. Disabled action explains which requirement is missing. If approval API not present, use READ-ONLY clearly; NEVER display a working Approve control that cannot persist.
- History of revisions and withdrawal visible; verified state reversible via explicit audited decision.

## 4. First-use narrative — concrete walk-through

Test mission: “Μήλος, πειρατικές επιδρομές 1660–1680”.

1. The researcher enters the Chamber, chooses New Research. Geographic map shows the real Milos position and Aegean context without claiming that a raid occurred.
2. A mission drawer asks target, variants, date span and precise research question; users can specify search strategy and archival priorities.
3. JARVIS presents a task plan with which agents/connectors can actually search, which are unavailable/blocked, and reasons. No phantom "17 of 17 active".
4. On explicit submission through a supported, audited backend endpoint the run starts; until then display DRAFT / NOT DISPATCHED. If no endpoint exists, export a draft command but do not claim execution.
5. Discovered catalogue records appear in evidence tray and can be opened. Claim candidates are not automatically promoted.
6. Selecting a sourced event zooms to its documented location only if independently geo-grounded; otherwise “location not established”.
7. The researcher compares contemporary testimony and later secondary repetitions. Genealogy tracks dependence, contradictions stay visible.
8. Decision Chamber shows a final dossier with exactly cited primary evidence and full history of reviewer action.

Success: can answer “What is supported? By which sources? What remains uncertain?” without reading arbitrary backend logs.

## 5. Motion and interaction choreography

- Arrival fade / core awakening 600–1200ms; skip instantly; do not use intro as loading spinner.
- Dock open/close: 180–260ms easing; map never jumps to obscure selection.
- Click to geographical focus: 450–900ms map easing; reduced-motion => 0ms. Preserve selection if fetch is delayed.
- Source card to evidence lab: 250–400ms depth transition, preserving selected record ID and user scroll.
- Connected agent activity: subtle pulse ONLY if live backend reports activity; disconnected => no activity animation.
- Contradiction highlight: one 450ms highlight, not flashing red.
- No fake starfields, arbitrary data particles, or pulsing maps that imply research is happening while offline.
- Motion enhancement must never obstruct reading, keyboard interaction or low-power hardware.

## 6. Components / reusable design system

Named components to implement with real state, semantic controls and focus styles:
1. WorldCanvas — true geospatial basemap, attribution, terrain fallback, zoom + layer manager
2. ArchiveNode — precise category/agent/reference-city distinction
3. MissionComposer — validated research request, explicit Draft vs Submitted
4. MissionDock — run ID, backend status, agent workload and blockers
5. SourceCard — archival reference, source type, inspection status, stable URL
6. EvidenceTray — sourced records, filters, sorted chronology
7. DocumentReader — IIIF when available; metadata-only fallback
8. TimelineScrubber — time-scale, uncertain dates, filtering
9. RelationshipGraph — citation-bearing links, no geospatial ambiguity
10. ClaimDossier — candidate claim, citations, genealogy, contradictions
11. ReviewGate — read-only until authenticated verified backend write + audit
12. PresenceIndicator — explicit LIVE / SNAPSHOT / STALE / OFFLINE / DEMO labels

Components have four states: loading (bounded); empty; error; valid data. No synthetic counters and no silently swallowed failures.

## 7. Engineering mapping from current repo

Current inspected files (2026-10-14):
- command-center/index.html: three-tab top nav; always-visible left and right rails; mission form, geographic map, QA, feed, request dialog.
- command-center/command-center.css: fixed multi-column grid with small text, dark/gold/teal accents, standalone core status.
- command-center/command-center.js: real OpenFreeMap map + DEM, named archive cities, agent rendering; connects to a configured production API and supports durable snapshot fallback.
- docs/JARVIS_ORCHESTRATOR_ARCHITECTURE.md: dispatch, provenance, deduplication, quality gate and audit invariants.

Changes required — DO NOT begin by replacing the basemap or backend:
- Introduce V3 Preview route or branch (e.g. command-center-v3/), retaining command-center/ as stable entry.
- Extract data access into a single well-defined read-only adapter: mission, agents, archive references, evidence, events, claims, blockers, contradictions, provenance and snapshot metadata. Track timestamp and origin for every value.
- Extract WorldCanvas and separate cartographic geometry from agent operational nodes. Restore overlays to absolute correct longitude/latitude only.
- Change CSS from two permanent rails + small center map to map-dominant full-screen canvas with collapsible docks.
- Build Arrival, Map, Evidence Lab, Timeline/Network and Decision Chamber as focus modes; share selection state.
- A context card must link to actual archival record and evidence, not just agent name.
- Add read-only clear placeholders for unavailable DocumentReader / DecisionGate integrations until server functionality is implemented.
- Converge scientific statuses on the canonical JARVIS gate scheme, not UI event keyword detection. No numerical historical reliability % without validated benchmarks and method.
- Define responsive adaptation: desktop has panoramic map, tablet has overlay drawer, mobile defaults to overview and full-screen document reading.
- Stage visual assets with provenance/licensing and performance budget; no remote stock imagery for research claims.

Suggested React/WebGL framework is NOT a requirement: current HTML/CSS/JS + MapLibre can be retained. Introduce new dependencies only to support a documented missing capability, and avoid rewriting durable orchestration to chase appearance.

## 8. Practical acceptance tests (binary pass/fail)

A. FIRST IMPRESSION: at 1440×900 map visually commands 65–75% of central experience; user sees unambiguous primary CTA, real mission status and readable typography. No floating card covers essential geography.
B. GEOGRAPHIC ACCURACY: validate selected known geographic coordinates for Milos, Venice, Simancas and Constantinople/Istanbul against reference baseline, with map marker position and rendered coastline. No hand-imagined shape.
C. NO PHANTOM STATUS: offline and unknown are visible; 0 claims is only shown if backed by an authoritative zero count. Artificial demo cannot be mistaken for real research.
D. RESEARCH FLOW: user can prepare mission Milos 1660–1680, navigate a sourced event to evidence, inspect exact citation/metadata, and follow source genealogy without losing context.
E. REVIEW SAFETY: unauthenticated or unsupported approvals never appear to succeed. Candidate remains candidate until supported explicit reviewer decision is persisted and re-fetched.
F. INTERACTION: map pan/zoom, search, dock interaction, keyboard focus, Escape, modal close and deep linking work on current Chrome/Firefox/Edge.
G. RESPONSIVE: no horizontal content clipping or unreadable UI at 1920×1080, 1440×900, 1024×768 and 390×844. No hover-only essential action.
H. MOTION / ACCESSIBILITY: reduced-motion tested; WCAG AA contrast on task-critical text; zoom 200%; no sensory overload or rapid flashing.
I. PERFORMANCE: usable on ordinary desktop integrated GPU; measure first meaningful rendering, map load and memory; animations drop automatically if rendering lags. Target 30+fps during transitions on baseline machine, not merely on developer workstation.
J. DEPLOYMENT: versioned preview URL, production remains unchanged; build checks, browser screenshots, scripted user-flow test, and provenance smoke tests must pass prior to manual acceptance.
K. SCIENTIFIC QA: original-not-inspected, dependent citations and contradicting records remain visibly unresolved; no automatic verified assertion.

## 9. Implementation phases / acceptance gates

**P0 — Functional baseline + visual foundation**
- Add preview route, snapshot current UX, confirm live and snapshot APIs, test basemap + required geographic fixtures.
- Integrate typography tokens, stage atmosphere, global navigation, accessibility and empty/error states.
- Deliverable: browser-accessible V3 preview and baseline screenshots. No alteration to production route.

**P1 — Theater Map + Arrival**
- Immersive arrival, 65–75% map composition, context-aware side docks, map precision and layer switching.
- Test Milos and archive reference locations.
- Deliverable: real world map scene with no fake results, normal keyboard navigation, mobile fallback.

**P2 — Mission + Evidence**
- Mission draft and real dispatch gate only where backend supports it; evidence explorer, record-level citations, provenance and source reader; stable deep links.
- Deliverable: fully demonstrable real-record-to-evidence user journey.

**P3 — Timeline, Network & Review**
- Linked chronology, explicit speculative edges, contradictions and source genealogy.
- Authenticated human decision flow once server audit endpoint and authorization exist. Otherwise read-only.
- Deliverable: reviewed pilot claim dossier with persistent audit references.

**P4 — Polish + release gate**
- Add subtle audio-free cinematic interaction, prefetch/LOD, mobile and contrast optimization; perform independent UX testing.
- Collect at least 3 researcher walkthroughs: novice, experienced historical researcher, reviewer. Record blockers and time-to-source, not just aesthetic rating.
- Production promotion requires explicit user signoff after preview inspection.

## 10. Do NOT do

- Do not generate a fictional Mediterranean map or transplant artificial islands from image generation.
- Do not replace real archive agents with invented geographically positioned dots.
- Do not present guessed archival references or percentages as verified.
- Do not put a huge spinning “JARVIS” globe on top of the sea and obscure places.
- Do not ship decorative pseudo-buttons for approvals, dispatch or review.
- Do not silently change the historical atlas or the source-of-truth storage.
- Do not claim “complete” from CI green without browser inspection and research workflow checks.

## 11. Definition of done

A researcher enters a world-class immersive Mediterranean research environment, issues or prepares a bounded research task, sees clear live/snapshot/offline truthfulness, drills from a mapped claim to its exact evidence with provenance, examines contradictions, and reaches an auditable human review checkpoint. Every interaction functions in browser. The world is impressive because the real evidence comes alive — not because we filled the screen with fabricated lights.

## 12. Current state / next change

**This specification is the only deliverable in this commit.** The next engineering step is a standalone V3 preview route using the existing MapLibre and real-data adapter. Do not modify the existing public Command Center until a functioning browser prototype has been observed and approved.
