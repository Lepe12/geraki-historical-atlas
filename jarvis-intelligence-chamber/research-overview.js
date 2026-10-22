// Counts describe recorded output, never automatic historical verification.
export const statusLabel = (status) =>
  ({
    BLOCKED_CONFIGURATION: "Η ανάλυση χρειάζεται ρύθμιση",
    INSUFFICIENT_EVIDENCE: "Ανεπαρκή τεκμήρια",
    COMPLETED: "Ολοκληρώθηκε",
    PARTIAL: "Ολοκληρώθηκε με εκκρεμότητες",
    RUNNING: "Σε εξέλιξη",
    FAILED: "Απέτυχε",
    BLOCKED: "Εμπόδιο",
    CANCELLED: "Ακυρώθηκε",
    QUEUED: "Σε αναμονή",
    PREPARING: "Προετοιμασία",
    IDLE: "Ανενεργή",
  })[String(status || "").toUpperCase()] || "Άγνωστη κατάσταση";
export function overview(snapshot) {
  const discoveries = Array.isArray(snapshot?.discoveries) ? snapshot.discoveries : [];
  const related = discoveries.filter((d) =>
    ["TARGET_MATCH", "POSSIBLE_TARGET"].includes(d.topical_match?.category),
  ).length;
  const claims = Array.isArray(snapshot?.claims) ? snapshot.claims.length : 0;
  const blockers = Array.isArray(snapshot?.blockers) ? snapshot.blockers.length : 0;
  const contradictions = Array.isArray(snapshot?.contradictions?.records)
    ? snapshot.contradictions.records.length
    : 0;
  const active = (snapshot?.agents || []).some((a) =>
    ["RUNNING", "PREPARING", "QUEUED", "STARTING"].includes(String(a.status).toUpperCase()),
  );
  const terminal = [
    "BLOCKED_CONFIGURATION",
    "INSUFFICIENT_EVIDENCE",
    "COMPLETED",
    "PARTIAL",
    "FAILED",
    "BLOCKED",
    "CANCELLED",
    "CANCELED",
  ].includes(String(snapshot?.mission?.status).toUpperCase());
  const title = snapshot?.mission?.target || snapshot?.mission?.purpose || "Έρευνα " + snapshot?.run_id;
  const hasEvidence = related + claims > 0;
  return {
    title,
    related,
    claims,
    blockers,
    contradictions,
    message:
      !terminal && active
        ? "Η έρευνα βρίσκεται σε εξέλιξη. Τα αποτελέσματα ενημερώνονται καθώς καταγράφονται."
        : hasEvidence
          ? "Υπάρχουν καταγεγραμμένες αναφορές για έλεγχο. Δεν αποτελούν από μόνες τους επιβεβαιωμένο ιστορικό συμπέρασμα."
          : terminal
            ? "Δεν έχουν καταγραφεί σχετικές αναφορές ή ιστορικοί ισχυρισμοί. Αυτό δεν αποδεικνύει ότι δεν υπάρχουν ιστορικές πηγές."
            : "Δεν έχουν καταγραφεί ακόμη αποτελέσματα για αυτή την έρευνα.",
    next: hasEvidence
      ? "Ανοίξτε τις πηγές παρακάτω και ελέγξτε το αρχικό κείμενο και τη σελίδα."
      : blockers
        ? "Δείτε τα εμπόδια πρόσβασης πριν αποφασίσετε τα επόμενα βήματα."
        : "Δείτε την πορεία της έρευνας ή διευκρινίστε το ερώτημα.",
    status: statusLabel(snapshot?.mission?.status),
  };
}
export function historyEntry(snapshot) {
  const id = String(snapshot?.run_id || "");
  if (!/^\d+$/.test(id)) return null;
  return {
    run_id: id,
    target: String(snapshot.mission?.target || snapshot.mission?.purpose || "Έρευνα " + id),
    date_range: String(snapshot.mission?.date_range || ""),
    generated_utc: String(snapshot.generated_utc || ""),
    status: String(snapshot.mission?.status || "UNKNOWN"),
  };
}
export function mergeHistory(...collections) {
  const map = new Map();
  for (const rows of collections)
    for (const row of rows || []) {
      const id = String(row?.run_id || "");
      if (/^\d+$/.test(id)) map.set(id, { ...row, run_id: id });
    }
  return [...map.values()].sort((a, b) =>
    a.run_id.length === b.run_id.length
      ? b.run_id.localeCompare(a.run_id)
      : b.run_id.length - a.run_id.length,
  );
}
