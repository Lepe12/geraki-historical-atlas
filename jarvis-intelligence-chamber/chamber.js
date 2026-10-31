"use strict";
/* NABOU//X — nautical renderer.
   Replaces the former 3D network with a 17th-century portolan chart (nautical-chart.js).
   The research-state logic (core state, active agents, live feed, focus events, detail panel)
   is carried over unchanged from the previous renderer; only the drawing and navigation changed. */
(() => {
  const C = window.NABOU_CHART;
  const canvas = document.getElementById("universe");
  const ctx = canvas && canvas.getContext("2d");
  if (!C || !ctx) return;
  const $ = (id) => document.getElementById(id);
  const GR = (s) => (window.NABOU_GR ? window.NABOU_GR.status(s) : String(s ?? ""));
  const labels = $("nodeLabels"),
    seals = $("nodeSeals"),
    stage = $("chartStage"),
    host = $("chartView") || document.body,
    plane = $("chartPlane");
  plane.innerHTML = C.svg;
  plane.style.width = C.W + "px";
  plane.style.height = C.H + "px";

  let W = 0, H = 0, DPR = 1, frame = 0, last = 0, fps = 0, hover = -1, selected = -1,
    liveConnectionMode = "OFFLINE", coreState = "IDLE";
  const activeAgentIds = new Set(), eventPulseAt = new Map();
  let pendingVisual = false, pendingRequest = "";
  let view = { s: 1, x: 0, y: 0 }, target = { s: 1, x: 0, y: 0 }, fitScale = 1, viewDirty = true, layoutDirty = true;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- projection (same Mercator as tools/build_chart.py) ---------- */
  const M = (lat) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
  const project = (lon, lat) => ({ x: (lon - C.lon0) * C.k, y: (C.my1 - M(lat)) * C.k });
  const unproject = (x, y) => {
    const my = C.my1 - y / C.k;
    return { lon: C.lon0 + x / C.k, lat: (2 * Math.atan(Math.exp((my * Math.PI) / 180)) - Math.PI / 2) * (180 / Math.PI) };
  };

  /* ---------- lanes: archives at their archive's city, analysis lanes around the Atlantic rose ---------- */
  const archive = (name, agentId, lon, lat, place, desc) => ({ name, kind: "archive", agentId, lon, lat, place, desc });
  const science = (name, agentId, desc) => ({ name, kind: "science", agentId, place: "Τράπεζα ανάλυσης · ανεμολόγιο του Ωκεανού", desc });
  const sectors = [
    archive("Ισπανία", "spanish_simancas", -4.829, 41.594, "Σιμάνκας — Archivo General de Simancas", "Ισπανικά κρατικά αρχεία και διοικητική αλληλογραφία (Archivo General de Simancas · PARES)."),
    archive("Βενετία", "venetian", 12.326, 45.437, "Βενετία — Archivio di Stato di Venezia", "Βενετικές διπλωματικές και ναυτικές αρχειακές συλλογές."),
    archive("Γαλλία", "french", 2.357, 48.857, "Παρίσι — Archives nationales · BnF", "Γαλλικά αρχεία: Archives nationales, BnF / Gallica, Archives diplomatiques."),
    archive("Βρετανία", "british", -0.279, 51.481, "Λονδίνο (Kew) — The National Archives", "Βρετανικά χειρόγραφα, κατάλογοι και ναυτικές πηγές (The National Archives, British Library)."),
    archive("Ολλανδία", "dutch", 4.316, 52.079, "Χάγη — Nationaal Archief", "Ολλανδικές συλλογές και ναυτική έρευνα (Nationaal Archief, Delpher / KB)."),
    archive("Γερμανικά κράτη", "german", 11.58, 48.147, "Μόναχο — Bayerische Staatsbibliothek", "Γερμανικά αρχεία και επιστημονικές βιβλιοθήκες (BSB, Deutsche Digitale Bibliothek)."),
    archive("Ιταλικά κράτη", "italian_states", 12.496, 41.903, "Ρώμη — κρατικά αρχεία (SIAS) · Internet Culturale", "Αρχεία και συλλογές των ιταλικών κρατών."),
    archive("Ελλάδα", "greek", 23.727, 37.984, "Αθήνα — ΕΚΤ / OpenArchives.gr", "Ελληνικά και αιγαιακά αρχεία, βιβλιογραφία και ψηφιακή πολιτιστική κληρονομιά."),
    archive("Οθωμανική αυτοκρατορία", "ottoman", 28.97, 41.08, "Κωνσταντινούπολη — Devlet Arşivleri (BOA)", "Οθωμανικές αρχειακές πηγές (BOA, ΙSAM)."),
    archive("Βόρεια Αφρική", "north_african", 3.06, 36.75, "Αλγέρι — ενδεικτική θέση (οι πηγές προέρχονται από γαλλικές και ισπανικές συλλογές)", "Ιστορίες και συλλογές πηγών της Βόρειας Αφρικής."),
    archive("Περιηγητές", "travellers", 25.0, 39.3, "Στη θάλασσα — συμβολική θέση των ταξιδιωτικών αφηγήσεων", "Ταξιδιωτικές αφηγήσεις και ιστορικές μαρτυρίες περιηγητών."),
    science("Γενεαλογία πηγών", "source_genealogy", "Παρακολουθεί την εξάρτηση, την επανάληψη και τη μετάδοση των πηγών."),
    science("Ταυτοποίηση", "identity_resolution", "Διακρίνει ιστορικά πρόσωπα και παραλλαγές ονομάτων."),
    science("Αντιφάσεις", "contradiction", "Αναδεικνύει διαφωνίες ανάμεσα σε ισχυρισμούς και στα τεκμήριά τους."),
    science("Δίκτυα σχέσεων", "relationship_network", "Εξετάζει τεκμηριωμένες ιστορικές σχέσεις."),
    science("Χρονολόγιο", "timeline", "Αντιστοιχίζει ισχυρισμούς με χρονολογημένα ιστορικά γεγονότα."),
    science("Πειρατικές βάσεις", "pirate_base", "Ερευνά τόπους, αποδόσεις και υποστηρικτικά τεκμήρια."),
  ].map((s, i) => ({ ...s, id: i, element: null, seal: null, w: 0, h: 0, found: 0, blocked: 0, status: "" }));
  const ARCHIVE_COUNT = 11, SCIENCE_START = 11;
  const RING = 112;
  sectors.forEach((s, i) => {
    if (s.kind === "archive") Object.assign(s, project(s.lon, s.lat));
    else {
      const a = -Math.PI / 2 + ((i - SCIENCE_START) * 2 * Math.PI) / (sectors.length - SCIENCE_START);
      s.x = C.analysis[0] + Math.cos(a) * RING;
      s.y = C.analysis[1] + Math.sin(a) * RING;
    }
  });
  const core = { x: C.core[0], y: C.core[1] };
  // shared with nautical-dashboard.js (ACTIVE NODES mini chart)
  window.NABOU_LANES = sectors.map((q) => ({ get agentId() { return q.agentId; }, get name() { return q.name; }, kind: q.kind, x: q.x, y: q.y, place: q.place }));
  const analysisHub = { x: C.analysis[0], y: C.analysis[1] };
  // Ink routes: every archive to the core rose, every analysis lane to its rose, and the two roses joined.
  const linkPairs = sectors.map((s, i) => [i, s.kind === "archive" ? -1 : -2]).concat([[-2, -1]]);
  $("linkCount").textContent = linkPairs.length;

  /* ---------- research state (unchanged logic) ---------- */
  const terminalStatuses = new Set(["BLOCKED_CONFIGURATION", "INSUFFICIENT_EVIDENCE", "COMPLETED", "FAILED", "ERROR", "CANCELLED", "CANCELED", "BLOCKED", "SKIPPED", "DONE", "IDLE", "UNAVAILABLE"]);
  function syncActiveDataset() {
    document.body.dataset.activeAgents = String(activeAgentIds.size);
    document.body.dataset.skullMode = activeAgentIds.size ? "ACTIVE" : "IDLE";
  }
  function setCoreState(state) {
    coreState = String(state || "IDLE").toUpperCase();
    document.body.dataset.coreState = coreState;
    const el = document.querySelector(".core-status");
    if (el) {
      const label = { IDLE: "Έτοιμο για εξερεύνηση", PLANNING: "Σχεδιασμός έρευνας", ACTIVE: "Έρευνα σε εξέλιξη", BLOCKED: "Χρειάζεται προσοχή", COMPLETE: "Η αποστολή ολοκληρώθηκε" }[coreState] || coreState;
      el.innerHTML = "<i></i> " + label;
    }
    const hit = $("coreHit");
    if (hit) hit.setAttribute("aria-label", "Κέντρο έρευνας NABOU//X · " + (hit.dataset.stateLabel = { IDLE: "έτοιμο", PLANNING: "σχεδιασμός", ACTIVE: "σε εξέλιξη", BLOCKED: "χρειάζεται προσοχή", COMPLETE: "ολοκληρώθηκε" }[coreState] || coreState));
  }
  setCoreState("IDLE");
  function setAgentStatus(id, status) {
    if (!id) return;
    const st = String(status || "").toUpperCase();
    if (!st || terminalStatuses.has(st) || st.includes("COMPLETED") || st.includes("FAILED") || st.includes("ERROR")) activeAgentIds.delete(String(id));
    else activeAgentIds.add(String(id));
    syncActiveDataset();
    markSeals();
  }
  function setLaneText(sector, text) {
    if (!sector.element) return;
    sector.element.querySelector("small").textContent = text;
    sector.detail = text;
    sector.element.setAttribute("aria-label", sector.name + " — " + text);
    if (tipFor === sector.id) showTip(sector.id);
    layoutDirty = true;
  }
  function applySnapshot(data) {
    if (pendingVisual && data) {
      const id = data.request_id || (data.events || []).find((e) => e.request_id)?.request_id;
      if (!pendingRequest || id !== pendingRequest) return;
      pendingVisual = false;
      document.body.dataset.researchVisual = "LIVE";
    }
    const thematic = sectors[sectors.length - 1];
    const biography = (data?.agents || []).some((a) => a.id === "pirate_biography") && !(data?.agents || []).some((a) => a.id === "pirate_base");
    thematic.agentId = biography ? "pirate_biography" : "pirate_base";
    thematic.name = biography ? "Βιογραφία πειρατή" : "Πειρατικές βάσεις";
    thematic.desc = biography ? "Συγκεντρώνει βιογραφικά τεκμήρια για το πρόσωπο της έρευνας." : "Ερευνά τόπους, αποδόσεις και υποστηρικτικά τεκμήρια.";
    if (thematic.element) { thematic.element.querySelector(".nl-name").textContent = thematic.name; paintEmblem(thematic); }
    for (const sector of sectors) {
      const agent = data?.agents?.find((a) => a.id === sector.agentId);
      const found = (data?.discoveries || []).filter((d) => (d.lane || d.agent_id) === sector.agentId).length;
      const blocked = (data?.blockers || []).filter((d) => d.agent_id === sector.agentId).length;
      sector.found = found;
      sector.blocked = blocked;
      sector.status = agent ? String(agent.status || "PENDING") : data ? "ABSENT" : "";
      setLaneText(sector, agent ? `${GR(agent.status || "PENDING")} · ${found} ευρήματα · ${blocked} εμπόδια` : data ? "Δεν συμμετέχει" : "Αναμονή έρευνας");
    }
    activeAgentIds.clear();
    for (const a of data?.agents || []) setAgentStatus(a.id, a.status || a.phase);
    syncActiveDataset();
    const mission = String(data?.mission?.status || "").toUpperCase(), blocked = (data?.blockers || []).length;
    if (activeAgentIds.size) setCoreState("ACTIVE");
    else if (mission === "RUNNING" || document.body.dataset.researchVisual === "QUEUED" || document.body.dataset.researchVisual === "SUBMITTING") setCoreState("PLANNING");
    else if (blocked && mission !== "COMPLETED") setCoreState("BLOCKED");
    else if (mission === "COMPLETED") setCoreState(blocked ? "BLOCKED" : "COMPLETE");
    else setCoreState("IDLE");
    markSeals();
  }
  function applyLiveEvent(e) {
    if (pendingVisual && (!pendingRequest || e?.request_id !== pendingRequest)) return;
    document.body.dataset.researchVisual = "LIVE";
    setAgentStatus(e?.agent_id, e?.status || e?.event_type || e?.phase);
    if (e?.agent_id) eventPulseAt.set(String(e.agent_id), performance.now());
    const st = String(e?.status || e?.phase || e?.event_type || "").toUpperCase();
    if (st.includes("BLOCK") || st.includes("ERROR") || st.includes("FAILED")) setCoreState("BLOCKED");
    else if (activeAgentIds.size) setCoreState("ACTIVE");
    else if (st.includes("COMPLETE")) setCoreState("COMPLETE");
  }
  function beginRequestVisual(phase, requestId = "") {
    pendingVisual = true;
    pendingRequest = requestId;
    activeAgentIds.clear();
    syncActiveDataset();
    document.body.dataset.researchVisual = phase;
    setCoreState("PLANNING");
    for (const s of sectors) if (s.element) setLaneText(s, phase === "SUBMITTING" ? "Αποστολή αιτήματος" : "Αναμονή εκκίνησης στον διακομιστή");
    markSeals();
  }
  window.addEventListener("jarvis:operator-query", () => beginRequestVisual("SUBMITTING"));
  window.addEventListener("jarvis:dispatch-accepted", (e) => beginRequestVisual("QUEUED", e.detail?.request_id || ""));
  window.addEventListener("jarvis:dispatch-failed", () => {
    pendingVisual = false;
    pendingRequest = "";
    activeAgentIds.clear();
    syncActiveDataset();
    document.body.dataset.researchVisual = "ERROR";
    setCoreState("BLOCKED");
    markSeals();
  });
  window.addEventListener("jarvis:research-selection", () => {
    pendingVisual = false;
    pendingRequest = "";
    document.body.dataset.researchVisual = "LIVE";
  });
  window.__jarvisSetActiveAgents = (ids = []) => {
    activeAgentIds.clear();
    for (const id of ids) activeAgentIds.add(String(id));
    syncActiveDataset();
    setCoreState(activeAgentIds.size ? "ACTIVE" : "IDLE");
    markSeals();
  };
  window.addEventListener("jarvis:operator-query", () => {
    setCoreState("PLANNING");
    document.body.dataset.researchVisual = "SUBMITTING";
  });
  window.addEventListener("jarvis:dispatch-accepted", () => {
    setCoreState("PLANNING");
    document.body.dataset.researchVisual = "QUEUED";
  });
  window.addEventListener("jarvis:research-selection", () => {
    document.body.dataset.researchVisual = "SELECTED";
  });
  window.addEventListener("jarvis:mission-state", (e) => {
    const v = String(e.detail?.state || "").toUpperCase();
    if (v.includes("PLANNING") || v.includes("ΑΠΟΣΤΟΛ") || v.includes("ΑΝΑΜΟΝ") || v.includes("ΠΑΡΑΛΗΦ")) setCoreState("PLANNING");
    else if (v === "RESEARCH ACTIVE" || v === "ACTIVE") setCoreState("ACTIVE");
    else if (v.includes("FAILED") || v.includes("ERROR") || v.includes("BLOCK") || v.includes("ΔΕΝ ΥΠΑΡΧΕΙ ΣΥΝΔΕΣΗ") || v.includes("ΚΑΘΥΣΤΕΡΗΣΕ")) setCoreState("BLOCKED");
  });
  window.addEventListener("jarvis:focus-agent", (e) => {
    const i = sectors.findIndex((s) => s.agentId === e.detail?.agent_id);
    if (i < 0) return;
    select(i);
    aim(i);
  });
  syncActiveDataset();

  /* ---------- lane tooltip: the chart label shows only the name; status / finds / blockers appear here ---------- */
  const tip = document.createElement("div");
  tip.id = "laneTip";
  tip.className = "lane-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  (host || document.body).appendChild(tip);
  let tipFor = -1;
  function showTip(id) {
    const q = sectors[id];
    if (!q) return;
    tipFor = id;
    tip.innerHTML = "<strong></strong><span></span><em></em>";
    tip.querySelector("strong").textContent = q.name;
    tip.querySelector("span").textContent = q.detail || "";
    tip.querySelector("em").textContent = q.place || "";
    tip.hidden = false;
    placeTip();
  }
  function hideTip(id) {
    if (id !== undefined && id !== tipFor) return;
    tipFor = -1;
    tip.hidden = true;
  }
  function placeTip() {
    const q = sectors[tipFor];
    if (!q || tip.hidden) return;
    if (!q.sealVisible) { tip.style.visibility = "hidden"; return; }
    tip.style.visibility = "";
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const a = q.anchor, top = Math.min(a ? a.top : q.sy, q.sy - SEAL_R), bottom = Math.max(a ? a.bottom : q.sy, q.sy + SEAL_R);
    let x = q.sx - w / 2, y = top - 8 - h;
    if (y < 4) y = bottom + 8;
    x = Math.max(4, Math.min(W - w - 4, x));
    tip.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`;
  }

  /* ---------- seals and labels ---------- */
  for (const s of sectors) {
    const seal = document.createElement("button");
    seal.type = "button";
    seal.className = "node-seal " + s.kind;
    seal.dataset.agent = s.agentId;
    seal.tabIndex = -1; // the emblem is the keyboard target; the seal marks the exact place and the lane status
    seal.setAttribute("aria-hidden", "true");
    seal.innerHTML = '<span class="seal-wax" aria-hidden="true"><span class="seal-mono"></span></span><span class="seal-count" aria-hidden="true"></span>';
    seal.querySelector(".seal-mono").textContent = s.name.charAt(0);
    seal.addEventListener("click", () => select(s.id));
    seal.addEventListener("pointerenter", () => { hover = s.id; layoutDirty = true; showTip(s.id); });
    seal.addEventListener("pointerleave", () => { if (hover === s.id) hover = -1; layoutDirty = true; hideTip(s.id); });
    seals.appendChild(seal);
    const label = document.createElement("button");
    label.type = "button";
    label.className = "node-label " + s.kind;
    // heraldic emblem; the name stays in the DOM (screen readers, tests) and appears visually only in the tooltip
    label.innerHTML = '<span class="nl-emblem" aria-hidden="true"></span><span class="nl-name"></span><span class="nl-count" aria-hidden="true" hidden></span><small></small>';
    label.querySelector(".nl-name").textContent = s.name;
    label.addEventListener("click", () => select(s.id));
    label.addEventListener("pointerenter", () => { hover = s.id; layoutDirty = true; showTip(s.id); });
    label.addEventListener("pointerleave", () => { if (hover === s.id) hover = -1; layoutDirty = true; hideTip(s.id); });
    label.addEventListener("focus", () => { showTip(s.id); label.classList.add("kbd"); });
    label.addEventListener("blur", () => { hideTip(s.id); label.classList.remove("kbd"); });
    labels.appendChild(label);
    s.seal = seal;
    s.element = label;
    paintEmblem(s);
    setLaneText(s, "Αναμονή έρευνας");
  }
  const coreHit = document.createElement("button");
  coreHit.type = "button";
  coreHit.id = "coreHit";
  coreHit.className = "core-hit";
  coreHit.addEventListener("click", () => select(-1));
  seals.appendChild(coreHit);
  setCoreState(coreState);

  function paintEmblem(s) {
    const lib = window.NABOU_EMBLEMS;
    if (!lib || !s.element || s.element.dataset.emblem === s.agentId) return;
    const em = lib.get(s.agentId);
    s.element.dataset.emblem = s.agentId;
    if (s.seal) s.seal.dataset.agent = s.agentId;
    s.element.querySelector(".nl-emblem").innerHTML = em.svg;
    layoutDirty = true;
  }
  const laneState = (st, active) => {
    st = String(st || "").toUpperCase();
    if (active || /RUNNING|PREPARING|STARTING|QUEUED|ACTIVE|LIVE/.test(st)) return "active";
    if (/FAIL|ERROR|BLOCKED|UNAVAILABLE|CANCEL/.test(st)) return "blocked";
    if (/COMPLETED|DONE|PARTIAL/.test(st)) return "done";
    if (st === "ABSENT") return "absent";
    return "idle";
  };
  function markSeals() {
    for (const s of sectors) {
      if (!s.seal) continue;
      const active = activeAgentIds.has(s.agentId);
      s.seal.dataset.activity = active ? "active" : "idle";
      s.seal.dataset.status = s.status ? s.status.toUpperCase() : "";
      s.seal.dataset.state = s.element.dataset.state = laneState(s.status, active);
      s.seal.classList.toggle("selected", s.id === selected);
      s.element.classList.toggle("selected", s.id === selected);
      s.element.classList.toggle("active", active);
      const count = s.seal.querySelector(".seal-count");
      count.textContent = s.found ? String(s.found) : "";
      count.hidden = !s.found;
      const badge = s.element.querySelector(".nl-count");
      badge.textContent = count.textContent;
      badge.hidden = !s.found;
    }
    layoutDirty = true;
  }

  function select(i) {
    selected = i;
    const panel = $("detailPanel");
    panel.classList.remove("hidden");
    if (i < 0) {
      delete panel.dataset.agentId;
      panel.dataset.core = "1";
      $("detail-number").textContent = "ΚΕΝΤΡΟ / 00";
      $("detailType").textContent = "ΣΥΝΤΟΝΙΣΜΟΣ ΕΡΕΥΝΑΣ";
      $("detailTitle").textContent = "NABOU//X";
      $("detailDescription").textContent = "Ο κεντρικός ανεμολόγιος συντονίζει τους ερευνητές. Η κατάσταση σύνδεσης είναι ανεξάρτητη από την ιστορική επαλήθευση.";
      $("detailRole").textContent = "Συντονισμός";
      $("detailState").textContent = GR(coreState);
      markSeals();
      return;
    }
    const s = sectors[i];
    delete panel.dataset.core;
    panel.dataset.agentId = s.agentId;
    $("detail-number").textContent = "ΤΟΜΕΑΣ / " + String(i + 1).padStart(2, "0");
    $("detailType").textContent = s.kind === "archive" ? "ΑΡΧΕΙΑΚΟΣ ΕΡΕΥΝΗΤΗΣ" : "ΕΡΕΥΝΗΤΗΣ ΑΝΑΛΥΣΗΣ";
    $("detailTitle").textContent = s.name;
    $("detailDescription").textContent = s.desc + " Θέση στον χάρτη: " + s.place + ".";
    $("detailRole").textContent = s.kind === "archive" ? "Αρχείο" : "Ανάλυση";
    $("detailState").textContent = "Χωρίς δεδομένα";
    markSeals();
  }

  /* ---------- view: pan / zoom ----------
     The chart lives inside #chartView (a framed box in the scaled 1672×941 artboard on desktop,
     a block in the stacked page on mobile). All maths is in #chartView's own CSS pixels. */
  const hostBox = () => {
    const r = host.getBoundingClientRect();
    return { r, k: r.width / (host.offsetWidth || r.width || 1) || 1 };
  };
  const lp = (e) => {
    const { r, k } = hostBox();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };
  const toLocal = (b, hb) => ({ left: (b.left - hb.r.left) / hb.k, right: (b.right - hb.r.left) / hb.k, top: (b.top - hb.r.top) / hb.k, bottom: (b.bottom - hb.r.top) / hb.k });
  const visible = (el) => el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && !el.classList.contains("hidden");
  function freeRegion() {
    const left = 6, top = 6, right = W - 6, bottom = H - 6;
    return { left, top, right, bottom, w: right - left, h: bottom - top };
  }
  function fit(immediate) {
    // Fit the 17 lanes (plus the core rose) into the frame, like the mockup's Mediterranean view.
    const r = freeRegion();
    const pts = [...sectors.map((q) => [q.x, q.y]), [core.x, core.y]];
    const pad = W <= 800 ? 40 : 70;
    const x0 = Math.min(...pts.map((p) => p[0])) - pad, x1 = Math.max(...pts.map((p) => p[0])) + pad;
    const y0 = Math.min(...pts.map((p) => p[1])) - pad, y1 = Math.max(...pts.map((p) => p[1])) + pad;
    let s = Math.min(r.w / (x1 - x0), r.h / (y1 - y0));
    // never leave empty margins above/below the chart. Left/right: fill the frame up to the 16:9 desktop
    // frame width (1096 px); on wider full-width frames keep that same zoom (same area as at 16:9, every
    // banner visible) and let parchment margins show at the sides instead of cutting off the north/south.
    s = Math.max(s, H / C.H, Math.min(W, 1096) / C.W);
    const cx = (x0 + x1) / 2;
    let cy = (y0 + y1) / 2;
    if (s * (y1 - y0) > r.h) {
      // the frame is too wide/short for every lane at the minimum scale: keep all lane seals in view
      // (centre on the lanes only) and let the core rose sit nearer the edge instead
      const ly = sectors.map((q) => q.y);
      cy = (Math.min(...ly) + Math.max(...ly)) / 2;
    }
    fitScale = s;
    target = clampView({ s, x: r.left + r.w / 2 - cx * s, y: r.top + r.h / 2 - cy * s });
    if (immediate) view = { ...target };
    viewDirty = layoutDirty = true;
  }
  function clampView(v) {
    const minS = Math.min(fitScale || Infinity, Math.max(W / C.W, H / C.H));
    const s = Math.max(minS, Math.min(fitScale * 9, v.s));
    const r = { left: 0, top: 0, right: W, bottom: H, w: W, h: H }, mw = C.W * s, mh = C.H * s, keep = 1;
    const x = mw < r.w ? (r.w - mw) / 2 : Math.min(r.right - Math.min(mw, r.w) * keep, Math.max(r.left + Math.min(mw, r.w) * keep - mw, v.x));
    const y = Math.min(r.bottom - Math.min(mh, r.h) * keep, Math.max(r.top + Math.min(mh, r.h) * keep - mh, v.y));
    return { s, x, y };
  }
  function zoomAt(factor, px, py) {
    const s = Math.max(Math.min(fitScale || Infinity, Math.max(W / C.W, H / C.H)), Math.min(fitScale * 9, target.s * factor));
    const k = s / target.s;
    target = clampView({ s, x: px - (px - target.x) * k, y: py - (py - target.y) * k });
    viewDirty = true;
  }
  function regionCenter() {
    return { x: W / 2, y: H / 2 };
  }
  function aim(i) {
    const p = i < 0 ? core : sectors[i];
    const s = Math.max(target.s, fitScale * 2.2);
    const c = regionCenter();
    target = clampView({ s, x: c.x - p.x * s, y: c.y - p.y * s });
    viewDirty = true;
  }
  function reset() {
    selected = -1;
    $("detailPanel").classList.add("hidden");
    fit(false);
    markSeals();
  }
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = host.offsetWidth || innerWidth;
    H = host.offsetHeight || innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fit(true);
  }
  addEventListener("resize", resize);
  if (host !== document.body) new ResizeObserver(() => { if (host.offsetWidth !== W || host.offsetHeight !== H) resize(); }).observe(host);
  // the stacked mobile page scrolls: labels must re-avoid the fixed bars
  document.getElementById("stage")?.addEventListener("scroll", () => { layoutDirty = true; }, { passive: true });

  // pointer navigation: drag to pan, wheel / pinch to zoom
  const pointers = new Map();
  let dragStart = null, pinchStart = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: lp(e).x, y: lp(e).y });
    if (pointers.size === 1) dragStart = { x: lp(e).x, y: lp(e).y, vx: target.x, vy: target.y, moved: false };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), s: target.s };
    }
    stage.classList.add("dragging");
  });
  stage.addEventListener("pointermove", (e) => {
    const ll = unproject((lp(e).x - view.x) / view.s, (lp(e).y - view.y) / view.s);
    $("coordinates").textContent = Math.abs(ll.lat).toFixed(2) + "° " + (ll.lat >= 0 ? "Β" : "Ν") + " · " + Math.abs(ll.lon).toFixed(2) + "° " + (ll.lon >= 0 ? "Α" : "Δ");
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: lp(e).x, y: lp(e).y });
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((pinchStart.s * (d / pinchStart.d)) / target.s, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (dragStart) {
      const dx = lp(e).x - dragStart.x, dy = lp(e).y - dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragStart.moved = true;
      target = clampView({ s: target.s, x: dragStart.vx + dx, y: dragStart.vy + dy });
      view.x = target.x; view.y = target.y;
      viewDirty = true;
    }
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (!pointers.size) {
      dragStart = null;
      stage.classList.remove("dragging");
    }
  };
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * 0.0015), lp(e).x, lp(e).y);
  }, { passive: false });
  stage.addEventListener("dblclick", (e) => { if (!e.target.closest("button")) zoomAt(1.6, lp(e).x, lp(e).y); });
  $("zoomIn").onclick = () => { const c = regionCenter(); zoomAt(1.42, c.x, c.y); };
  $("zoomOut").onclick = () => { const c = regionCenter(); zoomAt(1 / 1.42, c.x, c.y); };
  $("resetView").onclick = reset;
  $("closeDetail").onclick = () => {
    $("detailPanel").classList.add("hidden");
    selected = -1;
    markSeals();
  };
  $("focusButton").onclick = () => aim(selected);
  // keyboard: arrows pan, +/- zoom while the chart has focus
  stage.tabIndex = 0;
  stage.addEventListener("keydown", (e) => {
    const step = 60, c = regionCenter();
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { target = clampView({ s: target.s, x: target.x + moves[e.key][0], y: target.y + moves[e.key][1] }); viewDirty = true; e.preventDefault(); }
    else if (e.key === "+" || e.key === "=") { zoomAt(1.3, c.x, c.y); e.preventDefault(); }
    else if (e.key === "-") { zoomAt(1 / 1.3, c.x, c.y); e.preventDefault(); }
  });
  $("detailPanel").classList.add("hidden");
  // Re-layout labels whenever chrome that labels must avoid opens or closes.
  new MutationObserver((records) => {
    if (records.some((r) => !seals.contains(r.target) && !labels.contains(r.target) && !plane.contains(r.target))) {
      layoutDirty = true;
      // Re-place labels at once when a view or panel changes, so they never wait for a slow frame.
      if (records.some((r) => r.attributeName === "data-nxs-view")) layoutLabels();
    }
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["class", "hidden", "data-nxs-view"] });
  new ResizeObserver(() => { layoutDirty = true; }).observe($("operatorCommand"));

  /* ---------- label placement with collision avoidance ---------- */
  const SEAL_R = 8; // small status seal under each emblem
  const overlaps = (a, b, pad = 4) => a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
  function exclusions() {
    const sel = ["#topbar", "#sidenav", ".nxs-3d-tools", ".nxs-telemetry", "#operatorCommand", "#detailPanel", "#nxsAgentsPage", "#resultsDrawer", "#learningPanel", "#activityStrip", "#ddMenu", "#nxPopover", ".workspace-welcome"];
    const out = [], hb = hostBox();
    for (const q of sel) {
      const el = document.querySelector(q);
      if (!el || !visible(el) || el.hidden || getComputedStyle(el).display === "none") continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const b = toLocal(r, hb);
      if (b.right < 0 || b.left > W || b.bottom < 0 || b.top > H) continue;
      out.push(b);
    }
    return out;
  }
  function layoutLabels() {
    layoutDirty = false;
    const blocks = exclusions();
    const accepted = [];
    const narrow = W <= 800;
    // measure (one reflow) — labels are absolutely positioned so measuring does not move anything
    for (const s of sectors) {
      s.element.classList.toggle("compact", narrow && s.id !== selected && s.id !== hover);
      s.w = s.element.offsetWidth;
      s.h = s.element.offsetHeight;
    }
    const sealRects = [];
    for (const s of sectors) {
      s.sx = view.x + s.x * view.s;
      s.sy = view.y + s.y * view.s;
      const onScreen = s.sx > 4 && s.sx < W - 4 && s.sy > 4 && s.sy < H - 4;
      const covered = blocks.some((b) => s.sx > b.left && s.sx < b.right && s.sy > b.top && s.sy < b.bottom);
      s.sealVisible = onScreen && !covered;
      s.seal.style.transform = `translate(${s.sx.toFixed(1)}px,${s.sy.toFixed(1)}px)`;
      s.seal.classList.toggle("offscreen", !s.sealVisible);
      if (s.sealVisible) sealRects.push({ id: s.id, left: s.sx - SEAL_R, right: s.sx + SEAL_R, top: s.sy - SEAL_R, bottom: s.sy + SEAL_R });
    }
    const cx = view.x + core.x * view.s, cy = view.y + core.y * view.s, cr = Math.max(18, 70 * view.s);
    coreHit.style.transform = `translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px)`;
    coreHit.style.width = coreHit.style.height = (cr * 2).toFixed(0) + "px";
    coreHit.style.marginLeft = coreHit.style.marginTop = (-cr).toFixed(0) + "px";
    coreHit.classList.toggle("offscreen", blocks.some((b) => cx > b.left && cx < b.right && cy > b.top && cy < b.bottom) || cx < 0 || cx > W || cy < 0 || cy > H);
    const order = [...sectors].sort((a, b) => {
      const rank = (s) => (s.id === selected ? 0 : s.id === hover ? 1 : activeAgentIds.has(s.agentId) || s === sectors[sectors.length - 1] ? 2 : s.kind === "archive" ? 3 : 4);
      return rank(a) - rank(b) || b.found - a.found || a.id - b.id;
    });
    const gap = SEAL_R + 5;
    for (const s of order) {
      const el = s.element;
      let placed = null;
      if (s.sealVisible) {
        const w = s.w, h = s.h, x = s.sx, y = s.sy;
        const candidates = [
          [x - w / 2, y - h - 3], [x - w / 2, y + 3], [x + 5, y - h / 2], [x - 5 - w, y - h / 2],
          [x + 2, y - h + 4], [x - w - 2, y - h + 4], [x + 2, y - 4], [x - w - 2, y - 4],
          [x + gap, y - h / 2], [x - gap - w, y - h / 2], [x - w / 2, y - gap - h], [x - w / 2, y + gap],
          [x + gap - 4, y - h - 6], [x + gap - 4, y + 6], [x - gap - w + 4, y - h - 6], [x - gap - w + 4, y + 6],
          [x + gap + 18, y - h / 2], [x - gap - w - 18, y - h / 2], [x - w / 2, y - gap - h - 16], [x - w / 2, y + gap + 16],
          [x - w / 2, y - gap - h - 34], [x - w / 2, y + gap + 34], [x + gap - 4, y - h - 26], [x + gap - 4, y + 26],
          [x - gap - w + 4, y - h - 26], [x - gap - w + 4, y + 26], [x - w * 0.25, y - gap - h], [x - w * 0.75, y - gap - h],
          [x - w * 0.25, y + gap], [x - w * 0.75, y + gap], [6, y - gap - h], [6, y + gap],
        ];
        for (const [l, t] of candidates) {
          const r = { left: l, top: t, right: l + w, bottom: t + h };
          if (r.left < 6 || r.top < 6 || r.right > W - 6 || r.bottom > H - 6) continue;
          if (blocks.some((b) => overlaps(r, b, 2))) continue;
          if (accepted.some((a) => overlaps(r, a, 3))) continue;
          if (sealRects.some((q) => q.id !== s.id && overlaps(r, q, 1))) continue;
          placed = r;
          break;
        }
      }
      if (placed) {
        accepted.push(placed);
        el.style.left = placed.left.toFixed(1) + "px";
        el.style.top = placed.top.toFixed(1) + "px";
        el.classList.remove("unplaced");
        s.anchor = placed;
      } else {
        el.classList.add("unplaced");
        s.anchor = null;
      }
    }
    placeTip();
  }

  /* ---------- canvas: ink routes, live pulses, selection rings ---------- */
  function routePoint(a, b, q) {
    // gentle arc so routes read as hand-drawn sea lanes
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
    const bend = 0.12, cx = mx - dy * bend, cy = my + dx * bend;
    const u = 1 - q;
    return { x: u * u * a.x + 2 * u * q * cx + q * q * b.x, y: u * u * a.y + 2 * u * q * cy + q * q * b.y, cx, cy };
  }
  const toScreen = (p) => ({ x: view.x + p.x * view.s, y: view.y + p.y * view.s });
  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    const t = reduce ? 0 : now;
    const c = toScreen(core);
    const glow = { PLANNING: "rgba(227,197,126,", ACTIVE: "rgba(176,40,30,", BLOCKED: "rgba(120,20,16,", COMPLETE: "rgba(227,197,126," }[coreState];
    if (glow) {
      const r = Math.max(40, 120 * view.s) * (1 + (reduce ? 0 : 0.06 * Math.sin(now * 0.004)));
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      g.addColorStop(0, glow + ".34)");
      g.addColorStop(1, glow + "0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, 7);
      ctx.fill();
    }
    for (const [a, b] of linkPairs) {
      const sa = a >= 0 ? sectors[a] : null;
      const pa = a === -2 ? analysisHub : sa;
      const pb = b === -1 ? core : analysisHub;
      const A = toScreen(pa), B = toScreen(pb);
      const active = sa && activeAgentIds.has(sa.agentId);
      const pulse = sa && now - (eventPulseAt.get(sa.agentId) || -1e9) < 1800;
      const sel = sa && sa.id === selected;
      const mid = routePoint(A, B, 0.5);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.quadraticCurveTo(mid.cx, mid.cy, B.x, B.y);
      ctx.setLineDash(active ? [] : [5, 4]);
      ctx.lineWidth = active ? 1.8 : sel ? 1.6 : 1;
      ctx.strokeStyle = active ? "rgba(140,28,20,.85)" : pulse ? "rgba(180,141,69,.95)" : sel ? "rgba(42,25,14,.85)" : "rgba(42,25,14,.38)";
      ctx.stroke();
      ctx.setLineDash([]);
      if (!reduce && (active || pulse)) {
        const q = ((t * (active ? 0.00022 : 0.00016)) + (a + 3) * 0.137) % 1;
        const p = routePoint(A, B, q);
        ctx.fillStyle = active ? "#8e231b" : "#b48d45";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, 7);
        ctx.fill();
      }
    }
    // leader lines from seals to their labels when the label sits away from the seal
    ctx.strokeStyle = "rgba(42,25,14,.55)";
    ctx.lineWidth = 0.8;
    for (const s of sectors) {
      if (!s.anchor || !s.sealVisible) continue;
      const r = s.anchor;
      const lx = Math.max(r.left, Math.min(s.sx, r.right)), ly = Math.max(r.top, Math.min(s.sy, r.bottom));
      const d = Math.hypot(lx - s.sx, ly - s.sy);
      if (d < SEAL_R + 8) continue;
      ctx.beginPath();
      ctx.moveTo(s.sx + ((lx - s.sx) / d) * SEAL_R, s.sy + ((ly - s.sy) / d) * SEAL_R);
      ctx.lineTo(lx, ly);
      ctx.stroke();
    }
  }

  function render(now) {
    const dt = Math.min((now - last) / 1000 || 0.016, 0.06);
    last = now;
    frame++;
    fps = Math.round(1 / Math.max(dt, 0.001));
    if (frame % 35 === 0) {
      $("fps").textContent = fps + " FPS";
      $("clock").textContent = new Date().toISOString().slice(11, 19) + " UTC";
    }
    const k = reduce ? 1 : Math.min(dt * 9, 1);
    const moving = Math.abs(target.s - view.s) > 1e-4 || Math.abs(target.x - view.x) > 0.3 || Math.abs(target.y - view.y) > 0.3;
    if (moving) {
      view.s += (target.s - view.s) * k;
      view.x += (target.x - view.x) * k;
      view.y += (target.y - view.y) * k;
      viewDirty = true;
    } else if (viewDirty) view = { ...target };
    if (viewDirty) {
      plane.style.transform = `translate(${view.x.toFixed(2)}px,${view.y.toFixed(2)}px) scale(${view.s.toFixed(5)})`;
      $("zoomLevel").textContent = "Κλίμακα ×" + (view.s / fitScale).toFixed(1);
      layoutDirty = true;
      viewDirty = moving;
    }
    if (layoutDirty) layoutLabels();
    draw(now);
    requestAnimationFrame(render);
  }

  import("./live-bridge.js")
    .then(({ connectResearchFeed }) =>
      connectResearchFeed({
        onReset: () => {
          applySnapshot(null);
          setCoreState("PLANNING");
        },
        onSnapshot: applySnapshot,
        onEvent: applyLiveEvent,
        onState: (mode) => {
          liveConnectionMode = mode;
          document.body.dataset.researchFeed = mode;
        },
      }),
    )
    .catch(() => {
      liveConnectionMode = "OFFLINE";
      document.body.dataset.researchFeed = "OFFLINE";
    });
  resize();
  if (document.fonts) document.fonts.ready.then(() => { layoutDirty = true; });
  requestAnimationFrame(render);
})();
