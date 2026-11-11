"use strict";
// Library-first decision: when the long research run (20–90 minutes) is skipped, and when it starts.
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./library-first-core.js");

const book = (id, short) => ({ id, short, title: short, kind: "published" });
const hit = (b, page, text) => ({ book: b, page, text });
const A = book("a", "Ιωάννου 2000"), B = book("b", "Λάσκαρις 1956"), C = book("c", "Floristán 2015");

test("searches the name asked about, not the instruction (#350 name focus)", () => {
  assert.deepEqual(core.focus("Βρες στοιχεια για Κρεβελιε τον κουρσατο").names, ["Κρεβελιε"]);
  assert.deepEqual(core.focus("πειρατικές επιδρομές στη Κίμωλο, 16ος–17ος αιώνας").names, ["Κίμωλο"]);
  assert.deepEqual(core.focus("Π¨ετρο Λάντζα τον κερκυραιο κουρσάρο").names, ["Πετρο Λάντζα"]);
  assert.deepEqual(core.focus("Martín de Acuña").names, ["Martín de Acuña"]);
  const kimolos = core.focus("πειρατικές επιδρομές στη Κίμωλο");
  assert.ok(kimolos.stems.includes("κιμωλ") && kimolos.stems.includes("kimol"), "inflected and Latin spellings are search hypotheses");
  assert.deepEqual(core.focus("Κίμωλο, 16ος–17ος αιώνας").years, { from: 1500, to: 1699 });
  // Instruction words alone never match a passage.
  assert.equal(core.matchSpans(core.focus("Βρες στοιχεια για Κρεβελιε τον κουρσατο").stems, "Ο κουρσάρος βρήκε στοιχεία για την Κίμωλο.").length, 0);
});

test("enough in the library: show the story, do not start the long run", () => {
  const hits = [
    hit(A, 278, "Τον Μάρτιο του 1568 ο Πέτρος Λάντζας εμφανίζεται για πρώτη φορά στην περιοχή της Χιμάρας με δύο φούστες."),
    hit(B, 105, "Το 1573 ο Λάντζας διορίζεται διοικητής της Πάργας από τους Βενετούς, κατά την παράδοση της οικογένειας."),
    hit(C, "PDF 4", "En 1596 Pedro Lanza ofreció sus servicios al virrey de Nápoles con varias galeotas y gente de la Chimarra."),
    hit(A, 280, "Χωρίς το όνομα: τα τείχη της πόλης επισκευάστηκαν με έξοδα της κοινότητας το 1570."),
  ];
  const d = core.decide("Βρες στοιχεία για τον Πέτρο Λάντζα τον κουρσάρο", { ok: true, hits });
  assert.equal(d.path, "library");
  assert.equal(d.verdict.passages, 3, "only passages that name him count");
  assert.deepEqual(d.story.facts.map((f) => f.when), ["1568", "1573", "1596"], "chronological");
  assert.deepEqual(d.story.facts.map((f) => f.source), ["Ιωάννου 2000, σ. 278", "Λάσκαρις 1956, σ. 105", "Floristán 2015, σ. PDF 4"], "a source under each fact");
  assert.match(d.story.lead, /^Τι λένε τα βιβλία της βιβλιοθήκης για «Πέτρο Λάντζα»/);
  assert.ok(!/\d+ (records|εγγραφ)/.test(d.story.lead), "no record counts in the story");
});

test("two passages from two different books are enough; two from one book are not", () => {
  const two = [hit(A, 1, "Το 1568 ο Λάντζας στη Χιμάρα, με δύο φούστες και λίγους ανθρώπους από την Κέρκυρα."), hit(B, 2, "Το 1573 ο Λάντζας στην Πάργα ως διοικητής, κατά τον Λάσκαρι και τα βενετικά έγγραφα.")];
  assert.equal(core.decide("Λάντζας", { ok: true, hits: two }).path, "library");
  const oneBook = [two[0], { ...two[1], book: A }];
  const d = core.decide("Λάντζας", { ok: true, hits: oneBook });
  assert.equal(d.path, "long");
  assert.equal(d.reason, "LIBRARY_NOT_ENOUGH");
  assert.ok(d.partial, "what the library had is still shown beside the long run");
});

test("nothing in the library: the long run starts", () => {
  const d = core.decide("πειρατικές επιδρομές στη Κίμωλο, 16ος–17ος αιώνας", { ok: true, hits: [hit(A, 1, "Ο Λάντζας στην Πάργα το 1573, χωρίς καμία αναφορά στο νησί που ζητήθηκε.")] });
  assert.equal(d.path, "long");
  assert.equal(d.verdict.passages, 0);
});

test("the owner clearly asks to search further: the long run starts without waiting for the library", () => {
  for (const q of ["Λάντζας, ψάξε και στο διαδίκτυο", "Κίμωλος σε βάθος", "Κρεβελιέ — μεγάλη έρευνα", "Lanza, search the web"]) {
    assert.equal(core.wantsDeepSearch(q), true, q);
    assert.equal(core.decide(q, null).path, "long", q);
  }
  assert.equal(core.wantsDeepSearch("Βρες στοιχεία για τον Λάντζα"), false);
});

test("library could not be consulted: never start the long run silently", () => {
  assert.equal(core.decide("Λάντζας", { ok: false, status: 0 }).path, "ask");
  assert.equal(core.decide("Λάντζας", { ok: false, status: 0 }).reason, "LIBRARY_UNAVAILABLE");
  assert.equal(core.decide("Λάντζας", { ok: false, status: 401 }).reason, "LIBRARY_SIGN_IN_REQUIRED");
  assert.equal(core.decide("Λάντζας", null).path, "ask");
});

test("archive shelf marks and OCR noise are not facts", () => {
  const p = core.focusedPassages([
    hit(A, 1, "Resumen de lo escrito por Acuña en relación cortesana, AGS Estado, legajo 1078, doc. 12, sin fecha conocida."),
    hit(A, 2, "/ > fi € LÀ Δ è: x > Μι { 3 / e Acuña ¶ § ¤ ‡ † • ° ± ÷ × © ® ™ ¬ ¦ ¨ ¯ ´ ¸ ¹ ² ³ ¼ ½ ¾ ¿ ¡ « » ‹ › “ ” „"),
  ], core.focus("Martín de Acuña"));
  assert.equal(p.length, 1);
  assert.equal(p[0].year, null, "legajo 1078 is not the year 1078");
});
