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
  window.NABOU_GR = { status, ui };
})();
