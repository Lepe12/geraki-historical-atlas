/* NABOU reader shell — Geraki full-page reading template.
   Reuses article mold + real portolan map (zoom / reset / scale).
   Hides laboratory chrome; does not rewrite chamber.js or the article mold. */
import { connectResearchFeed } from "./live-bridge.js";
import {
  overview,
  historyEntry,
  mergeHistory,
  isMissionInProgress,
  historyStatusLabel,
  waitingPhrase,
  resolveResearchQuery,
  resolveResearchTitle,
} from "./research-overview.js";
import {
  escapeHtml,
  isNarrativeReady,
  renderStoryHtml,
  renderResearchPath,
  articleTitle,
  wrapTitleHtml,
} from "./research-narrative-view.js";

const $ = (id) => document.getElementById(id);
const storageKey = "nabou-research-history-v1";

function ensureShell() {
  if ($("nabouReader")) return $("nabouReader");
  const shell = document.createElement("div");
  shell.id = "nabouReader";
  shell.className = "nabou-reader";
  shell.innerHTML =
    '<header class="nr-top">' +
    '<div class="nr-mark"><img src="./assets/nautical/img/astrolabe.png" alt="" width="38" height="38" />NABOU</div>' +
    '<div class="nr-ask" id="nrAskSlot"></div>' +
    "</header>" +
    '<div class="nr-stage">' +
    '<aside class="nr-history" aria-label="Οι έρευνές σου">' +
    "<h2>Οι έρευνές σου</h2>" +
    '<div id="nrHistoryList"></div>' +
    "</aside>" +
    '<article class="nr-article" id="nrArticle" aria-live="polite"></article>' +
    '<div class="nr-mapwrap" id="nrMapSlot" aria-label="Χάρτης τόπων του άρθρου">' +
    '<p class="nr-map-caption">Τόποι του άρθρου</p>' +
    "</div>" +
    "</div>" +
    '<details class="nr-lab">' +
    "<summary>Εργαστήριο έρευνας</summary>" +
    '<div id="nrLabSlot"></div>' +
    "</details>";
  const stage = $("stage") || document.body;
  stage.insertBefore(shell, stage.firstChild);
  return shell;
}

function mountChrome() {
  const shell = ensureShell();
  document.body.classList.add("nabou-reader-active");

  const ask = $("nrAskSlot");
  const form = $("operatorCommand");
  if (ask && form && form.parentElement !== ask) {
    ask.appendChild(form);
    // Template wording: search, not laboratory jargon.
    const btn = $("executeQuery");
    if (btn) {
      btn.setAttribute("aria-label", "Αναζήτηση");
      btn.setAttribute("title", "Αναζήτηση");
    }
    const label = $("qLabel");
    if (label) label.textContent = "ΑΝΑΖΗΤΗΣΗ";
  }

  const mapSlot = $("nrMapSlot");
  const chart = $("chartFrame");
  if (mapSlot && chart && chart.parentElement !== mapSlot) {
    mapSlot.appendChild(chart);
  }

  // Keep laboratory DOM alive for existing scripts, but out of the reading frame.
  const lab = $("nrLabSlot");
  if (lab) {
    for (const id of ["resultsDrawer", "v2aside", "cards", "histList", "filters", "nxsAgentsPage", "activityStrip"]) {
      const el = $(id);
      if (el && el.parentElement !== lab) lab.appendChild(el);
    }
  }
}

function titleParts(narrative, fallback) {
  const full = articleTitle(narrative, fallback);
  // Split «Name (aka, years)» into name + aka line when possible.
  const m = full.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (m) return { name: m[1].trim(), aka: m[2].trim(), full };
  return { name: full, aka: "", full };
}

export function renderReaderArticle(snapshot, data = {}, { knownQuery = "" } = {}) {
  const narrative = data?.narrative || snapshot?.research_answer?.greek_narrative;
  const inProgress = isMissionInProgress(snapshot);
  const queryText = resolveResearchQuery(snapshot, knownQuery);
  const ready = isNarrativeReady(narrative);
  const title = resolveResearchTitle(snapshot, ready ? narrative : null, knownQuery);
  const pathOpen = inProgress && !ready;

  const ornament = '<div class="nr-ornament" aria-hidden="true"></div>';

  if (inProgress && !ready) {
    return (
      ornament +
      "<h1>" +
      wrapTitleHtml(title || queryText || "Αναζήτηση") +
      "</h1>" +
      '<p class="nr-lede">Το ερώτημά σας: ' +
      escapeHtml(queryText || "—") +
      "</p>" +
      '<p class="nr-waiting" role="status">' +
      escapeHtml(waitingPhrase(queryText || title)) +
      "</p>" +
      renderResearchPath(narrative, "", { open: pathOpen })
    );
  }

  if (ready) {
    const parts = titleParts(narrative, title || queryText);
    const empty =
      narrative.status === "NO_USABLE_EVIDENCE" ||
      !(Array.isArray(narrative.paragraphs) && narrative.paragraphs.some((p) => p?.text_el));
    const story = empty
      ? ""
      : renderStoryHtml(narrative, { mode: "default", heading: false, fallbackTitle: parts.full });
    return (
      ornament +
      "<h1>" +
      wrapTitleHtml(parts.name || parts.full) +
      "</h1>" +
      (parts.aka ? '<p class="nr-aka">' + wrapTitleHtml(parts.aka) + "</p>" : "") +
      '<p class="nr-lede">Οι τόποι του άρθρου φαίνονται στον χάρτη δεξιά.</p>' +
      (empty
        ? '<p class="nr-empty narrative-empty" role="status">Δεν μπόρεσα να διαβάσω τις πηγές.</p>'
        : story) +
      renderResearchPath(narrative, "", { open: false })
    );
  }

  return (
    ornament +
    "<h1>" +
    wrapTitleHtml(title || queryText || "Ιστορικό άρθρο") +
    "</h1>" +
    "<p>" +
    escapeHtml(data?.message || "Επιλέξτε μια έρευνα ή γράψτε ένα νέο ερώτημα.") +
    "</p>"
  );
}

export function renderReaderHistory(rows, current) {
  if (!rows.length) {
    return '<p class="nr-history-empty">Δεν υπάρχουν ακόμη έρευνες.</p>';
  }
  return rows
    .slice(0, 100)
    .map((r) => {
      const name = String(r.target || "").trim() || "Χωρίς θέμα";
      const status = historyStatusLabel(r.status, r.narrative || null);
      const cur = String(r.run_id) === String(current);
      return (
        '<button type="button" class="nr-item' +
        (cur ? " current" : "") +
        '" data-history-run="' +
        escapeHtml(r.run_id) +
        '"><strong>' +
        escapeHtml(name) +
        "</strong><span>" +
        escapeHtml(status) +
        "</span></button>"
      );
    })
    .join("");
}

let catalog = [];
let recent = [];
let current = "";
try {
  if (typeof localStorage !== "undefined") {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    recent = Array.isArray(saved) ? saved : [];
  }
} catch {
  recent = [];
}

function paintHistory() {
  const list = $("nrHistoryList");
  if (!list) return;
  list.innerHTML = renderReaderHistory(mergeHistory(catalog, recent), current);
}

function paintArticle(snapshot, knownQuery = "") {
  const host = $("nrArticle");
  if (!host) return;
  const data = overview(snapshot, { knownQuery });
  host.innerHTML = renderReaderArticle(snapshot, data, { knownQuery });
  if (window.NABOU_FACT_PINS) window.NABOU_FACT_PINS.fromSnapshot(snapshot);
}

function clientKnownQuery(snapshot) {
  if (snapshot && !isMissionInProgress(snapshot)) return "";
  if (String(snapshot?.mission?.purpose || snapshot?.mission?.target || "").trim()) return "";
  try {
    return String(document.body?.dataset?.operatorQuery || "").trim();
  } catch {
    return "";
  }
}

async function loadCatalog() {
  try {
    const response = await fetch("../command-center/live/index.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error("history_unavailable");
    const data = await response.json();
    if (data.schema === "nabou-research-history-v1" && Array.isArray(data.runs)) catalog = data.runs;
  } catch {
    /* keep local recent */
  }
  paintHistory();
}

function bindHistoryClicks() {
  $("nrHistoryList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-run]");
    if (!button) return;
    const id = button.dataset.historyRun;
    const input = $("researchRunId");
    const form = $("openResearchRun");
    if (input && form) {
      input.value = id;
      form.requestSubmit();
    } else {
      const u = new URL(location.href);
      u.searchParams.set("run", id);
      location.href = u.toString();
    }
  });
}

function bootReaderShell() {
  if (typeof document === "undefined" || !document.getElementById) return;
  mountChrome();
  bindHistoryClicks();
  paintArticle(null);
  paintHistory();
  loadCatalog();

  connectResearchFeed({
    onReset: () => {
      current = "";
      paintArticle(null);
      paintHistory();
    },
    onSnapshot: (snapshot) => {
      const knownQuery = clientKnownQuery(snapshot);
      const item = historyEntry(snapshot, knownQuery);
      if (item) {
        current = item.run_id;
        item.narrative = snapshot?.research_answer?.greek_narrative || null;
        recent = mergeHistory(recent, [item]).slice(0, 50);
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify(recent.map(({ narrative, ...rest }) => rest)),
          );
        } catch {
          /* ignore quota */
        }
        paintHistory();
      }
      paintArticle(snapshot, knownQuery);
    },
  });

  window.addEventListener("jarvis:dispatch-accepted", (event) => {
    current = "";
    const query = String(event.detail?.query || document.body?.dataset?.operatorQuery || "").trim();
    const snap = { mission: { status: "RUNNING", purpose: query, target: query } };
    paintArticle(snap, query);
    paintHistory();
  });

  window.NABOU_READER = { renderReaderArticle, renderReaderHistory, paintArticle, paintHistory };
}

bootReaderShell();
