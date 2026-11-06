/* Floating story panel for ΙΣΤΟΡΙΑ / ΕΔΑΦΗ / ΠΡΟΣΩΠΑ. Keeps the map visible. */
import { connectResearchFeed } from "./live-bridge.js";
import {
  escapeHtml,
  isNarrativeReady,
  renderStoryHtml,
  renderCountsDetails,
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
  panel.setAttribute("aria-label", "Αφήγηση έρευνας");
  panel.innerHTML =
    '<div class="nsp-head"><p class="nsp-kicker" id="nspKicker">Αφήγηση</p><h2 id="nspTitle"></h2>' +
    '<button type="button" class="nsp-close" id="nspClose" aria-label="Κλείσιμο αφήγησης">×</button></div>' +
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
    return { kicker: "ΕΔΑΦΗ", titleFallback: "Τόποι στην αφήγηση", storyMode: "territory" };
  if (which === "people")
    return { kicker: "ΠΡΟΣΩΠΑ", titleFallback: "Πρόσωπο στην αφήγηση", storyMode: "people" };
  return { kicker: "ΙΣΤΟΡΙΑ", titleFallback: "Χρονολογική αφήγηση", storyMode: "history" };
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
    titleEl.textContent = snapshot.mission?.target || meta.titleFallback;
    body.innerHTML = emptyHtml(
      "Η αφήγηση δεν είναι ακόμη έτοιμη. Μόλις ολοκληρωθεί η σύνθεση, θα εμφανιστεί εδώ μαζί με τον χάρτη.",
    );
    return;
  }
  titleEl.textContent = narrative.title_el || snapshot.mission?.target || meta.titleFallback;
  const discoveries = Array.isArray(snapshot.discoveries) ? snapshot.discoveries : [];
  const related = discoveries.filter((d) =>
    ["TARGET_MATCH", "POSSIBLE_TARGET"].includes(d.topical_match?.category),
  ).length;
  const claims = Array.isArray(snapshot.claims) ? snapshot.claims.length : 0;
  const blockers = Array.isArray(snapshot.blockers) ? snapshot.blockers.length : 0;
  const contradictions = Array.isArray(snapshot.contradictions?.records)
    ? snapshot.contradictions.records.length
    : 0;
  body.innerHTML =
    renderStoryHtml(narrative, { mode: meta.storyMode, heading: false }) +
    renderCountsDetails([
      [related, "Σχετικές αναφορές"],
      [claims, "Ιστορικοί ισχυρισμοί"],
      [contradictions, "Καταγεγραμμένες αντιφάσεις"],
      [blockers, "Εμπόδια πρόσβασης"],
    ]);
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
