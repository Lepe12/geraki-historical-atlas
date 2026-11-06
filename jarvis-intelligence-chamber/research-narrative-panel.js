/* Floating story panel for ΙΣΤΟΡΙΑ / ΕΔΑΦΗ / ΠΡΟΣΩΠΑ. Keeps the map visible. */
import { connectResearchFeed } from "./live-bridge.js";
import {
  escapeHtml,
  isNarrativeReady,
  renderStoryHtml,
  renderResearchPath,
  articleTitle,
} from "./research-narrative-view.js";

const PANEL_ID = "narrativeStoryPanel";
let snapshot = null;
let mode = "history";

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;
  panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.className = "narrative-story-panel hidden";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Ιστορικό άρθρο");
  panel.innerHTML =
    '<div class="nsp-head"><p class="nsp-kicker" id="nspKicker"></p><h2 id="nspTitle"></h2>' +
    '<button type="button" class="nsp-close" id="nspClose" aria-label="Κλείσιμο άρθρου">×</button></div>' +
    '<div class="nsp-body" id="nspBody"></div>';
  const host =
    document.getElementById("stage") ||
    document.getElementById("mapStage") ||
    document.body;
  host.appendChild(panel);
  panel.querySelector("#nspClose").addEventListener("click", close);
  return panel;
}

function modeMeta(which) {
  if (which === "territory")
    return { kicker: "ΕΔΑΦΗ", titleFallback: "Τόποι του άρθρου", storyMode: "territory" };
  if (which === "people")
    return { kicker: "ΠΡΟΣΩΠΑ", titleFallback: "Πρόσωπο του άρθρου", storyMode: "people" };
  return { kicker: "ΙΣΤΟΡΙΑ", titleFallback: "Ιστορικό άρθρο", storyMode: "history" };
}

function emptyHtml(message) {
  return "<p class=\"nsp-empty\">" + escapeHtml(message) + "</p>";
}

function render() {
  const panel = ensurePanel();
  const narrative = snapshot?.research_answer?.greek_narrative;
  const meta = modeMeta(mode);
  const titleEl = panel.querySelector("#nspTitle");
  const kicker = panel.querySelector("#nspKicker");
  const body = panel.querySelector("#nspBody");
  kicker.textContent = meta.kicker;
  if (!snapshot) {
    titleEl.textContent = meta.titleFallback;
    body.innerHTML = emptyHtml("Δεν υπάρχει φορτωμένη έρευνα. Ξεκινήστε ή ανοίξτε μια προηγούμενη.");
    return;
  }
  if (!isNarrativeReady(narrative)) {
    let typed = "";
    try {
      typed = String(document.body?.dataset?.operatorQuery || "").trim();
    } catch {}
    titleEl.textContent =
      snapshot.mission?.target ||
      snapshot.mission?.purpose ||
      typed ||
      meta.titleFallback;
    body.innerHTML = emptyHtml(
      "Η αφήγηση δεν είναι ακόμη έτοιμη. Μόλις ολοκληρωθεί η σύνθεση, θα εμφανιστεί εδώ μαζί με τον χάρτη.",
    );
    return;
  }
  titleEl.textContent = articleTitle(narrative, snapshot.mission?.target || meta.titleFallback);
  // Closed surface = article + Πηγές + map; found/passed/cut and «Τι δεν βρέθηκε» stay in Πορεία έρευνας.
  body.innerHTML =
    renderStoryHtml(narrative, { mode: meta.storyMode, heading: false }) +
    renderResearchPath(narrative);
  if (window.NABOU_FACT_PINS) window.NABOU_FACT_PINS.fromSnapshot(snapshot);
}

export function openNarrativePanel(which = "history") {
  mode = which === "territory" || which === "people" ? which : "history";
  const panel = ensurePanel();
  panel.hidden = false;
  panel.classList.remove("hidden");
  document.body.dataset.narrativePanel = mode;
  render();
  panel.querySelector("#nspClose")?.focus({ preventScroll: true });
}

export function closeNarrativePanel() {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  panel.hidden = true;
  panel.classList.add("hidden");
  delete document.body.dataset.narrativePanel;
}

export function close() {
  closeNarrativePanel();
}

connectResearchFeed({
  onSnapshot: (s) => {
    snapshot = s;
    if (!document.getElementById(PANEL_ID)?.hidden) render();
  },
  onReset: () => {
    snapshot = null;
    if (!document.getElementById(PANEL_ID)?.hidden) render();
  },
  onState: () => {},
});

window.NABOU_NARRATIVE_PANEL = { open: openNarrativePanel, close: closeNarrativePanel };
