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

/** Mission still working (not a terminal outcome). */
export function isMissionInProgress(snapshot) {
  return ["RUNNING", "PREPARING", "QUEUED", "STARTING", "ACTIVE"].includes(
    String(snapshot?.mission?.status || "").toUpperCase(),
  );
}

/**
 * Topic / question text for titles and «Το ερώτημά σας».
 * Prefer mission fields; while in progress, fall back to the query the operator
 * just typed (knownQuery) so the panel never waits on the backend payload.
 */
export function resolveResearchQuery(snapshot, knownQuery = "") {
  const fromMission = String(snapshot?.mission?.purpose || snapshot?.mission?.target || "").trim();
  if (fromMission) return fromMission;
  return String(knownQuery || "").trim();
}

/** Panel / document title: topic or typed query — never «Έρευνα {runId}» or «Αφήγηση έρευνας». */
export function resolveResearchTitle(snapshot, narrative = null, knownQuery = "") {
  const narrativeTitle = String(narrative?.title_el || "").trim();
  const generic = new Set(["αφήγηση έρευνας", "αφήγηση", "αφήγηση (ελληνικά)", "research narrative"]);
  if (
    narrativeTitle &&
    !generic.has(narrativeTitle.toLocaleLowerCase("el")) &&
    !/^έρευνα\s+\d+$/i.test(narrativeTitle)
  ) {
    return narrativeTitle;
  }
  return resolveResearchQuery(snapshot, knownQuery);
}

export function overview(snapshot, { knownQuery = "" } = {}) {
  // A live-event-only snapshot has no finalized evidence package yet. Its
  // empty placeholder arrays must not be presented as measured zeroes.
  const provisional = Boolean(snapshot && !Array.isArray(snapshot.discoveries) && String(snapshot.mission?.status || '').toUpperCase() === 'RUNNING');
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
  const hasEvidence = related + claims > 0;
  const narrative = snapshot?.research_answer?.greek_narrative;
  const narrativeReady = narrative && ["NARRATIVE_PENDING_HUMAN_REVIEW", "NO_USABLE_EVIDENCE"].includes(narrative.status);
  const narrativeLead = narrativeReady
    ? (narrative.paragraphs || []).map((p) => p.text_el).filter(Boolean).slice(0, 2).join(" ")
    : "";
  const title = resolveResearchTitle(snapshot, narrativeReady ? narrative : null, knownQuery);
  return {
    title,
    related: provisional ? '—' : related,
    claims: provisional ? '—' : claims,
    blockers: provisional ? '—' : blockers,
    contradictions: provisional ? '—' : contradictions,
    narrative,
    message:
      !terminal && active
        ? "Η έρευνα βρίσκεται σε εξέλιξη. Τα αποτελέσματα ενημερώνονται καθώς καταγράφονται."
        : narrativeLead
          ? narrativeLead
          : hasEvidence
            ? (terminal ? "Δεν βγήκε ελληνική ιστορία από αυτή την έρευνα. " : "") +
              "Υπάρχουν καταγεγραμμένες αναφορές για έλεγχο στις «Πηγές». Δεν αποτελούν από μόνες τους επιβεβαιωμένο ιστορικό συμπέρασμα."
            : terminal
              ? "Δεν βγήκε ελληνική ιστορία από αυτή την έρευνα και δεν καταγράφηκαν σχετικές αναφορές. Αυτό δεν αποδεικνύει ότι δεν υπάρχουν ιστορικές πηγές."
              : "Δεν έχουν καταγραφεί ακόμη αποτελέσματα για αυτή την έρευνα.",
    next: narrativeReady
      ? "Διαβάστε το άρθρο, τις πηγές και τον χάρτη· όσα βρέθηκαν, πέρασαν και κόπηκαν, και γιατί, είναι στην Πορεία έρευνας."
      : hasEvidence
        ? "Ανοίξτε τις πηγές παρακάτω και ελέγξτε το αρχικό κείμενο και τη σελίδα."
        : blockers
          ? "Δείτε τα εμπόδια πρόσβασης πριν αποφασίσετε τα επόμενα βήματα."
          : "Δείτε την πορεία της έρευνας ή διευκρινίστε το ερώτημα.",
    status: statusLabel(snapshot?.mission?.status),
  };
}
export function historyEntry(snapshot, knownQuery = "") {
  const id = String(snapshot?.run_id || "");
  if (!/^\d+$/.test(id)) return null;
  return {
    run_id: id,
    target: String(resolveResearchQuery(snapshot, knownQuery) || "Έρευνα " + id),
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

