import { connectResearchFeed } from "./live-bridge.js";
import { overview, historyEntry, mergeHistory, statusLabel, isMissionInProgress } from "./research-overview.js";
import { dossierMarkup } from "./research-dossier.js?v=v2-phase2-1";
import { renderOverviewStory } from "./research-narrative-view.js";
import {
  loadMyResearch,
  saveMyResearch,
  clearMyResearch,
  isMyResearchDone,
  isMine,
  updateFromSnapshot,
  findPublishedRun,
  researchStage,
  progressHtml,
  reminderHtml,
} from "./my-research.js";
const $ = (id) => document.getElementById(id);
const summary = $("researchOverview"),
  list = $("historyList"),
  search = $("historySearch"),
  status = $("historyStatus");
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const storageKey = "nabou-research-history-v1";

/** Typed query the operator just sent — available before the backend publishes mission.purpose. */
function clientKnownQuery(snapshot) {
  // Only overlay the typed query while this mission is still in progress and
  // the snapshot has not yet published purpose/target.
  if (snapshot && !isMissionInProgress(snapshot)) return "";
  if (String(snapshot?.mission?.purpose || snapshot?.mission?.target || "").trim()) return "";
  try {
    return String(document.body?.dataset?.operatorQuery || "").trim();
  } catch {
    return "";
  }
}

let catalog = [],
  recent = [],
  current = "",
  unavailable = false,
  storageAvailable = true;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  recent = Array.isArray(saved) ? saved : [];
} catch {
  storageAvailable = false;
}
function dateLabel(value) {
  if (!value) return "Ημερομηνία μη διαθέσιμη";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Ημερομηνία μη διαθέσιμη"
    : new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
// Αναζήτηση χωρίς τόνους/πεζά-κεφαλαία: NFD + αφαίρεση διακριτικών, ς → σ.
const fold = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/ς/g, "σ");
function renderHistory() {
  const all = mergeHistory(catalog, recent),
    q = fold(search.value.trim());
  const rows = all.filter((r) => fold([r.target, r.run_id, r.date_range].join(" ")).includes(q));
  status.textContent =
    (unavailable
      ? "Ο κατάλογος δεν είναι διαθέσιμος. Εμφανίζονται μόνο έρευνες που έχουν προβληθεί εδώ. "
      : all.length + " αποθηκευμένες έρευνες. ") +
    (storageAvailable ? "" : "Η τοπική αποθήκευση δεν είναι διαθέσιμη. ");
  list.innerHTML = rows.length
    ? rows
        .slice(0, 100)
        .map(
          (r) =>
            '<button type="button" class="history-entry" data-history-run="' +
            r.run_id +
            '"' +
            (r.run_id === current ? ' aria-current="true"' : "") +
            "><strong>" +
            escape(r.target) +
            "</strong><span>" +
            escape([r.date_range, statusLabel(r.status)].filter(Boolean).join(" · ")) +
            "</span><small>" +
            escape(dateLabel(r.generated_utc)) +
            " · #" +
            r.run_id +
            (r.run_id === current ? " · Προβάλλεται" : "") +
            "</small></button>",
        )
        .join("")
    : '<p class="history-empty">' +
      (q ? "Δεν βρέθηκαν έρευνες με αυτό το θέμα." : "Δεν υπάρχουν ακόμη διαθέσιμες έρευνες.") +
      "</p>";
  if (rows.length > 100)
    status.textContent +=
      " Εμφανίζονται οι 100 πιο πρόσφατες· χρησιμοποιήστε την αναζήτηση για τις υπόλοιπες.";
}
async function loadHistory() {
  $("historyRetry").disabled = true;
  try {
    const response = await fetch("../command-center/live/index.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error("history_unavailable");
    const data = await response.json();
    if (data.schema !== "nabou-research-history-v1" || !Array.isArray(data.runs))
      throw Error("invalid_history");
    catalog = data.runs;
    unavailable = false;
    checkPublished();
  } catch {
    unavailable = true;
  }
  $("historyRetry").hidden = !unavailable;
  $("historyRetry").disabled = false;
  renderHistory();
}
search.addEventListener("input", renderHistory);
$("historyRetry").addEventListener("click", loadHistory);
list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-history-run]");
  if (!button) return;
  $("researchRunId").value = button.dataset.historyRun;
  $("openResearchRun").requestSubmit();
  $("researchHistory").open = false;
  $("resultsDrawer").scrollTop = 0;
});
let dossierRun = "";
function renderDossier(snapshot) {
  const run = String(snapshot?.run_id || ""),
    sameRun = !!run && run === dossierRun,
    markup = dossierMarkup(snapshot);
  for (const key of ["progress", "pending", "updates"]) {
    const content = $("research" + key[0].toUpperCase() + key.slice(1) + "Content");
    const open = sameRun
      ? [...content.querySelectorAll("details")]
          .filter((element) => element.open)
          .map((element) => element.dataset.dossierKey)
      : [];
    content.innerHTML = markup[key];
    [...content.querySelectorAll("details")].forEach((element, index) => {
      element.open = open.includes(element.dataset.dossierKey);
    });
  }
  dossierRun = run;
}
function empty(message) {
  if (showMineProgress()) return;
  $("researchPermalink").hidden = true;
  document.title = "NABOU — Έρευνα";
  summary.innerHTML = "<p>" + escape(message) + "</p>";
  renderDossier(null);
}
document.querySelector(".dossier-navigation").addEventListener("click", (event) => {
  const button = event.target.closest("[data-dossier-section]");
  if (!button) return;
  const section = $(button.dataset.dossierSection);
  section.focus({ preventScroll: true });
  section.scrollIntoView({
    block: "start",
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
});
/* ---------- «Η έρευνά μου»: the user's own question survives a reload ---------- */
let mine = loadMyResearch(),
  mineLive = null,
  viewingMine = false,
  liveBlocked = false,
  shownSnapshot = null;
const runParam = () => new URLSearchParams(location.search).get("run") || "";
function showMineProgress() {
  if (!mine || !viewingMine || isMyResearchDone(mine)) return false;
  const stage = researchStage(mine, mineLive);
  $("researchPermalink").hidden = true;
  document.title = "NABOU · " + mine.query;
  summary.innerHTML = progressHtml(mine, stage, { liveBlocked });
  document.body.dataset.myResearch = stage.key;
  return true;
}
function rememberMine(next) {
  mine = next ? saveMyResearch(next) || next : null;
  if (!mine) delete document.body.dataset.myResearch;
}
function openRun(id) {
  $("researchRunId").value = id;
  $("openResearchRun").requestSubmit();
}
/** Wait for the saved question again (after a reload, or «Δείξε το»). */
function followMine() {
  if (!mine) return;
  if (isMyResearchDone(mine)) {
    openRun(mine.run_id);
    viewingMine = true;
    return;
  }
  document.body.dataset.operatorQuery = mine.query;
  window.dispatchEvent(
    new CustomEvent("jarvis:dispatch-accepted", {
      detail: {
        request_id: mine.request_id,
        query: mine.query,
        started_at: mine.started_at,
        restored: true,
      },
    }),
  );
}
/** GitHub fallback: the published catalogue shows the run even when the live server is unreachable. */
function checkPublished() {
  if (!mine || isMyResearchDone(mine)) return;
  const hit = findPublishedRun(mine, catalog);
  if (!hit) return;
  rememberMine({ ...mine, run_id: hit.run_id, status: hit.status || "COMPLETED", finished_at: Date.now() });
  if (viewingMine) {
    openRun(hit.run_id);
    viewingMine = true;
  } else if (shownSnapshot) render(shownSnapshot);
}
setInterval(() => {
  if (!mine || isMyResearchDone(mine)) return;
  if (document.visibilityState !== "hidden") loadHistory();
}, 60000);
setInterval(() => {
  if (mine && viewingMine && !isMyResearchDone(mine)) showMineProgress();
}, 30000);
summary.addEventListener("click", (event) => {
  const action = event.target.closest("[data-my-research]")?.dataset.myResearch;
  if (action === "forget") {
    rememberMine(null);
    clearMyResearch();
    viewingMine = false;
    $("latestResearch").click();
  } else if (action === "show") followMine();
});
window.addEventListener("jarvis:research-selection", () => {
  viewingMine = false;
});
function render(snapshot) {
  shownSnapshot = snapshot;
  const knownQuery = clientKnownQuery(snapshot);
  const data = overview(snapshot, { knownQuery });
  const link = $("researchPermalink");
  link.href = "?run=" + encodeURIComponent(snapshot.run_id);
  link.hidden = false;
  document.title = "NABOU · " + (data.title || "Έρευνα");
  const own = isMine(mine, snapshot);
  if (own && isMyResearchDone(mine)) document.body.dataset.myResearch = "published";
  else delete document.body.dataset.myResearch;
  // Story first when ready; while in progress, Πορεία stays open with the typed query.
  summary.innerHTML =
    (own
      ? '<p class="my-research-kicker">Το δικό σου ερώτημα · ' +
        escape(isMyResearchDone(mine) ? "ολοκληρώθηκε" : "τρέχει") +
        "</p>"
      : reminderHtml(mine, researchStage(mine, mineLive))) +
    renderOverviewStory(snapshot, data, { knownQuery });
}
empty("Επιλέξτε μια προηγούμενη έρευνα ή ξεκινήστε ένα νέο ερώτημα.");
connectResearchFeed({
  onReset: () => {
    current = "";
    empty("Φόρτωση της επιλεγμένης έρευνας…");
    renderHistory();
  },
  onSnapshot: (snapshot) => {
    const knownQuery = clientKnownQuery(snapshot);
    const item = historyEntry(snapshot, knownQuery);
    if (item) {
      current = item.run_id;
      recent = mergeHistory(recent, [item]).slice(0, 50);
      try {
        localStorage.setItem(storageKey, JSON.stringify(recent));
      } catch {
        storageAvailable = false;
      }
      renderHistory();
    }
    renderDossier(snapshot);
    if (isMine(mine, snapshot)) {
      viewingMine = true;
      mineLive = snapshot;
      rememberMine(updateFromSnapshot(mine, snapshot));
    }
    if (!(isMine(mine, snapshot) && showMineProgress())) render(snapshot);
    if (window.NABOU_FACT_PINS) window.NABOU_FACT_PINS.fromSnapshot(snapshot);
  },
  onState: (mode) => {
    liveBlocked = mode !== "LIVE";
    if (mode === "OFFLINE" && !current)
      empty("Δεν ήταν δυνατή η φόρτωση αποτελεσμάτων. Δοκιμάστε την πιο πρόσφατη ή μια προηγούμενη έρευνα.");
  },
});
window.addEventListener("jarvis:dispatch-accepted", (event) => {
  current = "";
  const query = String(
    event.detail?.query || document.body?.dataset?.operatorQuery || "",
  ).trim();
  const requestId = String(event.detail?.request_id || "");
  if (query && requestId) {
    if (!event.detail?.restored || mine?.request_id !== requestId) {
      rememberMine({ query, request_id: requestId, started_at: Number(event.detail?.started_at) || Date.now() });
      mineLive = null;
    }
    viewingMine = true;
    renderDossier(null);
    showMineProgress();
  } else if (query) {
    // Show title + question immediately from what Leonidas typed; do not wait for payload.
    const snap = { mission: { status: "RUNNING", purpose: query, target: query } };
    const data = overview(snap, { knownQuery: query });
    $("researchPermalink").hidden = true;
    document.title = "NABOU · " + data.title;
    summary.innerHTML = renderOverviewStory(snap, data, { knownQuery: query });
    renderDossier(snap);
  } else {
    empty(
      "Το αίτημα παραλήφθηκε. Αναμένουμε τη δική σας έρευνα· δεν εμφανίζονται αποτελέσματα άλλου αιτήματος.",
    );
  }
  renderHistory();
});
loadHistory();
// After every deferred script has registered its listeners: bring back the user's own question.
document.addEventListener("DOMContentLoaded", () => {
  if (!mine) return;
  const run = runParam();
  if (run) {
    viewingMine = run === mine.run_id;
    return;
  }
  followMine();
});
