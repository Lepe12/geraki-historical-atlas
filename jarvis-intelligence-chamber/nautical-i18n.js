"use strict";
/* Greek display labels for status codes and server messages.
   Presentation only: callers keep the original codes for their own logic. */
(() => {
  const codes = {
    COMPLETED: "Ολοκληρώθηκε", DONE: "Ολοκληρώθηκε", COMPLETE: "Ολοκληρώθηκε",
    RUNNING: "Σε εξέλιξη", ACTIVE: "Σε εξέλιξη", "RESEARCH ACTIVE": "Έρευνα σε εξέλιξη",
    PARTIAL: "Ολοκληρώθηκε με εκκρεμότητες", PENDING: "Σε αναμονή", QUEUED: "Στην ουρά",
    PREPARING: "Προετοιμασία", STARTING: "Εκκίνηση", PLANNING: "Σχεδιασμός έρευνας",
    FAILED: "Απέτυχε", ERROR: "Σφάλμα", BLOCKED: "Εμπόδιο", BLOCKED_CONFIGURATION: "Εκκρεμεί ρύθμιση",
    INSUFFICIENT_EVIDENCE: "Ανεπαρκή τεκμήρια", INSUFFICIENT_ACQUIRED_EVIDENCE: "Ανεπαρκή τεκμήρια",
    CANCELLED: "Ακυρώθηκε", CANCELED: "Ακυρώθηκε", SKIPPED: "Παραλείφθηκε", UNAVAILABLE: "Μη διαθέσιμο",
    IDLE: "Ανενεργός", STANDBY: "Σε αναμονή", READY: "Έτοιμο", RESEARCH_COVERAGE_PENDING: "Εκκρεμεί η κάλυψη της έρευνας", UNKNOWN: "Άγνωστο", RECORDED: "Καταγεγραμμένο",
    LIVE: "Ζωντανά", SNAPSHOT: "Αποθηκευμένα δεδομένα", OFFLINE: "Χωρίς σύνδεση", CONNECTING: "Σύνδεση…",
    RECONNECTING: "Επανασύνδεση…", WAITING: "Αναμονή νέας έρευνας", "RUN RECEIVED": "Η έρευνα παραλήφθηκε",
    ACQUIRED: "Αποκτήθηκε", CANDIDATE: "Υποψήφιο", UNVERIFIED: "Ανεπιβεβαίωτο", VERIFIED: "Επαληθευμένο",
    REMOTE_ACCESS_BLOCKED: "Η πρόσβαση στην πηγή αποκλείστηκε", REMOTE_RATE_LIMITED: "Όριο αιτημάτων της πηγής",
    NO_CANDIDATE_TO_VERIFY: "Κανένα υποψήφιο προς έλεγχο", "ΕΤΟΙΜΟ": "Έτοιμο",
    "CONCEPT ONLY": "Μόνο οπτική απεικόνιση", "VISUAL ONLY": "Μόνο οπτική απεικόνιση",
  };
  const messages = [
    [/^REQUEST BLOCKED · HTTP 403$/, "Το αίτημα απορρίφθηκε · HTTP 403"],
    [/^DISPATCH ENDPOINT MISSING · 404$/, "Η υπηρεσία αποστολής δεν βρέθηκε · HTTP 404"],
    [/^RATE LIMITED · 429$/, "Πάρα πολλά αιτήματα — δοκιμάστε αργότερα · HTTP 429"],
    [/^DISPATCH HTTP (\d+)$/, "Σφάλμα αποστολής · HTTP $1"],
    [/^INVALID SERVER RESPONSE$/, "Μη έγκυρη απάντηση διακομιστή"],
    [/^READING (\d+) \/ (\d+)$/, "Ανάγνωση σελίδας $1 / $2"],
    [/^READY$/, "Έτοιμο"],
    [/^PDF REQUIRED$/, "Απαιτείται αρχείο PDF"],
    [/^READING PDF LOCALLY$/, "Ανάγνωση του PDF στον υπολογιστή σας"],
    [/^NO TEXT LAYER — OCR REQUIRED$/, "Χωρίς επίπεδο κειμένου — απαιτείται OCR"],
    [/^BUILDING REVIEW$/, "Προετοιμασία προτάσεων για έλεγχο"],
    [/^TEXT FOUND — EXTRACTION NEEDS REVIEW$/, "Βρέθηκε κείμενο — η εξαγωγή χρειάζεται έλεγχο"],
    [/^UPLOADING APPROVED SOURCE$/, "Αποστολή της εγκεκριμένης πηγής"],
    [/^SAVING APPROVED MEMORY$/, "Αποθήκευση εγκεκριμένων στοιχείων"],
    [/^KNOWLEDGE BACKEND UNAVAILABLE$/, "Η υπηρεσία αποθήκευσης δεν είναι διαθέσιμη"],
  ];
  function status(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return raw;
    const key = raw.toUpperCase();
    if (codes[key]) return codes[key];
    if (codes[raw]) return codes[raw];
    return /^[A-Z][A-Z0-9_]+$/.test(raw) ? raw.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) : raw;
  }
  function ui(value) {
    const raw = String(value ?? "");
    for (const [re, out] of messages) if (re.test(raw)) return raw.replace(re, out);
    return status(raw);
  }
  /* ---- Κεντρικό λεξικό για τη «Πορεία»: ερευνητές, γεγονότα, μηνύματα καταγραφής ----
     Κάθε άγνωστο τεχνικό μήνυμα εμφανίζεται με ελληνική γενική περιγραφή· το αρχικό κείμενο μένει
     διαθέσιμο ως «τεχνική λεπτομέρεια». */
  const agents = {
    JARVIS: "Συντονιστής έρευνας", NABOU: "Συντονιστής έρευνας", SYSTEM: "Σύστημα",
    greek: "Ελλάδα", spanish_simancas: "Ισπανία / Simancas", venetian: "Βενετία", french: "Γαλλία",
    british: "Βρετανία", dutch: "Ολλανδία", german: "Γερμανικά κράτη", italian_states: "Ιταλικά κράτη",
    ottoman: "Οθωμανική αυτοκρατορία", north_african: "Βόρεια Αφρική", travellers: "Περιηγητές & αφηγήσεις",
    source_genealogy: "Γενεαλογία πηγών", identity_resolution: "Ταυτοποίηση", contradiction: "Αντιφάσεις",
    relationship_network: "Δίκτυα σχέσεων", timeline: "Χρονολόγιο", pirate_base: "Πειρατικές βάσεις",
    pirate_biography: "Βιογραφία πειρατή",
  };
  const events = {
    RUN_STARTED: "Έναρξη έρευνας", RUN_COMPLETED: "Η έρευνα ολοκληρώθηκε", RUN_FAILED: "Η έρευνα απέτυχε",
    AGENT_STARTED: "Ο ερευνητής ξεκίνησε", AGENT_COMPLETED: "Ο ερευνητής ολοκλήρωσε", AGENT_FAILED: "Ο ερευνητής απέτυχε",
    SEARCH_STARTED: "Έναρξη αναζήτησης", SEARCH_COMPLETED: "Η αναζήτηση ολοκληρώθηκε",
    SOURCE_BLOCKED: "Η πηγή απέρριψε το αίτημα", PERMIT_ISSUED: "Εκδόθηκε άδεια ανάγνωσης",
  };
  const logs = [
    [/^(\d+) candidate events?; (\d+) blockers?$/i, (m) => m[1] + " υποψήφια γεγονότα · " + m[2] + " εμπόδια πρόσβασης"],
    [/^(\d+) discovery records?; permit ([\w-]+)$/i, (m) => m[1] + " εγγραφές ευρημάτων · άδεια " + m[2]],
    [/^repo:(.+?)\s+"(.*)"(?:\s+(associates|history))?$/i, (m) =>
      "Αναζήτηση στο αρχείο «" + m[1] + "» για «" + m[2] + "»" + (m[3] ? (/assoc/i.test(m[3]) ? " (σχέσεις)" : " (ιστορικό)") : "")],
    [/^repo:(.+)$/i, (m) => "Αναζήτηση στο αρχείο «" + m[1] + "»"],
    [/^run (started|received)$/i, () => "Η έρευνα παραλήφθηκε"],
    [/^run completed$/i, () => "Η έρευνα ολοκληρώθηκε"],
    [/^(\d+) lines? (?:completed|done)$/i, (m) => m[1] + " γραμμές ολοκληρώθηκαν"],
  ];
  const hasGreek = (t) => /[\u0370-\u03FF\u1F00-\u1FFF]/.test(t);
  function agent(id) {
    const raw = String(id ?? "").trim();
    if (!raw) return agents.JARVIS;
    return agents[raw] || agents[raw.toUpperCase()] || raw.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }
  /* Επιστρέφει { who, text, state, raw } για ένα γεγονός της πορείας. */
  function event(e) {
    e = e || {};
    const rawText = String(e.detail ?? "").trim();
    const code = e.phase || e.status || e.event_type || "";
    let text = "";
    if (rawText) {
      for (const [re, fn] of logs) { const m = rawText.match(re); if (m) { text = fn(m); break; } }
      if (!text) text = hasGreek(rawText) ? rawText : ui(rawText);
      if (!hasGreek(text)) text = "Ενημέρωση συστήματος (τεχνικό μήνυμα — δείτε τις λεπτομέρειες)";
    } else {
      text = events[String(e.event_type || "").toUpperCase()] || status(code) || "Ενημέρωση συστήματος";
    }
    const st = String(e.status || e.phase || "").toUpperCase();
    const state = /FAIL|ERROR|BLOCK|UNAVAIL|CANCEL/.test(st) ? "bad" : /COMPLETE|DONE/.test(st) ? "ok" : /RUN|ACTIVE|START|PREPAR|QUEUE/.test(st) ? "run" : "info";
    return { who: agent(e.agent_id), text, state, raw: rawText, code };
  }
  window.NABOU_GR = { status, ui, agent, event };
})();
