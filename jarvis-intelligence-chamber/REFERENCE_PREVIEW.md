# Approved-reference design preview

Entry: `reference-preview.html`. This is a separate interactive design preview,
reproducing the user-supplied NABOU screenshot. The current research workspace
remains the production application.

The map and engraving/ruins assets are generated illustrations based on the
approved reference. They are not geographic measurement data, archival images,
verified historical borders or historical evidence. Marker positions are visual
anchors on that illustration, not a replacement for the canonical geographic
projection. The sample Algiers authority/role and regional Ottoman label reproduce
the supplied design; the Sources dialog explicitly identifies them as sample
content requiring historical documentation. Other city facts are left unverified.
The drawn Lantzas route is labeled as Book III narrative, not maritime trade data.
The visual scale belongs to the design sample and must not be used for distances.

Zoom, pan, layers, port visibility, ordered year range, accent-insensitive city
search, cards, dialogs and mobile controls work. Actual research snapshots can
supply linked sources. Links accept HTTP(S) only. Library, sources, research and
N7 navigation open existing functionality. Opening a research action passes the
place, years and topic to `reference-handoff.js`, which prepares an editable query
without dispatching it. Notifications use actual snapshot events; the person icon
opens workspace navigation and does not imply an authenticated profile.

Test: `node reference-preview.browser.test.cjs` (Playwright). The suite isolates
external traffic and verifies controls, source disclosure, safe links, mobile
layout and research handoff without production dispatch. Screenshot artifacts are
saved to `NABOU_SCREENSHOT_DIR` when set.
