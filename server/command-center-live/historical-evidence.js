"use strict";
const crypto = require("crypto");

/**
 * Turn operator-selected Learning items into *unverified* source attestations
 * only when their exact quotation occurs on the submitted page text.
 *
 * Server replay is a separate acquisition gate, never historical verification.
 */
function fromReviewedKnowledge(record) {
  const pages = new Map((record.pages || [])
    .filter(x => Number.isInteger(x.page) && x.page > 0)
    .map(x => [x.page, String(x.text || "")]));
  const attestations = [], unresolved = [], seen = new Set();
  for (const item of record.items || []) {
    const page = Number(item.page);
    const sourceText = pages.get(page);
    const replayed = record.pdf_replay?.original_pdf_replayed === true;
    const replayPage = (record.pdf_replay?.pages || []).find(p => p.page === page);
    const exact = String(item.exact_excerpt || item.text || "").trim();
    if (!sourceText || !exact || !sourceText.includes(exact)) {
      unresolved.push({item_id: String(item.id || ""),
        reason: "QUOTE_NOT_REPLAYED_IN_SUBMITTED_PAGE_TEXT",
        page: Number.isInteger(page) && page > 0 ? page : null});
      continue;
    }
    const startChar=Array.from(sourceText.slice(0,sourceText.indexOf(exact))).length;
    const endChar=startChar+Array.from(exact).length;
    const identity = [record.source_id, page, exact, String(item.type || "claim")];
    const id = "att_" + crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 24);
    if (seen.has(id)) continue;
    seen.add(id);
    attestations.push({
      id, source_id: record.source_id,
      entity_id: null,
      predicate: String(item.type || "claim"),
      text: String(item.text || ""),
      exact_excerpt: exact, page,
      locator: "page " + page,
      source_basis: replayed ? "SERVER_PDF_PAGE_TEXT_EXACT_MATCH" : "CLIENT_SUPPLIED_PAGE_TEXT_EXACT_MATCH",
      source_sha256: replayed ? record.pdf_replay.source_sha256 : null,
      text_sha256: replayPage?.text_sha256 || null,
      extraction_method: replayPage?.method || "CLIENT_TEXT",
      quote_start_char: startChar,
      quote_end_char: endChar,
      offset_unit: "UNICODE_CODE_POINTS",
      bounding_boxes: (replayPage?.words || []).filter(w=>w.end_char>startChar&&w.start_char<endChar).map(w=>w.bbox),
      status: "UNREVIEWED",
      historically_verified: false,
      original_pdf_replayed: replayed,
      candidate_identity: "UNRESOLVED"
    });
  }
  return {schema: "nabou-learning-attestations-v1", attestations, unresolved,
    verified_count: 0, source_original_verified: false};
}

// ---- Agent-search: accent/case/final-sigma folding, stop-words, light stemming, ranking ----
// Search-only helpers. They never change what is stored or returned; they only decide which
// already-attested excerpts match a query and in which order.
function foldText(value) {
  return String(value || "").normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/ς/g, "σ");
}
const STOPWORDS = new Set(foldText(
  "ο η το οι τα των του της τον την τους τις στο στη στην στον στα στους στις και ή να σε με για από απο ως που ότι οτι αν ένα ενα μια ένας ενας είναι ειναι ήταν ηταν δεν έχει εχει κατά κατα προς μετά μετα παρά παρα επί επι υπό υπο ανά ανα διά δια αλλά αλλα ούτε ουτε αυτός αυτος αυτή αυτη αυτό αυτο " +
  "the a an of in on at to and or for by with from is was were be been as that this these those it its are not but into than then there their"
).split(/\s+/).filter(Boolean));
const MIN_STEM = 4;
// Longest suffix first. Greek forms are given folded (no accents, final sigma as σ).
const SUFFIXES = ["εια", "εσ", "ων", "ου", "οσ", "ησ", "ασ", "α", "η", "ο", "ι", "ing", "ed", "es", "s"]
  .map(x => foldText(x)).sort((a, b) => b.length - a.length);
function stemToken(token) {
  let stem = token;
  for (const suffix of SUFFIXES) {
    if (token.length - suffix.length >= MIN_STEM && token.endsWith(suffix)) { stem = token.slice(0, -suffix.length); break; }
  }
  // English: "pirate" and "pirates"/"pirating" must meet; drop a trailing Latin "e" when the stem stays long enough.
  if (/[a-z]/.test(stem) && stem.endsWith("e") && stem.length - 1 >= MIN_STEM) stem = stem.slice(0, -1);
  return stem;
}
function tokenizeFolded(value) {
  return foldText(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
function compileQuery(query) {
  const tokens = tokenizeFolded(query);
  const content = tokens.filter(t => !STOPWORDS.has(t));
  const used = content.length ? content : tokens;   // stop-word-only query: keep old phrase behaviour
  return {phrase: tokens.join(" "), tokens: used, stems: [...new Set(used.map(stemToken))]};
}
// Returns null when the excerpt does not match, else {phrase, matched, span} (phrase first, more
// matched stems first, tighter span first). All stems must match, except one may be missing for
// queries of 3+ meaningful tokens (these rank below full matches).
function scoreExcerpt(compiled, excerpt) {
  const tokens = tokenizeFolded(excerpt);
  if (!tokens.length || !compiled.stems.length) return null;
  const phrase = compiled.phrase && (" " + tokens.join(" ") + " ").includes(" " + compiled.phrase + " ") ? 1 : 0;
  const positions = new Map(compiled.stems.map(s => [s, []]));
  tokens.forEach((token, index) => {
    const stem = stemToken(token);
    if (positions.has(stem)) positions.get(stem).push(index);
  });
  const found = [...positions.entries()].filter(([, at]) => at.length);
  const need = compiled.stems.length >= 3 ? compiled.stems.length - 1 : compiled.stems.length;
  if (found.length < need && !phrase) return null;
  // Smallest token window containing every matched stem.
  const points = found.flatMap(([stem, at]) => at.map(i => [i, stem])).sort((a, b) => a[0] - b[0]);
  const have = new Map();
  let left = 0, best = Infinity;
  for (let right = 0; right < points.length; right++) {
    have.set(points[right][1], (have.get(points[right][1]) || 0) + 1);
    while (have.size === found.length) {
      best = Math.min(best, points[right][0] - points[left][0] + 1);
      const key = points[left][1];
      have.set(key, have.get(key) - 1);
      if (!have.get(key)) have.delete(key);
      left++;
    }
  }
  return {phrase, matched: found.length, span: Number.isFinite(best) ? best : 0};
}
function compareScores(a, b) {
  return (b.phrase - a.phrase) || (b.matched - a.matched) || (a.span - b.span);
}
function rankAttestations(query, attestations) {
  const compiled = compileQuery(query);
  return (attestations || []).map((att, index) => ({att, index, score: scoreExcerpt(compiled, att && att.exact_excerpt)}))
    .filter(x => x.score).sort((a, b) => compareScores(a.score, b.score) || a.index - b.index);
}

module.exports = {fromReviewedKnowledge, foldText, stemToken, compileQuery, scoreExcerpt, compareScores, rankAttestations};
