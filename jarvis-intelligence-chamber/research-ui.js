import { matchesSource } from "./source-search.js";
import { exportResearch } from "./research-export.js";
import { connectResearchFeed, missionState, selectResearchRun, waitForResearchRequest } from "./live-bridge.js";
const $ = (id) => document.getElementById(id);
// Greek display labels for status codes (presentation only; logic keeps the codes).
const gr = (v) => (globalThis.NABOU_GR ? globalThis.NABOU_GR.status(v) : String(v ?? ""));
const activity = $("activityLines"),
  mission = $("missionState"),
  toggle = $("resultsToggle"),
  drawer = $("resultsDrawer"),
  close = $("closeResults"),
  count = $("resultsCount"),
  list = $("resultsList"),
  runEl = $("resultsRun"),
  meta = $("resultsMeta");
let snapshot = null,
  events = [],
  resultFilter = "all",
  requestedId = "",
  resultPage = 0;
const pageSize = 20;
let visibleRecords = [];
const score = (r, key) => Number(r[key]?.score ?? -1);
const sortRecords = (rows) => {
  const key = $("resultSort").value;
  return [...rows].sort((a, b) =>
    key === "year"
      ? Number(a.publication_year || 9999) - Number(b.publication_year || 9999)
      : key === "confidence"
        ? score(b, "evidence_confidence") - score(a, "evidence_confidence")
        : key === "value"
          ? score(b, "research_value") - score(a, "research_value")
          : 0,
  );
};
const map = {
  Spain: "spanish_simancas",
  Venice: "venetian",
  France: "french",
  Britain: "british",
  Netherlands: "dutch",
  "German States": "german",
  "Italian States": "italian_states",
  Greece: "greek",
  "Ottoman Empire": "ottoman",
  "North Africa": "north_african",
  "Travellers & Narratives": "travellers",
  "Source Genealogy": "source_genealogy",
  "Identity Resolution": "identity_resolution",
  Contradictions: "contradiction",
  "Relationship Networks": "relationship_network",
  Chronology: "timeline",
  "Pirate Bases": "pirate_base",
  "Pirate Biography": "pirate_biography",
};
// CI marker: source-dossier.test.cjs slices this file from the esc helper below up to recordEvidence; keep "esc=" unspaced.
const esc=(s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m],
  );
function sourceLink(record) {
  try {
    const u = new URL(record.url || record.text_locator?.url);
    return ["http:", "https:"].includes(u.protocol)
      ? '<a href="' + esc(u.href) + '" target="_blank" rel="noopener noreferrer">ΑΝΟΙΓΜΑ ΠΗΓΗΣ ↗</a>'
      : "";
  } catch (_) {
    return "";
  }
}
const statementKind = (kind) =>
  ({
    acquired_excerpt: "Ακριβές αποθηκευμένο απόσπασμα",
    source_statement: "Η πηγή δηλώνει",
    inference: "Ερμηνεία μοντέλου",
    hypothesis: "Υπόθεση μοντέλου",
  })[kind] || "Είδος ισχυρισμού μη καταγεγραμμένο";
function conflictEvidence(record) {
  return (
    "<p>Πιθανή αντίφαση που επισήμανε το μοντέλο· δεν έχει κριθεί ιστορικά.</p>" +
    (record.claims || [])
      .map(
        (c) =>
          "<details><summary>" +
          esc(statementKind(c.kind) + ": " + c.statement) +
          "</summary><blockquote>" +
          esc(c.quote) +
          "</blockquote>" +
          (c.source_occurrences || [])
            .map((s) => "<p>" + esc(s.title || s.url) + "</p>" + sourceLink(s))
            .join("") +
          "</details>",
      )
      .join("")
  );
}
function semanticAnswer(data) {
  if (!["pct-semantic-answer-v1", "pct-semantic-answer-v2", "pct-semantic-answer-v3"].includes(data?.schema)) return "";
  if (!["MODEL_ANSWER_PENDING_HUMAN_REVIEW", "SOURCE_DOSSIER_AVAILABLE"].includes(data.status))
    return (
      '<section class="result-item"><b>ΑΠΑΝΤΗΣΗ ΕΡΕΥΝΑΣ</b><p>' +
      esc(
        data.status === "BLOCKED_CONFIGURATION"
          ? "Δεν έχει συνδεθεί ακόμη μοντέλο για τη σύνθεση απάντησης. Τα ευρήματα και οι πηγές παραμένουν διαθέσιμα παρακάτω."
          : data.status === "INSUFFICIENT_ACQUIRED_EVIDENCE"
            ? "Δεν έχει αποκτηθεί αρκετό κείμενο πηγών για τεκμηριωμένη απάντηση."
            : "Η σύνθεση απάντησης δεν ολοκληρώθηκε. Τα ευρήματα διατηρήθηκαν για έλεγχο.",
      ) +
      "</p></section>"
    );
  const claims = new Map((data.claims || []).map((c) => [c.claim_id, c]));
  const coverageNote =
    data.answer_scope === "PROVISIONAL_EXAMINED_PASSAGES_ONLY" || data.coverage?.deferred?.length
      ? "<p>Προσωρινή απάντηση από τα αποσπάσματα που εξετάστηκαν. Η κάλυψη του συνόλου των πηγών παραμένει εκκρεμής.</p>"
      : "";
  const timeline =
    data.answer_mode === "EXACT_SOURCE_EXTRACTS" && data.documentary_timeline?.length
      ? "<details><summary>Χρονολογικές ενδείξεις στα αποσπάσματα</summary><p>Δεν αποτελούν επαληθευμένο χρονολόγιο γεγονότων.</p>" +
        data.documentary_timeline
          .map((r) => "<p>" + esc(r.year) + " · " + esc(r.claim_id) + "</p>")
          .join("") +
        "</details>"
      : "";
  const sections = (data.answer_sections || [])
    .filter((s) => s.claim_ids?.length && s.claim_ids.every((id) => claims.has(id)))
    .map(
      (s) =>
        "<p>" +
        esc(s.text) +
        "</p><details><summary>Πηγές και αποσπάσματα</summary>" +
        s.claim_ids
          .map((id) => {
            const c = claims.get(id),
              source = c.source_occurrences?.[0] || {},
              loc = source.locator || {};
            return (
              "<p><strong>" +
              esc(statementKind(c.kind)) +
              "</strong>: " +
              esc(c.statement) +
              "</p><blockquote>" +
              esc(c.quote) +
              "</blockquote><small>" +
              esc(source.title || "Πηγή") +
              (loc.printed_page ? " · Σελίδα " + esc(loc.printed_page) : "") +
              (Array.isArray(loc.scan_indexes_0_based) && loc.scan_indexes_0_based.length
                ? " · PDF " + esc(loc.scan_indexes_0_based[0] + 1)
                : "") +
              (loc.start_line ? " · Γραμμές " + esc(loc.start_line) + "–" + esc(loc.end_line) : "") +
              "</small>" +
              sourceLink(source) +
              (source.reported_archival_reference
                ? "<p>Αρχειακή παραπομπή στη μελέτη — το πρωτότυπο δεν εξετάστηκε: " +
                  esc(source.reported_archival_reference.display) +
                  "</p>"
                : "") +
              (c.source_uncertainties?.length
                ? "<p>Εκκρεμότητες: " + esc(c.source_uncertainties.join(", ")) + "</p>"
                : "")
            );
          })
          .join("") +
        "</details>",
    )
    .join("");
  return (
    '<section class="result-item"><b>ΑΠΑΝΤΗΣΗ ΜΕ ΠΑΡΑΠΟΜΠΕΣ · ΠΡΟΣ ΕΛΕΓΧΟ</b><small>' +
    esc(
      data.answer_mode === "EXACT_SOURCE_EXTRACTS"
        ? "Φάκελος αποσπασμάτων χωρίς υπηρεσία μοντέλου. Η ταύτιση και η ιστορική ερμηνεία παραμένουν ανοιχτές."
        : "Σύνθεση μοντέλου από τις διαθέσιμες πηγές. Εκκρεμεί ιστορική επαλήθευση.",
    ) +
    "</small>" +
    coverageNote +
    sections +
    timeline +
    (Array.isArray(data.unknowns) && data.unknowns.length
      ? "<details><summary>Τι παραμένει άγνωστο</summary>" +
        data.unknowns.map((x) => "<p>" + esc(x) + "</p>").join("") +
        "</details>"
      : "") +
    "</section>"
  );
}
function recordEvidence(record) {
  const printed = record.printed_page ?? record.text_locator?.printed_page;
  const scan = record.text_locator?.scan_indexes_0_based?.[0];
  const pdf =
    record.pdf_page ??
    record.text_locator?.pdf_page ??
    (record.text_locator?.pdf_file && Number.isInteger(scan) && scan >= 0 ? scan + 1 : null);
  const excerpt = record.context_excerpt || record.acquired_text_excerpt || record.source_excerpt;
  const b = record.bibliography || {},
    e = record.evidence_record || {};
  const category =
    {
      PRIMARY_SOURCE_REPORTED: "Πιθανή πρωτογενής πηγή — εκκρεμεί έλεγχος",
      SECONDARY_STUDY_REPORTED: "Μεταγενέστερη μελέτη — προσωρινή ταξινόμηση",
      SEARCH_HYPOTHESIS: "Υπόθεση αναζήτησης — όχι ταυτοποιημένη ιστορική μορφή",
      UNVERIFIED_WEB_REFERENCE: "Ανεπιβεβαίωτη διαδικτυακή αναφορά",
      SCHOLARLY_PUBLICATION_UNCLASSIFIED:
        "Επιστημονική δημοσίευση — δεν έχει ελεγχθεί αν είναι μελέτη ή έκδοση πηγής",
      UNCLASSIFIED: "Το είδος πηγής δεν έχει ελεγχθεί",
    }[record.source_classification?.category] || "Το είδος πηγής δεν έχει ελεγχθεί";
  const bibliography = [...(b.creators || []), b.publication_date, b.container_title, b.call_number]
    .filter(Boolean)
    .join(" · ");
  return (
    '<div class="record-evidence"><dl><div><dt>Πηγή</dt><dd>' +
    esc(record.repository || "Δεν καταγράφηκε ονομασία πηγής") +
    "</dd></div><div><dt>Σελίδα</dt><dd>" +
    esc(
      printed != null
        ? "Έντυπη " + printed
        : pdf != null
          ? "PDF " + pdf + " · έντυπη σελίδα μη επιβεβαιωμένη"
          : "Δεν έχει καταγραφεί ακριβής σελίδα",
    ) +
    "</dd></div><div><dt>Είδος</dt><dd>" +
    esc(category) +
    "</dd></div></dl>" +
    (bibliography ? "<p>" + esc(bibliography) + "</p>" : "") +
    (excerpt
      ? "<details><summary>Καταγεγραμμένο απόσπασμα</summary><p>Ανακτημένο κείμενο / OCR· δεν είναι ελεγμένη μεταγραφή του πρωτοτύπου.</p><blockquote>" +
        esc(excerpt) +
        "</blockquote>" +
        (e.citation_check
          ? "<small>" +
            esc(
              e.citation_check === "EXACT_ACQUIRED_TEXT_MATCH"
                ? "Το απόσπασμα αντιστοιχεί ακριβώς στο αποθηκευμένο κείμενο."
                : "Η αντιστοίχιση με το αποθηκευμένο κείμενο δεν επιβεβαιώθηκε.",
            ) +
            "</small>"
          : "") +
        "</details>"
      : "<p>Δεν έχει καταγραφεί απόσπασμα από την πηγή.</p>") +
    "</div>"
  );
}
function renderActivity() {
  const src = events.slice(-30).reverse();
  activity.innerHTML = src.length
    ? src
        .map(
          (e) =>
            "<div><b>" +
            esc(e.agent_id || "JARVIS") +
            "</b> → " +
            esc(e.detail || gr(e.phase || e.status || e.event_type)) +
            "</div>",
        )
        .join("")
    : "<div>Δεν έχει καταγραφεί δραστηριότητα για αυτή την έρευνα.</div>";
}
function applySearch() {
  resultPage = 0;
  renderResults();
}
$("resultSearch").addEventListener("input", applySearch);
$("resultSort").addEventListener("change", applySearch);
$("resultsPrevious").onclick = () => {
  resultPage = Math.max(0, resultPage - 1);
  renderResults();
};
$("resultsNext").onclick = () => {
  resultPage++;
  renderResults();
};
$("latestResearch").onclick = () => {
  clearTimeout(pendingRunTimer);
  pendingRun = "";
  missingRun = "";
  runNotice("");
  requestedId = "";
  snapshot = null;
  events = [];
  resultPage = 0;
  delete document.body.dataset.dispatchRequest;
  delete document.body.dataset.operatorRun;
  selectResearchRun("latest", true);
  const u = new URL(location.href);
  u.searchParams.delete("run");
  history.replaceState(null, "", u);
  renderResults();
  window.dispatchEvent(new Event("jarvis:research-selection"));
};
/* Clear feedback for unknown or invalid run numbers (presentation only). */
let pendingRun = "",
  pendingRunTimer = null,
  missingRun = "";
function runNotice(text, kind = "") {
  const n = $("runNotice");
  if (!n) return;
  n.textContent = text || "";
  n.hidden = !text;
  n.dataset.kind = kind;
}
function runNotFound(id) {
  if (pendingRun !== id || String(snapshot?.run_id) === id) return;
  clearTimeout(pendingRunTimer);
  missingRun = id;
  runNotice(
    "Δεν βρέθηκε έρευνα με αριθμό #" + id + ". Ελέγξτε τον αριθμό ή διαλέξτε από τις «Προηγούμενες έρευνες».",
    "error",
  );
  runEl.textContent = "Δεν βρέθηκε η έρευνα #" + id;
  list.innerHTML =
    '<div class="result-empty">Δεν βρέθηκε έρευνα με αριθμό #' +
    esc(id) +
    '. Πατήστε «Πιο πρόσφατη» ή ανοίξτε μια από τις «Προηγούμενες έρευνες».</div>';
}
function watchRun(id) {
  clearTimeout(pendingRunTimer);
  pendingRun = id;
  missingRun = "";
  runNotice("Αναζήτηση της έρευνας #" + id + "…", "pending");
  pendingRunTimer = setTimeout(() => runNotFound(id), 15000);
}
function settleRun(runId) {
  if (pendingRun && String(runId) === pendingRun) {
    clearTimeout(pendingRunTimer);
    pendingRun = "";
    missingRun = "";
    runNotice("");
  }
}
$("researchRunId").addEventListener("input", () => {
  if ($("runNotice")?.dataset.kind === "error") runNotice("");
});
$("openResearchRun").onsubmit = (e) => {
  e.preventDefault();
  const id = $("researchRunId").value.trim();
  if (!/^\d+$/.test(id)) {
    runNotice(
      id
        ? "Μη έγκυρος αριθμός έρευνας: «" + id + "». Χρησιμοποιήστε μόνο ψηφία, π.χ. 39546422037."
        : "Γράψτε τον αριθμό της έρευνας, π.χ. 39546422037.",
      "error",
    );
    $("researchRunId").focus();
    return;
  }
  requestedId = "";
  snapshot = null;
  events = [];
  resultPage = 0;
  selectResearchRun(id, true);
  renderResults();
  const u = new URL(location.href);
  u.searchParams.set("run", id);
  history.replaceState(null, "", u);
  window.dispatchEvent(new Event("jarvis:research-selection"));
  watchRun(id);
};
$("resultTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-result-filter]");
  if (b)
    window.dispatchEvent(
      new CustomEvent("jarvis:results-filter", { detail: { filter: b.dataset.resultFilter } }),
    );
});
$("exportResults").addEventListener("click", () => {
  if (!snapshot) return;
  const out = exportResearch(snapshot, $("exportFormat")?.value || "json");
  const url = URL.createObjectURL(new Blob([out.text], { type: out.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "nabou-research-" + snapshot.run_id + "." + out.extension;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
function renderResults() {
  const claims = snapshot?.claims || [],
    blockers = snapshot?.blockers || [],
    contradictions = snapshot?.contradictions?.records || [],
    discoveries = snapshot?.discoveries || [],
    coverage = snapshot?.coverage || [];
  runEl.textContent = snapshot?.run_id
    ? "Έρευνα " + snapshot.run_id
    : requestedId
      ? "Αναμονή νέας έρευνας"
      : "Δεν έχει επιλεγεί έρευνα";
  if (!snapshot && missingRun) runEl.textContent = "Δεν βρέθηκε η έρευνα #" + missingRun;
  const related = discoveries.filter((r) =>
    ["TARGET_MATCH", "POSSIBLE_TARGET"].includes(r.topical_match?.category),
  );
  const supporting = discoveries.filter((r) => r.topical_match?.category === "CONTEXT_ONLY");
  const unmatched = discoveries.filter((r) => !related.includes(r) && !supporting.includes(r));
  count.textContent = related.length + claims.length;
  $("exportResults").disabled = !snapshot;
  // The format selector exists in the chamber, not in every page that reuses this module
  // (workspace-preview.html has none); a missing selector means JSON export.
  const exportFormat = $("exportFormat");
  if (exportFormat) {
    [...exportFormat.options].forEach(
      (o) => (o.disabled = o.value !== "json" && !snapshot?.evidence_package),
    );
    if (!snapshot?.evidence_package) exportFormat.value = "json";
  }
  document
    .querySelectorAll("[data-result-filter]")
    .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.resultFilter === resultFilter)));
  meta.textContent =
    related.length +
    " πιθανές σχετικές αναφορές · " +
    supporting.length +
    " γενικού πλαισίου · " +
    unmatched.length +
    " αταύτιστα · " +
    claims.length +
    " ιστορικοί ισχυρισμοί · " +
    blockers.length +
    " εμπόδια";
  const groups =
    resultFilter === "contradictions"
      ? [[contradictions, "CONTRADICTION"]]
      : resultFilter === "claims"
        ? [[claims, "CLAIM"]]
        : resultFilter === "blockers"
          ? [[blockers, "BLOCKER"]]
          : [
              [related, "DISCOVERY"],
              [claims, "CLAIM"],
              [supporting, "CONTEXT ONLY"],
              [unmatched, "UNMATCHED"],
              [coverage, "SOURCE SEARCH"],
              [blockers, "BLOCKER"],
            ];
  const q = $("resultSearch").value.trim().toLocaleLowerCase();
  const filtered = groups.map(([records, kind]) => [
    sortRecords(records).filter((r) => !q || matchesSource(r, q)),
    kind,
  ]);
  const total = filtered.reduce((n, [rows]) => n + rows.length, 0);
  resultPage = Math.min(resultPage, Math.max(0, Math.ceil(total / pageSize) - 1));
  $("resultsPagination").hidden = !total;
  $("resultsPage").textContent = total
    ? `${resultPage * pageSize + 1}–${Math.min(total, (resultPage + 1) * pageSize)} από ${total}`
    : "0";
  $("resultsPrevious").disabled = !resultPage;
  $("resultsNext").disabled = (resultPage + 1) * pageSize >= total;
  let index = 0;
  visibleRecords = [];
  const items = [];
  for (const [records, kind] of filtered) {
    const rows = [];
    for (const r of records) {
      const i = index++;
      if (i < resultPage * pageSize || i >= (resultPage + 1) * pageSize) continue;
      const recordIndex = visibleRecords.push(r) - 1;
      const detail = ["DISCOVERY", "CONTEXT ONLY", "UNMATCHED"].includes(kind)
        ? [
            r.repository,
            r.fulltext_hit ? "Απόσπασμα πλήρους κειμένου / OCR" : "",
            r.publication_year ? "Έτος έκδοσης " + r.publication_year : "",
            r.printed_page != null ? "Έντυπη σελίδα " + r.printed_page : "",
            {
              IDENTITY_UNRESOLVED: "Αμφίβολη ταύτιση — διατηρείται στο γενικό πλαίσιο",
              EXTENDED_NAME_REQUIRES_IDENTITY_REVIEW:
                "Εκτενέστερο όνομα — πιθανός συνονόματος, χρειάζεται ταύτιση",
              ACQUIRED_TEXT_MENTION_NOT_EVENT:
                "Αναφορά στο κείμενο της πηγής — δεν αποτελεί ακόμη τεκμηριωμένο ιστορικό γεγονός",
              AUTHORSHIP_NOT_SUBJECT_EVIDENCE:
                "Το όνομα εμφανίζεται ως συγγραφέας — δεν τεκμηριώνει ότι η πηγή αφορά το ζητούμενο πρόσωπο",
              NAME_TOKENS_IN_SOURCE: "Το όνομα εμφανίζεται στην πηγή",
              SURNAME_WITH_REQUEST_CONTEXT: "Επώνυμο και συμφραζόμενα — χρειάζεται ταύτιση",
              NAME_WITHOUT_REQUEST_CONTEXT: "Ίδιο όνομα — τα ζητούμενα συμφραζόμενα δεν εντοπίστηκαν",
              REQUEST_PLACE_ONLY: "Αναφορά στον τόπο, χωρίς ταύτιση προσώπου",
              NO_TARGET_IDENTITY_MATCH: "Δεν εντοπίστηκε ο ζητούμενος στόχος",
              TARGET_PHRASE_IN_SOURCE: "Ο στόχος αναφέρεται στην πηγή",
              FULLTEXT_NAME_WITHOUT_REQUEST_CONTEXT:
                "Το όνομα βρέθηκε, αλλά λείπουν τα ζητούμενα συμφραζόμενα",
              FULLTEXT_COMPLETE_NAME_REQUIRES_REVIEW: "Πλήρες όνομα σε κείμενο / OCR — εκκρεμεί ταύτιση",
              FULLTEXT_NAME_AND_CONTEXT_HYPOTHESIS:
                "Ιστορική γραφή και συμφραζόμενα στο κείμενο — πιθανή ταύτιση",
              LATER_NAMESAKE_REQUIRES_IDENTITY_REVIEW: "Μεταγενέστερος συνονόματος — δεν ταυτίζεται αυτόματα",
              TRANSLITERATION_REQUIRES_IDENTITY_REVIEW: "Μηχανική μεταγραφή — χρειάζεται ιστορική ταύτιση",
            }[r.topical_match?.reason],
            r.research_value ? "Αξία για περαιτέρω έρευνα " + r.research_value.score + "/100" : "",
            r.evidence_confidence ? "Ωριμότητα τεκμηρίωσης " + r.evidence_confidence.score + "/100" : "",
            "Ανεπιβεβαίωτη αναφορά — απαιτείται έλεγχος της πηγής.",
          ]
            .filter(Boolean)
            .join(" · ")
        : kind === "SOURCE SEARCH"
          ? (r.hits || 0) + " αποτελέσματα καταλόγου · " + (r.queries || []).length + " αναζητήσεις"
          : "";
      rows.push(
        '<div class="result-item"><b>' +
          esc(
            ({
              DISCOVERY: "ΣΧΕΤΙΚΗ ΑΝΑΦΟΡΑ",
              CLAIM: "ΙΣΤΟΡΙΚΟΣ ΙΣΧΥΡΙΣΜΟΣ",
              BLOCKER: "ΕΜΠΟΔΙΟ",
              "CONTEXT ONLY": "ΓΕΝΙΚΟ ΠΛΑΙΣΙΟ",
              UNMATCHED: "ΑΤΑΥΤΙΣΤΟ",
              "SOURCE SEARCH": "ΑΝΑΖΗΤΗΣΗ ΠΗΓΗΣ",
            }[kind] || kind) +
              " · " +
              gr(r.evidence_state || r.status || "ΧΩΡΙΣ ΕΛΕΓΧΟ"),
          ) +
          "</b><span>" +
          esc(
            r.claim ||
              r.text ||
              r.statement ||
              r.title ||
              r.description ||
              r.note ||
              r.repository ||
              r.identifier ||
              "Καταγεγραμμένο στοιχείο",
          ) +
          "</span>" +
          (["DISCOVERY", "CONTEXT ONLY", "UNMATCHED", "CLAIM"].includes(kind)
            ? recordEvidence(r)
            : kind === "CONTRADICTION"
              ? conflictEvidence(r)
              : "") +
          "<small>" +
          esc([r.agent_id || r.lane || "", detail].filter(Boolean).join(" · ")) +
          "</small>" +
          sourceLink(r) +
          (["DISCOVERY", "CONTEXT ONLY", "UNMATCHED", "CLAIM"].includes(kind)
            ? '<button class="inspect-result" type="button" data-record="' +
              recordIndex +
              '">Λεπτομέρειες και τομέας ↗</button>'
            : "") +
          (kind === "SOURCE SEARCH"
            ? "<details><summary>Αναζητήσεις και πρόσβαση</summary>" +
              (r.queries || [])
                .map(
                  (q) =>
                    "<p>" + esc(q.query) + " — " + esc(gr(q.status)) + " · " + esc(q.hits || 0) + " αποτελέσματα</p>",
                )
                .join("") +
              "</details>"
            : "") +
          "</div>",
      );
    }
    if (resultFilter === "all" && ["CONTEXT ONLY", "UNMATCHED", "SOURCE SEARCH", "BLOCKER"].includes(kind)) {
      if (rows.length)
        items.push(
          '<details class="result-item"><summary>' +
            esc(
              {
                "CONTEXT ONLY": "Γενικό πλαίσιο — χωρίς ταύτιση προσώπου",
                UNMATCHED: "Αταύτιστα ευρήματα — δεν μετρούν ως απάντηση",
                "SOURCE SEARCH": "Πηγές και αναζητήσεις",
                BLOCKER: "Εμπόδια πρόσβασης",
              }[kind],
            ) +
            " (" +
            rows.length +
            ")</summary>" +
            rows.join("") +
            "</details>",
        );
    } else items.push(...rows);
  }
  if (resultFilter === "all" && snapshot && !related.length && !claims.length)
    items.unshift(
      '<div class="result-empty">Δεν εντοπίστηκε ακόμη αναφορά που να ταιριάζει στον ζητούμενο στόχο. Τα γενικά και αταύτιστα ευρήματα παραμένουν παρακάτω για έλεγχο.</div>',
    );
  const focus = snapshot?.mission?.research_focus;
  const facets = focus
    ? [
        ["Στόχος", focus.entity],
        ["Τόπος", (focus.places || []).join(", ")],
        ["Ρόλος", (focus.roles || []).join(", ")],
      ]
        .filter((x) => x[1])
        .map(([k, v]) => "<small>" + esc(k + ": " + v) + "</small>")
        .join("")
    : "";
  const quality = snapshot?.evidence_package?.quality;
  const audit = quality
    ? "<p>" +
      esc(
        quality.exact_replayed_quotes +
          " / " +
          quality.passages +
          " αποσπάσματα αντιστοιχούν ακριβώς στο αποθηκευμένο κείμενο. " +
          quality.identity_holds +
          " με εκκρεμή ταύτιση.",
      ) +
      "</p><small>Η πιστότητα του αποσπάσματος δεν επιβεβαιώνει την ιστορική αλήθεια του.</small>"
    : "";
  const context = snapshot
    ? '<details class="result-context"><summary>' +
      esc(snapshot.mission?.target || "Στοιχεία έρευνας") +
      "</summary><small>" +
      esc(snapshot.mission?.date_range || "") +
      " · " +
      esc(gr(missionState(snapshot))) +
      "</small>" +
      facets +
      audit +
      (snapshot.evidence_url ? sourceLink({ url: snapshot.evidence_url }) : "") +
      "</details>"
    : "";
  list.innerHTML =
    context +
    (resultFilter === "all" && !q && !resultPage ? semanticAnswer(snapshot?.research_answer) : "") +
    (items.join("") ||
      '<div class="result-empty">' +
        (resultFilter === "contradictions"
          ? "Δεν έχουν καταγραφεί αντιφάσεις. Τα προβλήματα πρόσβασης εμφανίζονται στα Εμπόδια."
          : requestedId && !snapshot
            ? "Το αίτημα παραλήφθηκε. Αναμένουμε τα αποτελέσματα της νέας έρευνας."
            : "Δεν υπάρχουν καταγεγραμμένα στοιχεία για αυτό το φίλτρο. Δοκιμάστε άλλο φίλτρο ή ανοίξτε μια άλλη έρευνα.") +
        "</div>");
  if (q && !total)
    list.innerHTML =
      context + '<div class="result-empty">Δεν υπάρχουν ευρήματα που να ταιριάζουν στην αναζήτηση.</div>';
  $("resultsList").scrollTop = 0;
}
function updateDetail() {
  const id = $("detailPanel")?.dataset?.agentId || map[$("detailTitle")?.textContent?.trim()],
    a = snapshot?.agents?.find((x) => x.id === id);
  let box = $("detailLive");
  if (!a) {
    if (box) box.remove();
    if ($("detailPanel")?.dataset?.core === "1" || $("detailTitle")?.textContent === "JARVIS") {
      $("detailDescription").textContent =
        "Συντονισμός της έρευνας και καταγεγραμμένα τεκμήρια. Η κατάσταση σύνδεσης είναι ανεξάρτητη από την ιστορική επαλήθευση.";
      $("detailState").textContent = gr(document.body.dataset.researchUi || "RECORDED");
    }
    return;
  }
  const latest = [...events].reverse().find((e) => e.agent_id === id),
    bs = (snapshot.blockers || []).filter((b) => b.agent_id === id);
  if (!box) {
    box = document.createElement("div");
    box.id = "detailLive";
    box.className = "detail-live agent-overview";
    $("detailPanel").insertBefore(box, $("focusButton"));
  }
  $("detailState").textContent =
    gr(document.body.dataset.researchUi || "RECORDED") + " · " + gr(a.status || "UNKNOWN");
  box.innerHTML =
    '<div class="agent-overview-head"><span>ΚΑΤΑΓΕΓΡΑΜΜΕΝΟΣ ΕΡΕΥΝΗΤΗΣ</span><strong>' +
    esc(gr(a.status || "UNKNOWN")) +
    "</strong></div>" +
    [
      ["Έρευνα", snapshot.run_id],
      ["Τρέχουσα εργασία", latest?.detail || a.phase || snapshot.mission?.purpose || "—"],
      ["Πηγή", bs[0]?.repository || "—"],
      ["Φάση", a.phase ? gr(a.phase) : "—"],
      ["Πρόοδος", (a.percent ?? "—") + "%"],
      ["Επαληθευμένα", a.verified_events ?? "—"],
      ["Υποψήφια", a.candidate_events ?? "—"],
      ["Εμπόδια", bs.length],
    ]
      .map(([k, v]) => "<div><span>" + k + "</span><strong>" + esc(v) + "</strong></div>")
      .join("");
}
window.addEventListener("jarvis:mission-state", (e) => {
  if (e.detail?.state) mission.textContent = globalThis.NABOU_GR ? globalThis.NABOU_GR.ui(e.detail.state) : e.detail.state;
});
window.addEventListener("jarvis:dispatch-accepted", (e) => {
  requestedId = e.detail?.request_id || "";
  snapshot = null;
  events = [];
  resultFilter = "all";
  waitForResearchRequest(requestedId);
  if (window.history && window.location) {
    const u = new URL(window.location.href);
    u.searchParams.delete("run");
    window.history.replaceState(null, "", u);
  }
  renderResults();
  renderActivity();
  drawer.classList.remove("hidden");
});
window.addEventListener("jarvis:results-filter", (e) => {
  resultPage = 0;
  resultFilter = ["all", "claims", "blockers", "contradictions"].includes(e.detail?.filter)
    ? e.detail.filter
    : "all";
  renderResults();
});
window.addEventListener("jarvis:results-open", () => drawer.classList.remove("hidden"));
window.addEventListener("jarvis:results-close", () => drawer.classList.add("hidden"));
toggle.onclick = () => drawer.classList.toggle("hidden");
close.onclick = () => drawer.classList.add("hidden");
new MutationObserver(updateDetail).observe($("detailTitle"), {
  childList: true,
  subtree: true,
  characterData: true,
});
connectResearchFeed({
  onReset: () => {
    snapshot = null;
    events = [];
    renderResults();
    renderActivity();
    updateDetail();
  },
  onSnapshot: (s, origin) => {
    const requestId = s.request_id || (s.events || []).find((e) => e.request_id)?.request_id;
    if (requestedId && requestId !== requestedId && String(s.run_id) !== String(snapshot?.run_id)) return;
    if (requestedId && requestId === requestedId) {
      selectResearchRun(s.run_id);
      if (window.history && window.location) {
        const u = new URL(window.location.href);
        u.searchParams.set("run", s.run_id);
        window.history.replaceState(null, "", u);
      }
    }
    document.body.dataset.currentResearchRun = String(s.run_id);
    document.body.dataset.evidenceRun = String(s.run_id);
    document.body.dataset.evidenceSource = origin === "LIVE" ? "LIVE BOOTSTRAP" : "DURABLE SNAPSHOT";
    snapshot = s;
    events = [...(s.events || [])];
    renderResults();
    renderActivity();
    updateDetail();
    mission.textContent = gr(missionState(s));
    settleRun(s.run_id);
    window.dispatchEvent(
      new CustomEvent("jarvis:research-state", {
        detail: { run_id: s.run_id, request_id: requestId, state: missionState(s) },
      }),
    );
  },
  onEvent: (e) => {
    if (String(e.run_id) !== String(snapshot?.run_id)) return;
    if (!events.some((x) => x.event_id === e.event_id)) events.push(e);
    events = events.slice(-1000);
    renderActivity();
    updateDetail();
    window.dispatchEvent(
      new CustomEvent("jarvis:research-state", {
        detail: { run_id: e.run_id, request_id: e.request_id, state: missionState(snapshot) },
      }),
    );
  },
  onState: (m, detail) => {
    document.body.dataset.researchUi = m;
    updateDetail();
    if (pendingRun && /snapshot_http_404/.test(String(detail || ""))) runNotFound(pendingRun);
  },
});
if (/^\d+$/.test(new URLSearchParams(globalThis.location?.search || "").get("run") || "")) {
  drawer.classList.remove("hidden");
  watchRun(new URLSearchParams(globalThis.location.search).get("run"));
}
renderActivity();
renderResults();

list.addEventListener("click", (e) => {
  const b = e.target.closest("[data-record]");
  if (!b) return;
  const r = visibleRecords[Number(b.dataset.record)];
  if (!r) return;
  const panel = $("discoveryDetail");
  panel.hidden = false;
  panel.querySelector("h3").textContent = r.title || r.claim || r.text || "Εύρημα";
  panel.querySelector("p").textContent = r.context_excerpt || r.description || r.statement || "";
  panel.querySelector("small").textContent = [
    r.repository,
    r.lane,
    r.evidence_state,
    r.printed_page != null ? "Σελίδα " + r.printed_page : "",
  ]
    .filter(Boolean)
    .join(" · ");
  panel.querySelector(".discovery-source").innerHTML = sourceLink(r);
  panel.dataset.lane = r.lane || r.agent_id || "";
  $("focusDiscovery").disabled = !panel.dataset.lane;
  panel.scrollIntoView({ block: "nearest" });
});
$("closeDiscovery").onclick = () => ($("discoveryDetail").hidden = true);
$("focusDiscovery").onclick = () => {
  drawer.classList.add("hidden");
  window.dispatchEvent(
    new CustomEvent("jarvis:focus-agent", { detail: { agent_id: $("discoveryDetail").dataset.lane } }),
  );
};
