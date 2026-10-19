"use strict";
const crypto = require("crypto");

/**
 * Turn operator-selected Learning items into *unverified* source attestations
 * only when their exact quotation occurs on the submitted page text.
 *
 * The original PDF is not parsed or replayed by this server: client text
 * therefore remains CLIENT_SUPPLIED_TEXT rather than verified primary evidence.
 */
function fromReviewedKnowledge(record) {
  const pages = new Map((record.pages || [])
    .filter(x => Number.isInteger(x.page) && x.page > 0)
    .map(x => [x.page, String(x.text || "")]));
  const attestations = [], unresolved = [], seen = new Set();
  for (const item of record.items || []) {
    const page = Number(item.page);
    const sourceText = pages.get(page);
    const exact = String(item.exact_excerpt || item.text || "").trim();
    if (!sourceText || !exact || !sourceText.includes(exact)) {
      unresolved.push({item_id: String(item.id || ""),
        reason: "QUOTE_NOT_REPLAYED_IN_SUBMITTED_PAGE_TEXT",
        page: Number.isInteger(page) && page > 0 ? page : null});
      continue;
    }
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
      source_basis: "CLIENT_SUPPLIED_PAGE_TEXT_EXACT_MATCH",
      status: "UNREVIEWED",
      historically_verified: false,
      original_pdf_replayed: false,
      candidate_identity: "UNRESOLVED"
    });
  }
  return {schema: "nabou-learning-attestations-v1", attestations, unresolved,
    verified_count: 0, source_original_verified: false};
}

module.exports = {fromReviewedKnowledge};
