"use strict";
// One NABOU library on pct-live: add a PDF = it is in the library and in the search. No network, no production data.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { createLibraryReader, publishedPages, pagePassages } = require("./library-reader");
const { fromReviewedKnowledge } = require("./historical-evidence");

function harness({ signed = true, owned = true, trusted = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nabou-lib-"));
  const uploads = path.join(dir, "uploads"); fs.mkdirSync(uploads);
  const ownedDir = path.join(dir, "owned"); fs.mkdirSync(ownedDir);
  fs.writeFileSync(path.join(ownedDir, "Laskaris_1956_Petros-Lantzas.txt"),
    "Header line\n=== σ. 103 (PDF σελ. 1)\nΤο 1573 ο Πέτρος Λάντζας διορίστηκε διοικητής της Πάργας από τους Βενετούς, όπως γράφει η πηγή.\n\n=== σ. 104 (PDF σελ. 2)\nΆλλο κείμενο χωρίς το όνομα, για τα τείχη της πόλης και τους φρουρούς της.\n");
  fs.writeFileSync(path.join(ownedDir, "Floristan_2015_Combis.txt"),
    "Primera página sin nombre alguno, con texto suficiente para un pasaje.\fEn 1596 Pedro Lanza ofreció sus servicios al virrey de Nápoles con varias galeotas.\f");
  let index = [];
  const json = (res, status, body) => { res.status = status; res.body = body; };
  const reader = createLibraryReader({
    json,
    readBody: async (req) => req.bodyText,
    readRawBody: async (req) => req.raw,
    sessionAuthorized: () => signed,
    operatorAuthorized: () => false,
    trustedWebOrigin: () => trusted,
    readKnowledgeIndex: () => JSON.parse(JSON.stringify(index)),
    writeKnowledgeIndex: (v) => { index = v; },
    knowledgeRecordPath: (id) => path.join(dir, id + ".json"),
    atomicJson: (f, v) => fs.writeFileSync(f, JSON.stringify(v)),
    uploadDir: uploads,
    replayPdf: async () => ({ original_pdf_replayed: true, source_sha256: "x".repeat(64), pages: [
      { page: 1, text: "Το 1601 ο Λάντζας επέστρεψε στην Κέρκυρα\nμε δύο φρεγάτες και ζήτησε χάρη από τη Βενετία.\n\n" + "Μακρύ κείμενο. ".repeat(80) },
      { page: 2, text: "Σελίδα χωρίς όνομα αλλά με αρκετό κείμενο για ένα απόσπασμα του βιβλίου." }] }),
    fromReviewedKnowledge,
    env: { PCT_OWNED_LIBRARY_DIR: owned ? ownedDir : "" },
  });
  const call = async (method, p, { body = null, raw = null, headers = {} } = {}) => {
    const req = { method, headers, bodyText: body == null ? "" : JSON.stringify(body), raw };
    const res = {};
    const handled = await reader(req, res, p);
    return { handled, ...res };
  };
  return { call, index: () => index };
}

test("published .txt pages keep the printed page number", () => {
  const pages = publishedPages("x\n=== σ. 277\nαλφα\n=== σ. 278 (PDF σελ. 2)\nβητα");
  assert.deepEqual(pages.map((p) => p.page), ["277", "278"]);
  assert.equal(pagePassages("short").length, 0);
});

test("research searches published sources without a sign-in code; other origins cannot add a PDF", async () => {
  const h = harness({ signed: false, trusted: false });
  const s = await h.call("POST", "/library/search", { body: { query: "Πέτρος Λάντζας" } });
  assert.equal(s.status, 200);
  assert.ok(s.body.hits.length >= 2, "published passages are searchable without a code");
  assert.ok(s.body.hits.some((x) => /διοικητής|Parga|Lanza|Λάντζ/.test(x.text)));
  const b = await h.call("GET", "/library/books");
  assert.equal(b.status, 200);
  assert.equal(b.body.published.length, 2);
  assert.ok(Array.isArray(b.body.added));
  assert.ok(!JSON.stringify(b.body).includes("διοικητής"), "no page text in the title list");
  const up = await h.call("POST", "/library/books", { raw: Buffer.from("%PDF-1.4"), headers: { "content-type": "application/pdf" } });
  assert.equal(up.status, 401);
});

test("a PDF can be added from the official atlas origin, with no typed code", async () => {
  const h = harness({ signed: false, trusted: true });
  const up = await h.call("POST", "/library/books", { raw: Buffer.from("%PDF-1.4 fake"), headers: {
    "content-type": "application/pdf", "x-file-name": encodeURIComponent("atlas.pdf"),
    "x-book-title": encodeURIComponent("Δοκιμαστικό βιβλίο") } });
  assert.equal(up.status, 201);
});

test("adding a PDF puts it in the library with no approve/reject step, and the next search finds it", async () => {
  const h = harness();
  const up = await h.call("POST", "/library/books", { raw: Buffer.from("%PDF-1.4 fake"), headers: {
    "content-type": "application/pdf", "x-file-name": encodeURIComponent("Ioannou 2000.pdf"),
    "x-book-title": encodeURIComponent("Οι φουρτούνες του καπετάν-Πέτρου Λάντζα"), "x-book-author": encodeURIComponent("Ιωάννου"), "x-book-year": "2000" } });
  assert.equal(up.status, 201);
  assert.equal(up.body.status, "ADDED_TO_LIBRARY");
  assert.ok(up.body.passages >= 3, "every passage is an exact, replayable quotation of its page");
  const meta = h.index()[0];
  assert.equal(meta.state, "LEARNED", "searchable at once, also by /knowledge/agent-search for the long run");
  assert.equal(meta.library, true);
  const books = await h.call("GET", "/library/books");
  assert.equal(books.body.added.length, 1);
  assert.equal(books.body.added[0].title, "Οι φουρτούνες του καπετάν-Πέτρου Λάντζα");
  const s = await h.call("POST", "/library/search", { body: { query: "Βρες στοιχεία για τον Πέτρο Λάντζα τον κουρσάρο" } });
  assert.equal(s.status, 200);
  const kinds = new Set(s.body.hits.map((x) => x.book.kind));
  assert.ok(kinds.has("uploaded") && kinds.has("published"), "one search covers the added book and the published sources");
  assert.deepEqual(s.body.focus.names, ["Πέτρο Λάντζα"], "searches the name, not the instruction (#350)");
  assert.equal(s.body.path, "library", "three passages from three books are enough: no long run");
  const again = await h.call("POST", "/library/books", { raw: Buffer.from("%PDF-1.4 fake"), headers: { "content-type": "application/pdf" } });
  assert.equal(again.body.status, "ALREADY_IN_LIBRARY");
});

test("a name the library does not know asks for the long run", async () => {
  const h = harness();
  const s = await h.call("POST", "/library/search", { body: { query: "πειρατικές επιδρομές στη Κίμωλο, 16ος–17ος αιώνας" } });
  assert.equal(s.status, 200);
  assert.equal(s.body.hits.length, 0);
  assert.equal(s.body.path, "long");
  assert.equal(s.body.reason, "LIBRARY_NOT_ENOUGH");
  assert.equal(s.body.stores.published, "OK");
});

test("unknown routes are left to the rest of the server", async () => {
  const h = harness();
  assert.equal((await h.call("POST", "/dispatch")).handled, false);
  assert.equal((await h.call("POST", "/knowledge/upload")).handled, false);
});

test("app.js wires the library routes and lets the browser send the book fields", () => {
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert.match(app, /if\(await handleLibrary\(req,res,p\)\)return;/);
  assert.match(app, /access-control-allow-headers":"[^"]*x-book-title,x-book-author,x-book-year/);
});
