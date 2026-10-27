import { statusLabel } from './research-overview.js';
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const names = {
  greek: "Ελλάδα",
  travellers: "Περιηγητές",
  spanish_simancas: "Ισπανία / Simancas",
  venetian: "Βενετία",
  french: "Γαλλία",
  british: "Βρετανία",
  dutch: "Ολλανδία",
  german: "Γερμανικά κράτη",
  italian_states: "Ιταλικά κράτη",
  ottoman: "Οθωμανική αυτοκρατορία",
  north_african: "Βόρεια Αφρική",
  source_genealogy: "Γενεαλογία πηγών",
  identity_resolution: "Ταυτοποίηση",
  contradiction: "Αντιφάσεις",
  relationship_network: "Δίκτυα σχέσεων",
  timeline: "Χρονολόγιο",
  pirate_base: "Πειρατικές βάσεις",
};
const agentName = (agent) => names[agent] || agent || "Σύστημα έρευνας";
const blockerLabels = {
  REMOTE_ACCESS_BLOCKED: "Το σύστημα αναζήτησης δεν μπόρεσε να αποκτήσει πρόσβαση",
  REMOTE_RATE_LIMITED: "Περιορισμός αιτημάτων από την πηγή",
  ACCESS_DENIED: "Η πρόσβαση απορρίφθηκε",
  ACCESS_BLOCKED: "Η πρόσβαση στην πηγή εμποδίστηκε",
  AUTH_OR_BROWSER_REQUIRED: "Η πηγή απαιτεί σύνδεση ή έλεγχο μέσω browser",
  API_KEY_REQUIRED: "Απαιτείται κλειδί πρόσβασης για αυτή την πηγή",
  FAILED: "Η πρόσβαση ή η ανάκτηση απέτυχε",
  AUTH_REQUIRED: "Απαιτείται εξουσιοδότηση",
  TIMEOUT: "Η πηγή δεν απάντησε έγκαιρα",
  UNAVAILABLE: "Η πηγή δεν είναι διαθέσιμη",
  BLOCKED: "Εμπόδιο πρόσβασης",
};
export function progressInfo(snapshot) {
  const agents = Array.isArray(snapshot?.agents) ? snapshot.agents : [];
  const is = (a, states) => states.includes(String(a.status || "").toUpperCase());
  return {
    agents,
    total: agents.length,
    completed: agents.filter((a) => is(a, ["COMPLETED", "DONE"])).length,
    active: agents.filter((a) => is(a, ["RUNNING", "PREPARING", "STARTING", "QUEUED"])).length,
    blocked: agents.filter((a) => is(a, ["FAILED", "ERROR", "BLOCKED", "UNAVAILABLE"])).length,
  };
}
function date(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.valueOf())
    ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(d)
    : "Χρόνος μη διαθέσιμος";
}
function expandable(rows, limit, label) {
  return (
    rows.slice(0, limit).join("") +
    (rows.length > limit
      ? '<li class="dossier-more"><details data-dossier-key="' +
        escape(label) +
        '"><summary>' +
        label +
        " (" +
        (rows.length - limit) +
        ")</summary><ul>" +
        rows.slice(limit).join("") +
        "</ul></details></li>"
      : "")
  );
}
export function dossierMarkup(snapshot) {
  if (!snapshot)
    return {
      progress: "<p>Η πρόοδος θα εμφανιστεί όταν φορτωθεί η έρευνα.</p>",
      pending: "<p>Δεν υπάρχει επιλεγμένη έρευνα για έλεγχο εκκρεμοτήτων.</p>",
      updates: "<p>Δεν υπάρχει επιλεγμένη έρευνα.</p>",
    };
  const p = progressInfo(snapshot);
  const provisional = !Array.isArray(snapshot.discoveries) && String(snapshot.mission?.status || '').toUpperCase() === 'RUNNING';
  const agents = p.agents.map((a) => {
    const percent = Number(a.percent),
      valid =
        ["number", "string"].includes(typeof a.percent) &&
        a.percent !== null &&
        a.percent !== undefined &&
        a.percent !== "" &&
        Number.isFinite(percent) &&
        percent >= 0 &&
        percent <= 100;
    return (
      "<li><div><strong>" +
      escape(agentName(a.id || a.agent_id)) +
      "</strong><span>" +
      escape(statusLabel(a.status)) +
      "</span></div>" +
      (valid
        ? "<small>Πρόοδος εργασίας: " + percent + "%</small>"
        : "<small>Δεν αναφέρεται ποσοστό προόδου.</small>") +
      "</li>"
    );
  });
  const blockers = (Array.isArray(snapshot.blockers) ? snapshot.blockers : []).map((b, index) => {
    const source =
      b.repository || String(b.connector_id || "").replace(/^repo:/, "") || agentName(b.agent_id);
    const reason =
      b.description ||
      b.note ||
      blockerLabels[b.status || b.code] ||
      b.status ||
      b.code ||
      "Εμπόδιο που χρειάζεται έλεγχο.";
    return (
      "<li><strong>" +
      escape(source) +
      "</strong><p>" +
      escape(reason) +
      "</p><small>" +
      escape(agentName(b.agent_id)) +
      "</small>" +
      (b.detail
        ? '<details data-dossier-key="' +
          escape([b.agent_id, source, b.status || b.code, index].join("|")) +
          '"><summary>Τεχνικές λεπτομέρειες</summary><p>' +
          escape(b.detail) +
          "</p></details>"
        : "") +
      "</li>"
    );
  });
  const contradictions = Array.isArray(snapshot.contradictions?.records)
    ? snapshot.contradictions.records
    : [];
  const leads =
    (snapshot.discoveries || []).filter((d) =>
      ["TARGET_MATCH", "POSSIBLE_TARGET"].includes(d.topical_match?.category),
    ).length + (snapshot.claims || []).length;
  const pending =
    "<p>" +
    (leads
      ? "Οι αναφορές και οι ισχυρισμοί χρειάζονται έλεγχο του πρωτοτύπου, της σελίδας και της ανεξαρτησίας των πηγών."
      : provisional ? "Τα τελικά στοιχεία δεν έχουν ακόμη δημοσιευτεί." : "Δεν έχουν καταγραφεί σχετικές αναφορές ή ισχυρισμοί προς έλεγχο.") +
    "</p>" +
    (contradictions.length
      ? "<p>" +
        contradictions.length +
        " καταγεγραμμένες αντιφάσεις. Δείτε το φίλτρο «Αντιφάσεις» στα ευρήματα.</p>"
      : "") +
    (blockers.length
      ? "<h3>Εμπόδια πρόσβασης (" +
        blockers.length +
        ')</h3><ul class="dossier-list">' +
        expandable(blockers, 3, "Περισσότερα εμπόδια") +
        "</ul>"
      : provisional ? "<p>Τα εμπόδια δεν είναι ακόμη διαθέσιμα στον τελικό φάκελο. Δείτε τις ενημερώσεις για όσα αναφέρονται κατά την εκτέλεση.</p>" : "<p>Δεν έχουν καταγραφεί εμπόδια πρόσβασης. Αυτό δεν επιβεβαιώνει ότι εξετάστηκαν όλες οι πηγές.</p>");
  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  const updates = [...events]
    .reverse()
    .map(
      (e) =>
        "<li><strong>" +
        escape(agentName(e.agent_id)) +
        "</strong><p>" +
        escape(e.detail || e.phase || statusLabel(e.status)) +
        "</p><time>" +
        escape(date(e.created_utc || e.timestamp || e.at)) +
        "</time></li>",
    );
  return {
    progress:
      (p.total
        ? '<p class="dossier-progress-summary"><strong>' +
          p.completed +
          " / " +
          p.total +
          "</strong> ερευνητές έχουν ολοκληρώσει την εργασία τους. " +
          p.active +
          " σε εξέλιξη ή αναμονή · " +
          p.blocked +
          ' με εμπόδιο ή αποτυχία.</p><details data-dossier-key="agents"><summary>Κατάσταση κάθε ερευνητή</summary><ul class="dossier-list">' +
          agents.join("") +
          "</ul></details>"
        : "<p>Δεν έχει καταγραφεί ακόμη ομάδα ερευνητών.</p>") +
      "<small>Κατάσταση από την τελευταία καταγραφή· η πρόοδος εργασίας δεν είναι βαθμός ιστορικής βεβαιότητας.</small>",
    pending,
    updates: updates.length
      ? '<ol class="dossier-list">' + expandable(updates, 5, "Παλαιότερες ενημερώσεις") + "</ol>"
      : "<p>Δεν υπάρχουν καταγεγραμμένες ενημερώσεις για αυτή την έρευνα.</p>",
  };
}

