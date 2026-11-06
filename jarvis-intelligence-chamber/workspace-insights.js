import { connectResearchFeed } from "./live-bridge.js";
import { overview, historyEntry, mergeHistory, statusLabel, isMissionInProgress } from "./research-overview.js";
import { dossierMarkup } from "./research-dossier.js?v=v2-phase2-1";
import { renderOverviewStory } from "./research-narrative-view.js";
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
  $("researchPermalink").hidden = true;
  document.title = "NABOU//X — Έρευνα";
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
    const data = overview(snapshot, { knownQuery });
    renderDossier(snapshot);
    const link = $("researchPermalink");
    link.href = "?run=" + encodeURIComponent(snapshot.run_id);
    link.hidden = false;
    document.title = "NABOU//X · " + (data.title || "Έρευνα");
    // Story first when ready; while in progress, Πορεία stays open with the typed query.
    summary.innerHTML = renderOverviewStory(snapshot, data, { knownQuery });
    if (window.NABOU_FACT_PINS) window.NABOU_FACT_PINS.fromSnapshot(snapshot);
  },
  onState: (mode) => {
    if (mode === "OFFLINE" && !current)
      empty("Δεν ήταν δυνατή η φόρτωση αποτελεσμάτων. Δοκιμάστε την πιο πρόσφατη ή μια προηγούμενη έρευνα.");
  },
});
window.addEventListener("jarvis:dispatch-accepted", (event) => {
  current = "";
  const query = String(
    event.detail?.query || document.body?.dataset?.operatorQuery || "",
  ).trim();
  if (query) {
    // Show title + question immediately from what Leonidas typed; do not wait for payload.
    const snap = { mission: { status: "RUNNING", purpose: query, target: query } };
    const data = overview(snap, { knownQuery: query });
    $("researchPermalink").hidden = true;
    document.title = "NABOU//X · " + data.title;
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

