/* Shared Greek research narrative: continuous article + Πηγές + map + closed Πορεία έρευνας.
   Tone/order mold only — every accepted fact belongs in the article. No invented biography.
   Visible surface (closed): title (name + years), article, Πηγές, map note — nothing else.
   «Τι δεν βρέθηκε» and found/passed/cut live only inside the closed Πορεία έρευνας. */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export function isNarrativeReady(narrative) {
  return Boolean(
    narrative &&
      ["NARRATIVE_PENDING_HUMAN_REVIEW", "NO_USABLE_EVIDENCE"].includes(narrative.status),
  );
}

/** Split trailing *(citation)* into body + cite under the paragraph. */
export function splitCitation(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/^(.*?)(?:\s*\*\(([^)]+)\)\*\s*|\s*\(([^)]+)\)\s*)$/s);
  if (!match || (!match[2] && !match[3])) return { body: raw, cite: "" };
  const body = match[1].trim();
  const cite = (match[2] || match[3] || "").trim();
  if (!body || !cite) return { body: raw, cite: "" };
  return { body, cite };
}

function paragraphHtml(row) {
  const { body, cite } = splitCitation(row?.text_el || "");
  if (!body) return "";
  return (
    '<figure class="narrative-fact">' +
    "<p>" +
    escapeHtml(body) +
    "</p>" +
    (cite ? "<cite>" + escapeHtml(cite) + "</cite>" : "") +
    "</figure>"
  );
}

function notFoundHtml(narrative) {
  const rows = Array.isArray(narrative?.not_found) ? narrative.not_found : [];
  if (!rows.length) return "";
  return (
    '<section class="narrative-not-found"><h4>Τι δεν βρέθηκε</h4><ul>' +
    rows.map((row) => "<li>" + escapeHtml(row.note_el || row.facet_el || "") + "</li>").join("") +
    '</ul><small>«Δεν βρέθηκε στις εξετασθείσες πηγές» δεν σημαίνει «δεν συνέβη».</small></section>'
  );
}

function sourcesHtml(narrative) {
  const rows = Array.isArray(narrative?.sources) ? narrative.sources : [];
  if (rows.length) {
    return (
      '<section class="narrative-sources" aria-label="Πηγές"><h3>Πηγές</h3><ol>' +
      rows
        .map((s) => "<li>" + escapeHtml(s.label_el || s.title || "") + "</li>")
        .join("") +
      "</ol></section>"
    );
  }
  const block = String(narrative?.sources_el || "").trim();
  if (!block) return "";
  return (
    '<section class="narrative-sources" aria-label="Πηγές"><p>' +
    escapeHtml(block) +
    "</p></section>"
  );
}

function placeNames(narrative) {
  return (narrative?.map_places || [])
    .map((p) => String(p.label || p.surface || "").trim())
    .filter(Boolean);
}

function mapNoteHtml(narrative, mode) {
  const names = placeNames(narrative);
  if (!names.length) return "";
  const lead =
    mode === "territory"
      ? "Στον χάρτη δίπλα σημειώνονται οι τόποι του άρθρου: "
      : "Ο χάρτης δίπλα εστιάζει στους τόπους του άρθρου: ";
  return (
    '<p class="narrative-place-note">' + lead + escapeHtml(names.join(" · ")) + "</p>"
  );
}

function filterParagraphs(narrative, mode) {
  const rows = Array.isArray(narrative?.paragraphs) ? narrative.paragraphs : [];
  if (mode !== "territory") return rows;
  const places = placeNames(narrative).map((n) => n.toLocaleLowerCase("el"));
  if (!places.length) return rows;
  const matched = rows.filter((row) => {
    const text = String(row?.text_el || "").toLocaleLowerCase("el");
    return places.some((p) => text.includes(p.toLocaleLowerCase("el")));
  });
  // Place page = historical note: prefer place-bearing sentences, but never hide
  // the rest of the accepted findings if filtering would empty the article.
  return matched.length ? matched : rows;
}

// Mechanical / dashboard titles that must never head the article.
const GENERIC_TITLES = new Set(["αφήγηση έρευνας", "αφήγηση", "αφήγηση (ελληνικά)", "research narrative"]);

/** Article heading = person/event/place name and years (e.g. «Πέτρος Λάντζας (Pietro / Pedro Lanza, 1530–1613)»). */
export function articleTitle(narrative, fallback = "") {
  const t = String(narrative?.title_el || "").trim();
  if (t && !GENERIC_TITLES.has(t.toLocaleLowerCase("el"))) return t;
  return String(fallback || "").trim();
}

/**
 * Closed «Πορεία έρευνας»: found / passed / cut and why, plus «Τι δεν βρέθηκε».
 * Legacy dashboard numbers (ιστορικοί ισχυρισμοί, αντιφάσεις, εμπόδια πρόσβασης)
 * are deliberately not rendered here; only cut reasons from research_path.groups explain a cut.
 */
export function renderResearchPath(narrative, extraHtml = "", { open = false } = {}) {
  const path = narrative?.research_path || null;
  let body = "";
  if (path && (path.found != null || path.passed != null || path.cut != null)) {
    body +=
      '<p class="research-path-summary">' +
      escapeHtml(
        path.summary_el ||
          `Βρέθηκαν ${path.found ?? "—"} τεκμήρια· Πέρασαν ${path.passed ?? "—"}· Κόπηκαν ${path.cut ?? "—"}.`,
      ) +
      "</p>";
    const groups = (Array.isArray(path.groups) ? path.groups : []).filter((g) => Number(g?.count) > 0 || g?.count == null);
    if (groups.length) {
      body +=
        '<p class="research-path-cut-lead">Κόπηκαν, και συγκεκριμένα:</p>' +
        '<ul class="research-path-groups">' +
        groups
          .map(
            (g) =>
              "<li>" +
              escapeHtml(g.label_el || g.key || "") +
              (g.count != null ? ": " + escapeHtml(g.count) : "") +
              (g.note_el ? " — " + escapeHtml(g.note_el) : "") +
              "</li>",
          )
          .join("") +
        "</ul>";
    }
    if (path.omission_note_el) {
      body += "<p>" + escapeHtml(path.omission_note_el) + "</p>";
    }
  }
  body += notFoundHtml(narrative);
  body += extraHtml || "";
  if (!body) return "";
  return (
    '<details class="overview-details research-path"' +
    (open ? " open" : "") +
    '><summary>Πορεία έρευνας</summary>' +
    body +
    "</details>"
  );
}

/**
 * Researcher-facing story block.
 * mode: "default" | "history" | "territory" | "people"
 * Person page = biography; place page = historical note; not a control panel.
 */
export function renderStoryHtml(narrative, { mode = "default", heading = true, fallbackTitle = "" } = {}) {
  if (!isNarrativeReady(narrative)) return "";
  const empty =
    narrative.status === "NO_USABLE_EVIDENCE" ||
    !(Array.isArray(narrative.paragraphs) && narrative.paragraphs.some((p) => p?.text_el));
  const title = articleTitle(narrative, fallbackTitle);
  const modeLabel =
    mode === "territory"
      ? "Ιστορικό σημείωμα τόπου"
      : mode === "people"
        ? "Βιογραφικό"
        : mode === "history"
          ? "Χρονολογική αφήγηση"
          : "Ιστορικό άρθρο";
  // Default mode never shows a mechanical kicker; the name/years heading carries the article.
  const kickerHtml =
    mode === "default" ? "" : '<p class="narrative-kicker">' + escapeHtml(modeLabel) + "</p>";
  const headingHtml = heading && title ? "<h3>" + escapeHtml(title) + "</h3>" : heading ? "" : kickerHtml;
  if (empty) {
    return (
      '<section class="research-narrative" aria-label="' +
      escapeHtml(modeLabel) +
      '">' +
      headingHtml +
      '<p class="narrative-empty">Δεν προέκυψε τεκμηριωμένη αφήγηση από τις εξετασθείσες πηγές. Αυτό δεν αποδεικνύει ιστορική απουσία.</p>' +
      mapNoteHtml(narrative, mode) +
      "</section>"
    );
  }
  const paragraphs = filterParagraphs(narrative, mode)
    .map(paragraphHtml)
    .filter(Boolean)
    .join("");
  return (
    '<section class="research-narrative" aria-label="' +
    escapeHtml(modeLabel) +
    '">' +
    headingHtml +
    '<div class="narrative-article">' +
    paragraphs +
    "</div>" +
    sourcesHtml(narrative) +
    mapNoteHtml(narrative, mode) +
    "</section>"
  );
}

/** @deprecated kept for callers. Legacy `counts` are ignored: the closed
 *  Πορεία έρευνας shows only found / passed / cut (and why) plus «Τι δεν βρέθηκε». */
export function renderCountsDetails(_counts, extraHtml = "", narrative = null, options = {}) {
  return renderResearchPath(narrative, extraHtml, options);
}

function missionInProgress(snapshot) {
  return ["RUNNING", "PREPARING", "QUEUED", "STARTING", "ACTIVE"].includes(
    String(snapshot?.mission?.status || "").toUpperCase(),
  );
}

/** Compact overview used by the right-hand «Το ερώτημα» / «Η έρευνά μου» panel. */
export function renderOverviewStory(snapshot, data, { knownQuery = "" } = {}) {
  const narrative = data?.narrative || snapshot?.research_answer?.greek_narrative;
  const story = renderStoryHtml(narrative, { mode: "default", heading: false });
  const inProgress = missionInProgress(snapshot);
  // Prefer mission purpose/target; while running, use the query the client already typed.
  const queryText = String(
    snapshot?.mission?.purpose || snapshot?.mission?.target || knownQuery || "",
  ).trim();
  const question = escapeHtml(
    queryText ||
      (inProgress
        ? "Το ερώτημα δεν είναι ακόμη διαθέσιμο στα δεδομένα της έρευνας."
        : "Δεν καταγράφηκε αρχικό ερώτημα."),
  );
  const period = escapeHtml(
    snapshot?.mission?.date_range ||
      (inProgress ? "Η περίοδος δεν είναι ακόμη διαθέσιμη." : "Δεν ορίστηκε περίοδος"),
  );
  const extras =
    '<dl class="dossier-question"><div><dt>Το ερώτημά σας</dt><dd>' +
    question +
    "</dd></div><div><dt>Περίοδος</dt><dd>" +
    period +
    "</dd></div></dl>" +
    (story ? "" : "<p>" + escapeHtml(data?.message || "") + "</p>") +
    '<p class="overview-next"><strong>Επόμενο βήμα:</strong> ' +
    escapeHtml(data?.next || "") +
    "</p>";
  // Open Πορεία while the research is still working; close it again when finished.
  const pathOpen = inProgress && !isNarrativeReady(narrative);
  return (
    '<div class="overview-heading"><h2>' +
    escapeHtml(data?.title || queryText || "") +
    "</h2><span>" +
    escapeHtml(data?.status || "") +
    "</span></div>" +
    (story || "<p>" + escapeHtml(data?.message || "") + "</p>") +
    renderResearchPath(narrative, extras, { open: pathOpen })
  );
}
