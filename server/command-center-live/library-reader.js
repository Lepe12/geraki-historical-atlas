"use strict";
/* NABOU one library (pct-live). NOT DEPLOYED until the owner says «ανέβασέ το».
 *
 * One place for the books the reader uses:
 *   - published sources: the owner's published source library, read from a
 *     server-side folder (PCT_OWNED_LIBRARY_DIR, the .txt files beside each PDF).
 *     Never committed to the public repository.
 *   - books the owner adds as PDF: stored in the existing knowledge store
 *     (KNOWLEDGE_DIR) as LEARNED records with page passages, so the same book
 *     is also returned by /knowledge/agent-search to the long research run.
 *     No approve/reject step.
 *   - the historical library (MariaDB, tools/library/n7_library.php), when the
 *     CLI is installed on the host.
 *
 * Routes (all under /pct-api/live):
 *   GET  /library/status   public, no text: what is configured.
 *   GET  /library/books    public list of titles (published and added); no page text.
 *   POST /library/books    add a PDF from the official atlas origin (no typed code).
 *   POST /library/search   passages for a question; no sign-in.
 * The title list has no page text. Search returns short passages for the asked name.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
function loadCore(){
  const candidates=[
    path.resolve(__dirname,"library-first-core.js"),
    path.resolve(__dirname,"../../jarvis-intelligence-chamber/library-first-core.js"),
  ];
  for(const file of candidates){if(fs.existsSync(file))return require(file);}
  throw new Error("library_first_core_missing");
}
const core = loadCore();

const MAX_HITS = 40;
const PASSAGE_CHARS = 900;

/** Split a page into passages of at most PASSAGE_CHARS, on paragraph or sentence ends.
 *  Each passage is an exact substring of the page text, so it stays a replayable quotation. */
function pagePassages(text) {
  const raw = String(text || "");
  const out = [];
  const keep = (chunk) => { const t = chunk.trim(); if (t.replace(/\s+/g, " ").length >= 40) out.push(t); };
  for (const part of raw.split(/\n[ \t]*\n/)) {
    let rest = part;
    while (rest.trim().length > PASSAGE_CHARS) {
      let cut = rest.lastIndexOf(". ", PASSAGE_CHARS);
      if (cut < 0) cut = rest.lastIndexOf(".\n", PASSAGE_CHARS);
      if (cut < PASSAGE_CHARS * 0.4) cut = PASSAGE_CHARS - 1;
      keep(rest.slice(0, cut + 1));
      rest = rest.slice(cut + 1);
    }
    keep(rest);
  }
  return out;
}

/** Published source .txt: «=== σ. N» markers, or form feeds between PDF pages. */
function publishedPages(text) {
  const raw = String(text || "");
  if (/^=== σ\. /m.test(raw)) {
    const pages = [];
    const re = /^=== σ\. ([^\n(]+?)\s*(?:\(.*\))?\s*$/gm;
    const marks = [...raw.matchAll(re)];
    marks.forEach((m, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].index : raw.length;
      pages.push({ page: m[1].trim(), text: raw.slice(m.index + m[0].length, end) });
    });
    return pages;
  }
  return raw.split("\f").map((t, i) => ({ page: "PDF " + (i + 1), text: t })).filter((p) => p.text.trim());
}

/** Catalogue of the published folder. Titles come from an optional catalog.json; else the file name. */
const DEFAULT_CATALOG = [
  path.resolve(__dirname, "published-library.json"),
  path.resolve(__dirname, "../../jarvis-intelligence-chamber/data/published-library.json"),
].find((file) => fs.existsSync(file)) || path.resolve(__dirname, "../../jarvis-intelligence-chamber/data/published-library.json");
function readPublishedCatalog(dir, catalogFile = DEFAULT_CATALOG) {
  if (!dir || !fs.existsSync(dir)) return [];
  let meta = {};
  try {
    for (const b of JSON.parse(fs.readFileSync(catalogFile, "utf8")).books || []) meta[String(b.id).replace(/^pub:/, "")] = b;
  } catch (_) {}
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((file) => {
      const id = file.replace(/\.txt$/, "");
      const m = meta[id] || {};
      const [author, year] = id.split("_");
      return { id: "pub:" + id, file, kind: "published", title: m.title || id.replace(/[_-]+/g, " "), author: m.author || author || "", year: m.year || year || "", short: m.short || [author, year].filter(Boolean).join(" ") };
    });
}

function createLibraryReader(deps) {
  const {
    json, readBody, readRawBody, sessionAuthorized, operatorAuthorized, trustedWebOrigin,
    readKnowledgeIndex, writeKnowledgeIndex, knowledgeRecordPath, atomicJson, uploadDir,
    replayPdf, fromReviewedKnowledge, historicalSearch = null, syncLearningEvidence = null,
    env = process.env, now = () => new Date(),
  } = deps;
  const ownedDir = () => String(env.PCT_OWNED_LIBRARY_DIR || "");
  const signedIn = (req) => Boolean(operatorAuthorized(req) || sessionAuthorized(req));
  const canWrite = (req) => Boolean(operatorAuthorized(req) || trustedWebOrigin(req));
  let publishedCache = null;

  function published() {
    const dir = ownedDir();
    if (publishedCache && publishedCache.dir === dir) return publishedCache.books;
    const books = readPublishedCatalog(dir, env.PCT_OWNED_LIBRARY_CATALOG || DEFAULT_CATALOG).map((b) => {
      let pages = [];
      try { pages = publishedPages(fs.readFileSync(path.join(dir, b.file), "utf8")); } catch (_) {}
      return { ...b, pages };
    });
    publishedCache = { dir, books };
    return books;
  }
  const bookOfMeta = (m) => ({ id: m.source_id, kind: "uploaded", title: m.title || m.original_name, author: m.author || "", year: m.year || "", short: [m.author, m.year].filter(Boolean).join(" ") || m.title || m.original_name });
  const addedBooks = () => readKnowledgeIndex().filter((x) => x.state === "LEARNED" && x.library === true);

  function searchPassages(query) {
    const f = core.focus(query);
    const hits = [];
    const stores = { published: ownedDir() ? "OK" : "NOT_CONFIGURED", uploaded: "OK", historical: historicalSearch ? "PENDING" : "NOT_CONFIGURED" };
    const push = (book, page, text) => { if (core.matchSpans(f.stems, text).length) hits.push({ book, page, text: String(text).slice(0, 2400) }); };
    for (const b of published()) {
      const book = { id: b.id, kind: b.kind, title: b.title, short: b.short };
      for (const p of b.pages) for (const passage of pagePassages(p.text)) push(book, p.page, passage);
    }
    // Every LEARNED knowledge source counts: books added here and sources kept from the old Δεδομένα flow.
    for (const meta of readKnowledgeIndex().filter((x) => x.state === "LEARNED").slice(0, 500)) {
      try {
        const rec = JSON.parse(fs.readFileSync(knowledgeRecordPath(meta.source_id), "utf8"));
        const book = bookOfMeta(meta);
        for (const att of rec.historical_evidence?.attestations || []) push(book, att.page, att.exact_excerpt);
      } catch (_) {}
    }
    return { focus: f, hits, stores };
  }

  return async function handle(req, res, p) {
    if (!["/library/status", "/library/books", "/library/search"].includes(p)) return false;
    if (p === "/library/status" && req.method === "GET") {
      json(res, 200, { schema: "nabou-library-status-v1", signed_in: signedIn(req), can_add: canWrite(req),
        published_configured: Boolean(ownedDir() && fs.existsSync(ownedDir())), historical_configured: Boolean(historicalSearch) });
      return true;
    }
    if (p === "/library/books" && req.method === "GET") {
      const pub = published().map(({ pages, file, ...b }) => ({ ...b, pages: pages.length }));
      json(res, 200, { schema: "nabou-library-books-v1", published: pub,
        added: addedBooks().map((m) => ({ ...bookOfMeta(m), pages: m.pages || null, added_at: m.uploaded_at })) });
      return true;
    }
    if (p === "/library/books" && req.method === "POST") {
      if (!canWrite(req)) { json(res, 401, { error: "library_sign_in_required" }); return true; }
      if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/pdf")) { json(res, 415, { error: "pdf_required" }); return true; }
      let raw;
      try { raw = await readRawBody(req); } catch (_) { json(res, 413, { error: "pdf_too_large" }); return true; }
      if (raw.length < 5 || raw.subarray(0, 5).toString("ascii") !== "%PDF-") { json(res, 400, { error: "invalid_pdf" }); return true; }
      if (readKnowledgeIndex().length >= 500) { json(res, 507, { error: "LIBRARY_CAPACITY_REACHED" }); return true; }
      const header = (name, max) => { try { return decodeURIComponent(String(req.headers[name] || "")).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max); } catch (_) { return ""; } };
      const sha = crypto.createHash("sha256").update(raw).digest("hex");
      const already = readKnowledgeIndex().find((x) => x.source_sha256 === sha && x.state === "LEARNED");
      if (already) { json(res, 200, { status: "ALREADY_IN_LIBRARY", book: bookOfMeta(already) }); return true; }
      const sourceId = "src-" + Date.now().toString(36) + "-" + crypto.randomBytes(4).toString("hex");
      const original = header("x-file-name", 160).replace(/[^\p{L}\p{N}._ -]/gu, "_") || "book.pdf";
      const file = path.join(uploadDir, sourceId + ".pdf");
      fs.writeFileSync(file, raw, { flag: "wx", mode: 0o600 });
      let replay;
      try { replay = await replayPdf(file); }
      catch (error) { try { fs.unlinkSync(file); } catch (_) {} json(res, error.message === "PDF_PARSER_BUSY" ? 503 : 422, { error: "pdf_unreadable", detail: error.message }); return true; }
      // Every readable passage becomes an item. No per-item approve/reject.
      const items = [];
      for (const pg of replay.pages || []) pagePassages(pg.text).forEach((text, i) => items.push({ id: "p" + pg.page + "-" + i, type: "passage", text, exact_excerpt: text, page: pg.page, status: "accepted" }));
      const at = now().toISOString();
      const record = { schema: "naboux-knowledge-source-v1", source_id: sourceId, original_name: original, reviewed_at: at, source_sha256: replay.source_sha256, pdf_replay: replay, pages: replay.pages, items };
      record.historical_evidence = fromReviewedKnowledge(record);
      record.review_event = { actor: "library_owner", method: "library_add", reason: "Added to the NABOU library", at };
      atomicJson(knowledgeRecordPath(sourceId), record);
      const meta = { source_id: sourceId, original_name: original, size: raw.length, source_sha256: sha, state: "LEARNED", library: true,
        title: header("x-book-title", 300) || original.replace(/\.pdf$/i, ""), author: header("x-book-author", 200), year: header("x-book-year", 20),
        uploaded_at: at, reviewed_at: at, pages: (replay.pages || []).length,
        readable_pages: (replay.pages || []).filter((x) => String(x.text || "").trim().length >= 40).length,
        accepted_items: items.length, attested_quotes: record.historical_evidence.attestations.length };
      const index = readKnowledgeIndex(); index.unshift(meta); writeKnowledgeIndex(index);
      const storage = syncLearningEvidence ? await syncLearningEvidence(sourceId) : null;
      json(res, 201, { status: "ADDED_TO_LIBRARY", book: bookOfMeta(meta), pages: meta.pages, readable_pages: meta.readable_pages, passages: meta.attested_quotes, storage, historically_verified: false });
      return true;
    }
    if (p === "/library/search" && req.method === "POST") {
      let body;
      try { body = JSON.parse(await readBody(req, 4096)); } catch (_) { json(res, 400, { error: "invalid_json" }); return true; }
      const query = typeof body?.query === "string" ? body.query.trim() : "";
      if (query.length < 3 || query.length > 500 || /[\u0000-\u0008\u000b-\u001f]/.test(query)) { json(res, 400, { error: "invalid_query" }); return true; }
      const started = Date.now();
      const { focus, hits, stores } = searchPassages(query);
      if (historicalSearch && focus.names.length) {
        try {
          for (const m of (await historicalSearch(focus.names[0].split(/\s+/).pop())) || []) {
            const book = { id: "hist:" + (m.source_id || ""), kind: "historical", title: m.title || "Ιστορική βιβλιοθήκη", short: [m.author, m.publication_year].filter(Boolean).join(" ") || m.title };
            if (core.matchSpans(focus.stems, m.excerpt || m.text || "").length) hits.push({ book, page: m.printed_page || m.scan_index || null, text: String(m.excerpt || m.text || "").slice(0, 2400) });
          }
          stores.historical = "OK";
        } catch (_) { stores.historical = "UNAVAILABLE"; }
      }
      const decision = core.decide(query, { ok: true, hits });
      json(res, 200, { schema: "nabou-library-search-v1", query, focus, stores, took_ms: Date.now() - started,
        hits: hits.slice(0, MAX_HITS), path: decision.path, reason: decision.reason, verdict: decision.verdict || null, historically_verified: false });
      return true;
    }
    json(res, 405, { error: "method_not_allowed" });
    return true;
  };
}

module.exports = { createLibraryReader, pagePassages, publishedPages, readPublishedCatalog };
