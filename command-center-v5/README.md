# JARVIS Research Network — V5 experimental preview

Isolated React/Vite preview implementing a source-driven immersive agent network, reusing MIT-licensed APEX-UI components by Ruben Mouradian / Reznikov Engineering.

The APEX UI code used here is located in src/vendor/apex/. Its MIT license is copied as APEX_LICENSE.txt. Original community credits are kept in APEX_CREDITS.md, although the two 21st.dev community components are *not bundled* in this preview.

Reused components: ReasoningWeb.jsx (modified to accept real JARVIS agent identifiers and suppress ambient implied work when idle), ApexOrb.jsx (original SVG orb), ApexCore3D.jsx (original WebGL particle core, decorative and error bounded), apex-orb.css (original CSS).

No private APEX agent backend, APEX personas or fictional sample dataset was imported. The data shown is read-only, loaded from our real JARVIS backend and durable snapshot ../command-center/live/latest.json.

A graph pulse means replay of an actual logged event, NOT that the agent is currently running. Graph links represent research topology, not historical shipping routes. The system displays unknown and unverified accurately. Human review writes are deliberately unavailable.

Existing production Command Center and Atlas data remain untouched.

Local: cd command-center-v5 && npm install && npm run dev

Deployment: GitHub Pages builds Vite and stages dist under /geraki-historical-atlas/command-center-v5/.

Source: https://github.com/RubenM1990/APEX-UI (MIT).
Copyright © 2026 Ruben Mouradian, see bundled license.
