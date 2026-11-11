/* «Η έρευνά μου»: the question this browser sent, kept across reloads.
   Stored only in this browser (localStorage). Nothing here sends a request:
   the only sender is the «Έναρξη έρευνας» button (operator-command.js). */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const MY_RESEARCH_KEY = "nabou-my-research-v1";
/** Typical wall time of one research run (GitHub multi-agent workflow). */
export const TYPICAL_MINUTES = [20, 90];
/** After this, say honestly that it is taking longer than usual. */
export const LATE_MINUTES = 120;

const TERMINAL = [
  "BLOCKED_CONFIGURATION",
  "INSUFFICIENT_EVIDENCE",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "ERROR",
  "CANCELLED",
  "CANCELED",
  "BLOCKED",
  "SKIPPED",
  "DONE",
];
const isTerminalStatus = (status) => TERMINAL.includes(String(status || "").toUpperCase());

function clean(entry) {
  if (!entry || typeof entry !== "object") return null;
  const query = String(entry.query || "").trim().slice(0, 500);
  const request_id = String(entry.request_id || "").trim();
  const started_at = Number(entry.started_at);
  if (!query || !/^[\w.:-]{3,80}$/.test(request_id) || !Number.isFinite(started_at)) return null;
  const out = { query, request_id, started_at };
  if (/^\d+$/.test(String(entry.run_id || ""))) out.run_id = String(entry.run_id);
  if (entry.status) out.status = String(entry.status).toUpperCase().slice(0, 40);
  if (Number.isFinite(Number(entry.finished_at)) && entry.finished_at != null) out.finished_at = Number(entry.finished_at);
  return out;
}

export function loadMyResearch(storage = globalThis.localStorage) {
  try {
    return clean(JSON.parse(storage?.getItem(MY_RESEARCH_KEY) || "null"));
  } catch {
    return null;
  }
}
export function saveMyResearch(entry, storage = globalThis.localStorage) {
  const value = clean(entry);
  if (!value) return null;
  try {
    storage?.setItem(MY_RESEARCH_KEY, JSON.stringify(value));
  } catch {
    /* Private mode / storage denied: the page still works for this visit. */
  }
  return value;
}
export function clearMyResearch(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(MY_RESEARCH_KEY);
  } catch {}
}
export const isMyResearchDone = (entry) => Boolean(entry?.run_id && isTerminalStatus(entry.status));

const snapshotRequest = (snapshot) =>
  snapshot?.request_id || (snapshot?.events || []).find((e) => e?.request_id)?.request_id || "";
/** True when this snapshot belongs to the saved question. */
export function isMine(entry, snapshot) {
  if (!entry || !snapshot) return false;
  const request = snapshotRequest(snapshot);
  if (request) return request === entry.request_id;
  return Boolean(entry.run_id && String(snapshot.run_id) === entry.run_id);
}
/** Record what a matching snapshot tells us (run number, final status). */
export function updateFromSnapshot(entry, snapshot, now = Date.now()) {
  if (!isMine(entry, snapshot)) return entry;
  const status = String(snapshot?.mission?.status || "").toUpperCase();
  const next = { ...entry, run_id: String(snapshot.run_id) };
  if (status) next.status = status;
  if (isTerminalStatus(status) && !entry.finished_at) next.finished_at = now;
  return next;
}

const fold = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/ς/g, "σ")
    .replace(/\s+/g, " ")
    .trim();
/**
 * GitHub fallback: find the saved question in the published catalogue
 * (command-center/live/index.json) when the live server cannot be reached.
 * The catalogue has no request id, so match the exact question text and
 * a publication time after the question was sent.
 */
export function findPublishedRun(entry, runs) {
  if (!entry || !Array.isArray(runs)) return null;
  const q = fold(entry.query);
  const since = entry.started_at - 5 * 60 * 1000;
  const hits = runs.filter((r) => {
    if (!/^\d+$/.test(String(r?.run_id || ""))) return false;
    const when = Date.parse(r.generated_utc || "");
    return fold(r.target) === q && Number.isFinite(when) && when >= since;
  });
  hits.sort((a, b) => Date.parse(a.generated_utc) - Date.parse(b.generated_utc));
  return hits[0] || null;
}

/**
 * Stage picture: received → running → gathering → published.
 * `live` is the matching snapshot if one reached this page, otherwise null.
 */
export function researchStage(entry, live = null) {
  if (!entry) return { key: "none", seen: false };
  const status = String(live?.mission?.status || entry.status || "").toUpperCase();
  if (isTerminalStatus(status)) return { key: "published", seen: true };
  if (!live) return { key: "received", seen: false };
  const agents = Array.isArray(live.agents) ? live.agents : [];
  const done = agents.filter((a) => isTerminalStatus(a?.status)).length;
  const lanes = { done, total: agents.length };
  if (agents.length && done === agents.length) return { key: "gathering", seen: true, lanes };
  return { key: "running", seen: true, lanes };
}

const STEPS = [
  ["received", "Παραλήφθηκε"],
  ["running", "Ψάχνει στα αρχεία"],
  ["gathering", "Μαζεύει τα ευρήματα"],
  ["published", "Έτοιμη"],
];

function clock(ms) {
  try {
    return new Intl.DateTimeFormat("el-GR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
  } catch {
    return "";
  }
}
function day(ms) {
  try {
    return new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "long" }).format(new Date(ms));
  } catch {
    return "";
  }
}
export function elapsedMinutes(entry, now = Date.now()) {
  return Math.max(0, Math.floor((now - Number(entry?.started_at || now)) / 60000));
}
export function startedLabel(entry, now = Date.now()) {
  if (!entry) return "";
  const minutes = elapsedMinutes(entry, now);
  const sameDay = new Date(entry.started_at).toDateString() === new Date(now).toDateString();
  const at = (sameDay ? "" : day(entry.started_at) + ", ") + clock(entry.started_at);
  const hours = Math.floor(minutes / 60);
  const ago =
    minutes < 1
      ? "μόλις τώρα"
      : minutes < 60
        ? "πριν από " + minutes + (minutes === 1 ? " λεπτό" : " λεπτά")
        : "πριν από " +
          hours +
          (hours === 1 ? " ώρα" : " ώρες") +
          (minutes % 60 ? " και " + (minutes % 60) + " λεπτά" : "");
  return "Ξεκίνησε στις " + at + " · " + ago;
}

/** «Η έρευνά μου» while the question runs: title, status, steps, honest time. */
export function progressHtml(entry, stage, { now = Date.now(), liveBlocked = false } = {}) {
  if (!entry) return "";
  const minutes = elapsedMinutes(entry, now);
  const index = Math.max(0, STEPS.findIndex(([key]) => key === stage.key));
  const steps = STEPS.map(([key, label], i) => {
    const state = i < index || stage.key === "published" ? "done" : i === index ? "current" : "next";
    return (
      '<li data-step="' +
      key +
      '" data-state="' +
      state +
      '"' +
      (state === "current" ? ' aria-current="step"' : "") +
      "><span>" +
      esc(label) +
      "</span></li>"
    );
  }).join("");
  const late = minutes >= LATE_MINUTES;
  const where = stage.seen
    ? ""
    : '<p class="my-research-note">' +
      (liveBlocked
        ? "Από εδώ δεν βλέπουμε ζωντανά σε ποιο σημείο βρίσκεται. "
        : "Περιμένουμε το πρώτο σημάδι από την έρευνα. ") +
      "Η σελίδα ελέγχει μόνη της και θα δείξει το αποτέλεσμα μόλις δημοσιευτεί. Αν την κλείσεις, το ερώτημα μένει εδώ όταν ξαναμπείς.</p>";
  const time = late
    ? "Κρατάει περισσότερο από το συνηθισμένο (συνήθως " +
      TYPICAL_MINUTES[0] +
      "–" +
      TYPICAL_MINUTES[1] +
      " λεπτά). Αν δεν εμφανιστεί ως το βράδυ, μάλλον δεν ολοκληρώθηκε· μπορείς να το ξαναστείλεις."
    : "Τέτοιες έρευνες κρατάνε συνήθως " + TYPICAL_MINUTES[0] + "–" + TYPICAL_MINUTES[1] + " λεπτά.";
  const lanes = stage.lanes?.total
    ? "<div><dt>Ερευνητές που τελείωσαν</dt><dd>" + esc(stage.lanes.done) + " από " + esc(stage.lanes.total) + "</dd></div>"
    : "";
  return (
    '<section class="my-research" aria-label="Το ερώτημά σου τρέχει" data-stage="' +
    esc(stage.key) +
    '">' +
    '<p class="my-research-kicker">Το δικό σου ερώτημα</p>' +
    "<h2>" +
    esc(entry.query) +
    "</h2>" +
    '<p class="my-research-status" role="status">' +
    esc(late ? "Κρατάει περισσότερο από το συνηθισμένο" : "Τρέχει τώρα") +
    " · " +
    esc(startedLabel(entry, now)) +
    "</p>" +
    '<ol class="my-research-steps" aria-label="Πού βρίσκεται η έρευνα">' +
    steps +
    "</ol>" +
    '<p class="my-research-time">' +
    esc(time) +
    "</p>" +
    where +
    '<details class="my-research-details"><summary>Λεπτομέρειες</summary><dl>' +
    "<div><dt>Αριθμός αιτήματος</dt><dd>" +
    esc(entry.request_id) +
    "</dd></div>" +
    (entry.run_id ? "<div><dt>Αριθμός έρευνας</dt><dd>#" + esc(entry.run_id) + "</dd></div>" : "") +
    lanes +
    "<div><dt>Πού κρατιέται</dt><dd>Το ερώτημα κρατιέται μόνο σε αυτόν τον browser. Το αποτέλεσμα δημοσιεύεται στις «Προηγούμενες έρευνες».</dd></div>" +
    "</dl>" +
    '<button type="button" data-my-research="forget">Ξέχασε αυτό το ερώτημα</button>' +
    "</details>" +
    "</section>"
  );
}

/** Small line shown when another research is on screen while yours still runs. */
export function reminderHtml(entry, stage, now = Date.now()) {
  if (!entry || stage.key === "published") return "";
  return (
    '<p class="my-research-reminder">Το δικό σου ερώτημα «' +
    esc(entry.query) +
    "» τρέχει ακόμη (" +
    esc(startedLabel(entry, now).replace("Ξεκίνησε", "ξεκίνησε")) +
    '). <button type="button" data-my-research="show">Δείξε το</button></p>'
  );
}
