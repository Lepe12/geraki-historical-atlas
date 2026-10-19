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

module.exports = {fromReviewedKnowledge};
