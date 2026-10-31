// NABOU//X — mockup chrome (top bar, sidebar, query filters, cards, right column) wired to the real research feed.
// Presentation only: it reads the same shared live feed as the rest of the page and routes clicks to the existing views.
import { connectResearchFeed } from "./live-bridge.js";

const $ = (id) => document.getElementById(id);
const body = document.body;
const stage = $("stage");
const GR = window.NABOU_GR || { status: (x) => String(x || ""), ui: (x) => String(x || "") };
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString("el-GR") : "—");
const mobile = () => innerWidth <= 800;

/* ---------- desktop artboard scaling (1672 × 941, like the mockup) ----------
   The artboard is scaled to the window height; on windows wider than 16:9 it grows sideways
   (--nx-dw extra artboard px), so the page fills the screen edge to edge instead of a centred column.
   The map and the card row take the extra width; the right column stays pinned to the right edge. */
const ART_W = 1672, ART_H = 941;
const stageW = () => ART_W + (parseFloat(stage.style.getPropertyValue("--nx-dw")) || 0);
function scaleStage() {
  if (mobile()) {
    for (const v of ["--nx-k", "--nx-x", "--nx-y", "--nx-dw"]) stage.style.removeProperty(v);
    return;
  }
  const k = Math.min(innerWidth / ART_W, innerHeight / ART_H);
  const dw = Math.max(0, innerWidth / k - ART_W);
  stage.style.setProperty("--nx-k", k.toFixed(5));
  stage.style.setProperty("--nx-dw", dw.toFixed(1) + "px");
  stage.style.setProperty("--nx-x", ((innerWidth - (ART_W + dw) * k) / 2).toFixed(1) + "px");
  stage.style.setProperty("--nx-y", ((innerHeight - ART_H * k) / 2).toFixed(1) + "px");
}
addEventListener("resize", scaleStage);
scaleStage();
const stageScale = () => (mobile() ? 1 : stage.getBoundingClientRect().width / (stage.offsetWidth || ART_W) || 1);
// composer height for the stacked mobile layout (panels sit between the bars)
const composer = $("operatorCommand");
new ResizeObserver(() => body.style.setProperty("--composer-height", composer.getBoundingClientRect().height + "px")).observe(composer);

/* ---------- compass ticks + date ---------- */
{
  const g = document.querySelector("#compass .c-ticks");
  let h = "";
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16, r1 = 27, r2 = i % 4 ? 24.5 : 22;
    h += `<line x1="${(Math.sin(a) * r1).toFixed(2)}" y1="${(-Math.cos(a) * r1).toFixed(2)}" x2="${(Math.sin(a) * r2).toFixed(2)}" y2="${(-Math.cos(a) * r2).toFixed(2)}"/>`;
  }
  g.innerHTML = h;
}
const months = ["ΙΑΝ", "ΦΕΒ", "ΜΑΡ", "ΑΠΡ", "ΜΑΪ", "ΙΟΥΝ", "ΙΟΥΛ", "ΑΥΓ", "ΣΕΠ", "ΟΚΤ", "ΝΟΕ", "ΔΕΚ"];
function tickDate() {
  const d = new Date();
  $("clkDate").textContent = d.getUTCDate() + " " + months[d.getUTCMonth()] + " " + d.getUTCFullYear();
}
tickDate();
setInterval(tickDate, 60000);

/* ---------- navigation: mockup items → the page's real views ---------- */
const dock = (view) => document.querySelector(`.nxs-dock [data-nxs-view="${view}"]`);
const openView = (view) => dock(view)?.click();
let lastGo = "search";
const after = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
function agentsFilter(f) {
  openView("agents");
  document.querySelector(`[data-agent-filter="${f}"]`)?.click();
}
function findings(then) {
  openView("findings");
  if (then) after(then);
}
function popover(kind) {
  const pop = $("nxPopover");
  if (!pop.hidden && pop.dataset.kind === kind) return closePop();
  pop.dataset.kind = kind;
  pop.innerHTML = kind === "layers" ? layersHtml() : settingsHtml();
  pop.hidden = false;
  placeBelow(pop, document.querySelector(`[data-nx-go="${kind}"]`), "right");
  pop.querySelector(".close").onclick = closePop;
  pop.querySelectorAll("input[data-cls]").forEach((box) => {
    box.onchange = () => body.classList.toggle(box.dataset.cls, !box.checked);
  });
  pop.querySelector("[data-motion]")?.addEventListener("change", (e) => body.classList.toggle("nx-no-motion", e.target.checked));
  pop.querySelector("[data-latest]")?.addEventListener("click", () => { closePop(); findings(() => $("latestResearch")?.click()); });
  pop.querySelector("[data-reset]")?.addEventListener("click", () => { closePop(); go("reset"); });
  setActive();
}
function closePop() {
  $("nxPopover").hidden = true;
  setActive();
}
const layer = (cls, label) => `<label><input type="checkbox" data-cls="${cls}" ${body.classList.contains(cls) ? "" : "checked"} /> ${label}</label>`;
function layersHtml() {
  return `<button class="close" type="button" aria-label="Κλείσιμο">✕</button><h2>MAP LAYERS</h2><p>Επίπεδα του ναυτικού χάρτη.</p>` +
    layer("nx-no-seals", "Σφραγίδες ερευνητών (17)") + layer("nx-no-labels", "Ονόματα ερευνητών") + layer("nx-no-routes", "Διαδρομές και ζωντανοί παλμοί") +
    layer("nx-no-rhumbs", "Ρόμβοι (γραμμές πυξίδας)") + layer("nx-no-names", "Λατινικά τοπωνύμια") + layer("nx-no-pictures", "Πλοία και θαλάσσια τέρατα");
}
function settingsHtml() {
  const feed = body.dataset.researchFeed || body.dataset.researchUi || "—";
  return `<button class="close" type="button" aria-label="Κλείσιμο">✕</button><h2>SETTINGS</h2>` +
    `<p>Σύνδεση: ${esc(GR.status(feed))} · Έρευνα #${esc(body.dataset.currentResearchRun || "—")}</p>` +
    `<label><input type="checkbox" data-motion ${body.classList.contains("nx-no-motion") ? "checked" : ""} /> Χωρίς κινήσεις και εφέ</label>` +
    `<p style="margin-top:12px"><button class="btn-l" type="button" data-latest>Άνοιγμα της πιο πρόσφατης έρευνας</button></p>` +
    `<p><button class="btn-l" type="button" data-reset>Επαναφορά χάρτη</button></p>`;
}
function go(where) {
  lastGo = where;
  closeMenu();
  if (where !== "layers" && where !== "settings") closePop();
  switch (where) {
    case "home": case "map": case "operator": case "territory":
      openView("universe");
      if (where !== "operator") $("resetView")?.click();
      break;
    case "search":
      openView("universe");
      $("operatorQuery").focus();
      break;
    case "reset": case "theater":
      openView("universe");
      $("resetView")?.click();
      $("compass").classList.remove("spin");
      void $("compass").offsetWidth;
      $("compass").classList.add("spin");
      break;
    case "research":
      findings(() => document.querySelector('[data-dossier-section="researchOverview"]')?.click());
      break;
    case "evidence":
      findings(() => document.querySelector('[data-dossier-section="researchFindings"]')?.click());
      break;
    case "people":
      findings(() => window.dispatchEvent(new CustomEvent("jarvis:results-filter", { detail: { filter: "claims" } })));
      break;
    case "sourcelist":
      findings(() => { document.querySelector('[data-dossier-section="researchFindings"]')?.click(); $("resultSearch")?.focus({ preventScroll: true }); });
      break;
    case "targets": case "history":
      findings(() => { const h = $("researchHistory"); if (h) { h.open = true; h.scrollIntoView({ block: "start" }); $("historySearch")?.focus({ preventScroll: true }); } });
      break;
    case "learning": openView("pdf"); break;
    case "agents": agentsFilter("all"); break;
    case "archives": case "sources": case "places": agentsFilter("archive"); break;
    case "intelligence": agentsFilter("analysis"); break;
    case "events": document.querySelector(".nxs-activity-open")?.click(); break;
    case "layers": case "settings": popover(where); break;
  }
  setActive();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-nx-go]");
  if (b) go(b.dataset.nxGo);
});
// highlight the mockup items that correspond to the open view
const topFor = { universe: ["search", "map"], agents: ["agents", "archives"], findings: ["research", "evidence"], pdf: ["learning"] };
const sideFor = { targets: "targets", history: "targets", sources: "sources", archives: "sources", places: "sources", layers: "layers", settings: "settings" };
const histFor = { history: 0, targets: 0, territory: 1, map: 1, home: 1, reset: 1, people: 2, intelligence: 3 };
function setActive() {
  const view = body.dataset.nxsView || "universe";
  const tops = topFor[view] || [];
  const pick = tops.includes(lastGo) ? lastGo : tops[0];
  document.querySelectorAll("#topnav .nav-item").forEach((b) => b.classList.toggle("active", b.dataset.nxGo === pick));
  const pop = $("nxPopover");
  const side = !pop.hidden ? pop.dataset.kind : view === "agents" && ["archives", "sources", "places"].includes(lastGo) ? "sources" : view === "findings" && ["targets", "history"].includes(lastGo) ? "targets" : "";
  document.querySelectorAll("#sidenav [data-nx-go]").forEach((b) => b.classList.toggle("active", b.dataset.nxGo === side));
  document.querySelectorAll("#sidenav .nxs-dock .side-item").forEach((b) => b.classList.toggle("dim-current", !!side));
  const hi = histFor[lastGo] ?? (view === "universe" ? 1 : view === "agents" && lastGo === "intelligence" ? 3 : -1);
  document.querySelectorAll("#histList .hist").forEach((b, i) => b.classList.toggle("on", i === hi));
  if (hi >= 0) $("histDash").style.top = 8 + hi * 18 + "px";
  document.querySelectorAll("#cards .card").forEach((c) => c.classList.toggle("active", c.dataset.nxGo === lastGo && view !== "universe"));
}
new MutationObserver(setActive).observe(body, { attributes: true, attributeFilter: ["data-nxs-view"] });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeMenu(); closePop(); }
});
setActive();

/* ---------- query-bar dropdowns (real effects only) ---------- */
const menu = $("ddMenu");
let menuFor = null;
const state = { period: "", source: "", evidence: "all", sort: "relevance" };
const periods = ["", "1500–1600", "1600–1700", "1700–1800", "1800–1900"];
const evidenceLabels = { all: "Όλα τα τεκμήρια", claims: "Ισχυρισμοί", contradictions: "Αντιφάσεις", blockers: "Εμπόδια πρόσβασης" };
function options(key) {
  if (key === "period") return periods.map((p) => ({ v: p, t: p || "Όλες οι περίοδοι", s: p ? "προστίθεται στο ερώτημα" : "" }));
  if (key === "source") {
    const counts = new Map();
    for (const d of snapshot?.discoveries || []) if (d.repository) counts.set(d.repository, (counts.get(d.repository) || 0) + 1);
    const list = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([r, n]) => ({ v: r, t: r, s: fmt(n) }));
    return [{ v: "", t: "Όλες οι πηγές" }].concat(list.length ? list : [{ v: "", t: "— καμία πηγή στην τρέχουσα έρευνα", disabled: true }]);
  }
  if (key === "evidence") return Object.entries(evidenceLabels).map(([v, t]) => ({ v, t }));
  if (key === "sort") return [...($("resultSort")?.options || [])].map((o) => ({ v: o.value, t: o.textContent }));
  return [];
}
function placeBelow(el, anchor, align = "left") {
  if (!anchor) return;
  const k = stageScale(), a = anchor.getBoundingClientRect();
  if (mobile()) {
    el.style.left = Math.max(8, Math.min(a.left, innerWidth - el.offsetWidth - 8)) + "px";
    const above = a.top - el.offsetHeight - 6;
    el.style.top = (above > 70 ? above : a.bottom + 6) + "px";
    return;
  }
  const s = stage.getBoundingClientRect();
  let x = (a.left - s.left) / k, y = (a.bottom - s.top) / k + 6;
  if (align === "right") { x = (a.right - s.left) / k + 12; y = (a.top - s.top) / k; }
  el.style.left = Math.min(x, stageW() - el.offsetWidth - 10) + "px";
  el.style.top = Math.min(y, ART_H - el.offsetHeight - 10) + "px";
}
function openMenu(btn) {
  const key = btn.dataset.key;
  if (menuFor === btn) return closeMenu();
  closeMenu();
  if (key === "advanced") {
    findings(() => { const o = document.querySelector(".result-options"); if (o) { o.open = true; o.scrollIntoView({ block: "nearest" }); } });
    return;
  }
  menuFor = btn;
  btn.classList.add("open");
  const cur = state[key];
  menu.innerHTML = options(key).map((o) => `<button type="button" class="opt${o.v === cur ? " cur" : ""}" data-v="${esc(o.v)}"${o.disabled ? " disabled" : ""}>${esc(o.t)}${o.s ? `<small>${esc(o.s)}</small>` : ""}</button>`).join("");
  menu.hidden = false;
  menu.style.minWidth = btn.getBoundingClientRect().width / stageScale() + "px";
  placeBelow(menu, btn);
  menu.querySelector(".opt.cur, .opt")?.focus();
}
function closeMenu() {
  menu.hidden = true;
  menuFor?.classList.remove("open");
  menuFor = null;
}
document.querySelectorAll("#filters .dd").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openMenu(b); }));
document.addEventListener("click", (e) => { if (!menu.hidden && !e.target.closest("#ddMenu")) closeMenu(); });
menu.addEventListener("click", (e) => {
  const opt = e.target.closest(".opt");
  if (!opt || !menuFor) return;
  const key = menuFor.dataset.key, v = opt.dataset.v, btn = menuFor;
  closeMenu();
  apply(key, v, btn);
});
function apply(key, v, btn) {
  state[key] = v;
  const label = options(key).find((o) => o.v === v)?.t || v;
  btn.querySelector(".v").textContent = key === "source" && !v ? "Όλες οι πηγές" : label;
  btn.classList.toggle("changed", key === "period" ? !!v : key === "source" ? !!v : key === "evidence" ? v !== "all" : v !== "relevance");
  if (key === "period") {
    $("operatorQuery").focus();
    return;
  }
  findings(() => {
    if (key === "source") {
      const box = $("resultSearch");
      box.value = v;
      box.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('[data-dossier-section="researchFindings"]')?.click();
    } else if (key === "evidence") {
      window.dispatchEvent(new CustomEvent("jarvis:results-filter", { detail: { filter: v } }));
      document.querySelector('[data-dossier-section="researchFindings"]')?.click();
    } else if (key === "sort") {
      const sel = $("resultSort");
      sel.value = v;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector('[data-dossier-section="researchFindings"]')?.click();
    }
  });
}
// The research filter tabs / sort inside the dossier stay in sync with the dropdowns.
window.addEventListener("jarvis:results-filter", (e) => {
  const v = e.detail?.filter || "all", b = document.querySelector('#filters [data-key="evidence"]');
  state.evidence = v;
  b.querySelector(".v").textContent = evidenceLabels[v] || evidenceLabels.all;
  b.classList.toggle("changed", v !== "all");
});
$("resultSort")?.addEventListener("change", (e) => {
  const b = document.querySelector('#filters [data-key="sort"]');
  state.sort = e.target.value;
  b.querySelector(".v").textContent = e.target.selectedOptions[0]?.textContent || "";
  b.classList.toggle("changed", state.sort !== "relevance");
});
// Period has no separate API field: the dispatch takes one question, so the chosen period is appended to it.
document.addEventListener("submit", (e) => {
  if (e.target !== composer || !state.period) return;
  const q = $("operatorQuery");
  if (q.value.trim() && !q.value.includes(state.period)) q.value = q.value.trim() + " (" + state.period + ")";
}, true);

/* ---------- right column + cards from the live research feed ---------- */
let snapshot = null;
const liveEvents = [];
const laneName = (id) => (window.NABOU_LANES || []).find((l) => l.agentId === id)?.name || (id ? GR.status(String(id).toUpperCase()) : "NABOU//X");
const ACTIVE = ["RUNNING", "PREPARING", "STARTING", "QUEUED", "ACTIVE", "LIVE"];
const BAD = ["FAILED", "ERROR", "BLOCKED", "UNAVAILABLE", "BLOCKED_CONFIGURATION", "CANCELLED", "CANCELED"];
const laneClass = (st) => { st = String(st || "").toUpperCase(); return ACTIVE.includes(st) ? "ACTIVE" : BAD.includes(st) ? "BLOCKED" : ["COMPLETED", "DONE"].includes(st) ? "COMPLETED" : "IDLE"; };
function meter(lit) {
  lit = Math.max(0, Math.min(7, Math.round(lit)));
  return '<span class="m" aria-hidden="true">' + Array.from({ length: 7 }, (_, i) => `<i class="${i < lit ? "lit" : ""}"></i>`).join("") + "</span>";
}
const logMeter = (n) => (n > 0 ? Math.min(7, Math.ceil(Math.log10(n + 1) * 2.4)) : 0);
function renderStatus() {
  const s = snapshot;
  const provisional = Boolean(s && !Array.isArray(s.discoveries) && String(s.mission?.status || "").toUpperCase() === "RUNNING");
  const agents = s?.agents || [];
  const done = agents.filter((a) => laneClass(a.status) === "COMPLETED").length;
  const act = agents.filter((a) => laneClass(a.status) === "ACTIVE").length;
  const repos = new Set((s?.coverage || []).map((c) => c.repository).filter(Boolean));
  const reposHit = new Set((s?.coverage || []).filter((c) => Number(c.hits) > 0).map((c) => c.repository));
  const nRepos = Number(s?.metrics?.repositories_attempted) || repos.size;
  const records = s ? (s.discoveries?.length || 0) + (s.claims?.length || 0) : NaN;
  const conflicts = s ? (Array.isArray(s.contradictions?.records) ? s.contradictions.records.length : 0) : NaN;
  const rows = [
    ["AGENTS", s ? (act ? act + " / " : "") + done + " / " + agents.length : "—", agents.length ? (7 * (done + act)) / agents.length : 0,
      s ? `${done} ολοκληρωμένοι, ${act} ενεργοί, ${agents.length} ερευνητές συνολικά` : "Δεν υπάρχει φορτωμένη έρευνα"],
    ["SOURCES", s && nRepos ? fmt(nRepos) : "—", nRepos ? (7 * reposHit.size) / nRepos : 0, provisional ? "Τα συγκεντρωτικά δεδομένα δεν έχουν δημοσιευτεί ακόμη" : s ? `${nRepos} αποθετήρια ερωτήθηκαν · ${reposHit.size} με αποτελέσματα` : ""],
    ["RECORDS", provisional ? "—" : fmt(records), provisional ? 0 : logMeter(records), provisional ? "Τα τελικά ευρήματα δεν έχουν δημοσιευτεί ακόμη" : s ? `${s.discoveries?.length || 0} καταγεγραμμένες πηγές · ${s.claims?.length || 0} ισχυρισμοί` : ""],
    ["CONFLICTS", provisional ? "—" : fmt(conflicts), provisional ? 0 : Math.min(7, conflicts || 0), provisional ? "Οι αντιφάσεις και τα εμπόδια δεν έχουν συγκεντρωθεί ακόμη" : s ? `${conflicts} καταγεγραμμένες αντιφάσεις · ${s.blockers?.length || 0} εμπόδια πρόσβασης` : ""],
  ];
  $("statRows").innerHTML = rows.map(([k, n, lit, title]) => `<div class="srow" title="${esc(title)}"><span class="k">${k}</span><span class="n">${esc(n)}</span>${meter(lit)}</div>`).join("");
  $("agentsDot").hidden = !act;
}
function evTime(e) {
  const d = new Date(e.created_utc || e.timestamp || e.at || 0);
  return Number.isNaN(d.valueOf()) || !d.valueOf() ? "—" : d.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", hour12: false });
}
// RECENT ACTIVITY: informative real events first; repetitive per-lane completions collapse into one line.
const BLOCK = { REMOTE_ACCESS_BLOCKED: ["αποκλεισμός πρόσβασης", "αποκλεισμοί πρόσβασης"], REMOTE_RATE_LIMITED: ["όριο αιτημάτων", "όρια αιτημάτων"], FAILED: ["αποτυχία", "αποτυχίες"], REMOTE_ERROR: ["σφάλμα πηγής", "σφάλματα πηγής"], ERROR: ["σφάλμα", "σφάλματα"], BLOCKED: ["μπλοκάρισμα", "μπλοκαρίσματα"], UNAVAILABLE: ["μη διαθέσιμη πηγή", "μη διαθέσιμες πηγές"] };
const latest = (list) => list.reduce((m, e) => (String(e.created_utc || "") > m ? String(e.created_utc || "") : m), "");
const earliest = (list) => list.reduce((m, e) => (!m || String(e.created_utc || "") < m ? String(e.created_utc || "") : m), "");
function activityItems() {
  const s = snapshot;
  const all = [...(s?.events || [])];
  for (const e of liveEvents) if (!all.some((x) => x.event_id && x.event_id === e.event_id)) all.push(e);
  const items = [];
  const st = (e) => String(e.status || "").toUpperCase();
  // live, still-running lane activity (only while something is actually running)
  const running = all.filter((e) => ACTIVE.includes(st(e)));
  const finishedLanes = new Set(all.filter((e) => e.event_type === "agent_completed" || laneClass(e.status) === "COMPLETED").map((e) => e.agent_id));
  const stillRunning = new Map();
  for (const e of running) if (!finishedLanes.has(e.agent_id)) stillRunning.set(e.agent_id, e);
  if (stillRunning.size) {
    const last = [...stillRunning.values()].sort((x, y) => String(y.created_utc || "").localeCompare(String(x.created_utc || "")))[0];
    items.push({ at: latest([...stillRunning.values()]), title: stillRunning.size === 1 ? laneName(last.agent_id) + " σε εξέλιξη" : stillRunning.size + " γραμμές σε εξέλιξη", sub: GR.status(last.phase ? String(last.phase).toUpperCase() : last.status), cls: "warn", detail: last.detail });
  }
  // access problems, grouped by kind
  const bad = all.filter((e) => BLOCK[st(e)]);
  if (bad.length) {
    const by = new Map();
    for (const e of bad) by.set(st(e), (by.get(st(e)) || 0) + 1);
    const parts = [...by].sort((x, y) => y[1] - x[1]).map(([k, n]) => n + " " + BLOCK[k][n === 1 ? 0 : 1]);
    const failed = (by.get("FAILED") || 0) + (by.get("ERROR") || 0) + (by.get("REMOTE_ERROR") || 0);
    items.push({ at: latest(bad), title: failed ? "Αποτυχίες και εμπόδια πηγών" : "Εμπόδια πρόσβασης σε πηγές", sub: parts.join(" · "), cls: "" });
  }
  // completions collapsed
  const done = all.filter((e) => e.event_type === "agent_completed" || (laneClass(e.status) === "COMPLETED" && e.agent_id));
  if (done.length) {
    const lanes = new Set(done.map((e) => e.agent_id));
    const none = new Set(done.filter((e) => /NO_CANDIDATE/i.test(String(e.phase || "")) || /^0 candidate/.test(String(e.detail || ""))).map((e) => e.agent_id)).size;
    const sub = none && none < lanes.size ? (lanes.size - none) + " με εγγραφές · " + none + " χωρίς υποψήφια" : none ? "χωρίς υποψήφια γεγονότα προς επαλήθευση" : "";
    items.push({ at: latest(done), title: lanes.size + (lanes.size === 1 ? " γραμμή ολοκληρώθηκε" : " γραμμές ολοκληρώθηκαν"), sub, cls: "ok" });
  }
  if (s) {
    const related = (s.discoveries || []).filter((d) => ["TARGET_MATCH", "POSSIBLE_TARGET"].includes(d.topical_match?.category)).length;
    const repos = new Set((s.discoveries || []).map((d) => d.repository).filter(Boolean)).size;
    const claims = s.claims?.length || 0, contra = Array.isArray(s.contradictions?.records) ? s.contradictions.records.length : 0;
    const at = s.generated_utc || latest(all);
    if (contra) items.push({ at, title: contra + (contra === 1 ? " αντίφαση" : " αντιφάσεις"), sub: "καταγράφηκαν στα τεκμήρια", cls: "" });
    if (claims) items.push({ at, title: claims + (claims === 1 ? " ισχυρισμός" : " ισχυρισμοί"), sub: "για έλεγχο στο πρωτότυπο", cls: "warn" });
    if (s.discoveries?.length) items.push({ at, title: fmt(related) + " σχετικές αναφορές", sub: "από " + fmt(s.discoveries.length) + " εγγραφές σε " + repos + " πηγές", cls: "warn" });
    const m = s.mission || {};
    if (m.status) items.push({ at, title: "Έρευνα #" + (s.run_id || "—") + ": " + GR.status(m.status), sub: m.answer_status ? GR.status(m.answer_status) : m.target || "", cls: laneClass(m.status) === "COMPLETED" ? "ok" : "" });
  }
  const starts = all.filter((e) => e.event_type === "agent_started" || e.event_type === "agent_preparing");
  if (starts.length) items.push({ at: earliest(starts), title: "Έναρξη έρευνας", sub: new Set(all.map((e) => e.agent_id).filter(Boolean)).size + " γραμμές σε δράση", cls: "warn" });
  return items.sort((x, y) => String(y.at || "").localeCompare(String(x.at || "")) || 0).slice(0, 5);
}
function renderActivity() {
  const rows = activityItems();
  $("activityLive").innerHTML = rows.length
    ? rows.map((r) => `<div class="row" title="${esc(r.title + (r.sub ? " — " + r.sub : "") + (r.detail ? " — " + r.detail : ""))}"><i class="dot ${r.cls}"></i><span class="t">${esc(evTime({ created_utc: r.at }))}</span><span class="ti">${esc(r.title)}</span><span class="su">${esc(r.sub || "")}</span></div>`).join("")
    : '<div class="empty">Δεν έχει καταγραφεί δραστηριότητα.</div>';
}
let miniBuilt = false;
function renderNodes() {
  const lanes = window.NABOU_LANES || [], C = window.NABOU_CHART;
  if (!lanes.length || !C) return;
  if (!miniBuilt) {
    // Same coastline (Natural Earth 10m), same Mercator projection and coordinates as the main chart.
    const d = (C.svg.match(/id="bigP" d="([^"]+)"/) || [])[1] || "";
    const core = C.core, hub = C.analysis;
    const xs = [...lanes.map((l) => l.x), core[0]], ys = [...lanes.map((l) => l.y), core[1]], pad = 70;
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
    let rh = "";
    for (let j = 0; j < 16; j++) {
      const a = (j * Math.PI) / 8, L = 2400, cls = j % 4 === 0 ? "" : j % 2 ? "r" : "g";
      rh += `<path class="mrh ${cls}" d="M${core[0].toFixed(0)},${core[1].toFixed(0)}L${(core[0] + Math.cos(a) * L).toFixed(0)},${(core[1] + Math.sin(a) * L).toFixed(0)}"/>`;
    }
    const rose = (x, y, r) => `<g class="mrose" transform="translate(${x.toFixed(0)},${y.toFixed(0)})"><circle r="${r}"/>` +
      [0, 90, 180, 270].map((a) => `<g transform="rotate(${a})"><path d="M0,${-r * 1.25}L${r * 0.22},0L0,0Z"/><path class="s" d="M0,${-r * 1.25}L${-r * 0.22},0L0,0Z"/></g>`).join("") + "</g>";
    $("miniChart").innerHTML = `<svg viewBox="${x0.toFixed(0)} ${y0.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" preserveAspectRatio="xMidYMid meet" overflow="visible" aria-hidden="true">` +
      `<defs><radialGradient id="mwRed" cx=".36" cy=".3"><stop offset="0" stop-color="#cf5a43"/><stop offset=".5" stop-color="#8e231b"/><stop offset="1" stop-color="#5a110d"/></radialGradient>` +
      `<radialGradient id="mwGold" cx=".36" cy=".3"><stop offset="0" stop-color="#f6e2a4"/><stop offset=".5" stop-color="#b48d45"/><stop offset="1" stop-color="#6e5222"/></radialGradient>` +
      `<radialGradient id="mwOx" cx=".36" cy=".3"><stop offset="0" stop-color="#7b2a20"/><stop offset=".6" stop-color="#4c0e0b"/><stop offset="1" stop-color="#2a0705"/></radialGradient></defs>` +
      `<g>${rh}</g><path class="ml" d="${d}"/>` +
      `<g>${lanes.map((l) => `<path class="mn" d="M${l.x.toFixed(0)},${l.y.toFixed(0)}L${(l.kind === "archive" ? core[0] : hub[0]).toFixed(0)},${(l.kind === "archive" ? core[1] : hub[1]).toFixed(0)}"/>`).join("")}</g>` +
      rose(core[0], core[1], 40) + rose(hub[0], hub[1], 24) +
      lanes.map((l, i) => `<g data-i="${i}"><circle class="md IDLE" cx="${l.x.toFixed(0)}" cy="${l.y.toFixed(0)}" r="${l.kind === "archive" ? 22 : 17}"><title>${esc(l.name)}</title></circle>` +
        `<path class="mx" hidden d="M${(l.x - 9).toFixed(0)},${(l.y - 9).toFixed(0)}l18,18m0,-18l-18,18"/></g>`).join("") + "</svg>";
    miniBuilt = true;
  }
  const agents = snapshot?.agents || [];
  let active = 0;
  document.querySelectorAll("#miniChart [data-i]").forEach((g) => {
    const id = lanes[+g.dataset.i]?.agentId;
    const a = agents.find((x) => x.id === id || x.agent_id === id);
    const cls = a ? laneClass(a.status) : "IDLE";
    if (cls === "ACTIVE") active++;
    const c = g.querySelector(".md");
    c.setAttribute("class", "md " + cls);
    c.querySelector("title").textContent = laneName(id) + " — " + (a ? GR.status(a.status) : "χωρίς δεδομένα");
    g.querySelector(".mx").toggleAttribute("hidden", cls !== "BLOCKED");
  });
  $("nodeCount").textContent = lanes.length + " NODES" + (snapshot ? " · " + (active ? active + " ενεργοί" : agents.length + " στην έρευνα") : "");
}
function renderCards() {
  const s = snapshot;
  const lanes = window.NABOU_LANES || [];
  const related = (s?.discoveries || []).filter((d) => ["TARGET_MATCH", "POSSIBLE_TARGET"].includes(d.topical_match?.category)).length + (s?.claims?.length || 0);
  const repos = new Set((s?.discoveries || []).map((d) => d.repository).filter(Boolean));
  $("cardPlaces").textContent = lanes.filter((l) => l.kind === "archive").length + " αρχεία";
  $("cardEvents").textContent = s ? fmt(s.events?.length || 0) + " συμβάντα" : "—";
  $("cardPeople").textContent = s ? fmt(related) + " αναφορές" : "—";
  $("cardSources").textContent = s ? fmt(repos.size) + " πηγές" : "—";
}
function renderMission() {
  const m = snapshot?.mission || {};
  const target = m.target || snapshot?.research_answer?.question || "";
  $("heroQuery").textContent = target ? "«" + target + "» · #" + (snapshot?.run_id || "—") : "";
  const q = $("operatorQuery");
  q.placeholder = target ? "Τρέχουσα: " + target + " — νέο ερώτημα…" : "Τι θέλετε να ερευνήσετε;";
  const blockers = snapshot?.blockers?.length || 0;
  $("moonPhase").textContent = snapshot ? GR.status(m.status || "—") + (blockers ? " · " + blockers + " εμπόδια" : "") : "Χωρίς φορτωμένη έρευνα";
}
function renderAll() {
  renderStatus();
  renderActivity();
  renderNodes();
  renderCards();
  renderMission();
}
connectResearchFeed({
  onSnapshot: (s) => {
    snapshot = s;
    liveEvents.length = 0;
    renderAll();
  },
  onEvent: (e) => {
    liveEvents.push(e);
    if (liveEvents.length > 60) liveEvents.shift();
    renderActivity();
  },
  onReset: () => {
    snapshot = null;
    liveEvents.length = 0;
    renderAll();
  },
  onState: () => {},
});
renderAll();
// lanes are published by chamber.js (deferred classic script); refresh the mini chart once they exist
if (!window.NABOU_LANES) addEventListener("load", renderAll, { once: true });

