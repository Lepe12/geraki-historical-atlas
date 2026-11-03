// Local unit test for the PDF review proposals. No network. The attestation part needs poppler's pdftotext (the same tool the
// server replay uses); without it that part is skipped. Fixture: fixtures/learning-fixture.pdf (make-learning-fixture.py) and the
// pdf.js lines extracted from it (learning-fixture.lines.json).
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), { execFileSync } = require("node:child_process");
const { buildProposals, toPayload, linesFromItems } = require("./learning-proposals.js");
const { fromReviewedKnowledge } = require("../server/command-center-live/historical-evidence.js");
const pdf = path.join(__dirname, "fixtures", "learning-fixture.pdf");
const pages = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "learning-fixture.lines.json"), "utf8")).pages;

const { items, stats } = buildProposals(pages);
const kinds = (k) => items.filter((x) => x.extraction_kind === k);
console.log("items", items.length, "passages", kinds("excerpt").length, "entities", kinds("entity").length, "dates", kinds("date").length, JSON.stringify(stats));
assert.ok(items.length > 10 && items.length <= 40, "far fewer proposals than before (144 on this fixture)");
for (const p of kinds("excerpt")) { assert.ok(p.text.length >= 60 && p.text.length <= 1200, "passage size " + p.text.length); assert.equal(p.occurrences.length, 1); }
assert.ok(!items.some((x) => /ΝΑΥΤΙΚΗ ΙΣΤΟΡΙΑ ΤΟΥ ΑΙΓΑΙΟΥ — Δοκίμιο|Σελίδα \d/.test(x.text)), "running header/footer and page numbers are dropped");
assert.ok(!items.some((x) => /\.{4,}|(\. ){4,}/.test(x.text)), "TOC dot leaders are dropped");
const norm = (t) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
for (const k of ["entity", "date"]) { const seen = new Set(kinds(k).map((x) => norm(x.text))); assert.equal(seen.size, kinds(k).length, "identical " + k + "s are collapsed"); }
const d1821 = items.find((x) => x.text === "1821");
assert.ok(d1821 && d1821.pages.length > 3, "a repeated date lists all its pages");

items.forEach((x) => (x.status = "accepted"));
const payload = toPayload(items);
assert.equal(payload.length, items.reduce((n, x) => n + x.occurrences.length, 0), "one payload item per page occurrence");
assert.ok(payload.every((x) => x.exact_excerpt && x.page && x.status === "accepted"));

let pop = null;
try { pop = execFileSync("pdftotext", ["-enc", "UTF-8", pdf, "-"], { maxBuffer: 1 << 26 }).toString().split("\f").slice(0, pages.length).map((t, i) => ({ page: i + 1, text: t })); }
catch (e) { console.log("SKIP attestation part: pdftotext is not available"); }
if (pop) {
  const attest = (its) => {
    const r = fromReviewedKnowledge({ source_id: "src-test", pages: pop, pdf_replay: { original_pdf_replayed: true, pages: pop, source_sha256: "x" }, items: its });
    return its.filter((it) => r.attestations.some((a) => a.page === it.page && a.text === it.text && a.exact_excerpt === (it.exact_excerpt || it.text))).length;
  };
  assert.equal(attest(payload), payload.length, "every item the client sends passes server attestation");
  const edited = payload.slice(0, 3).map((x) => ({ ...x, text: x.text + " (διορθωμένο)" }));
  assert.equal(attest(edited), 3, "edited text survives because exact_excerpt keeps the original quotation");
  const oldStyle = edited.map(({ exact_excerpt, ...rest }) => rest);
  const lost = oldStyle.filter((x) => x.extraction_kind === "excerpt").length - attest(oldStyle.filter((x) => x.extraction_kind === "excerpt"));
  assert.ok(lost > 0, "documents the old behaviour: an edited item without exact_excerpt is dropped by the server");
  console.log("attestation: sent", payload.length, "survived", payload.length, "| edited survived 3/3 | old-style edited dropped", lost);
}
// plain-text pages (no coordinates) still work
assert.ok(buildProposals([{ page: 1, text: "Μία γραμμή κειμένου αρκετά μεγάλη για να γίνει απόσπασμα του πρώτου κεφαλαίου.\nΔεύτερη γραμμή της ίδιας παραγράφου, με συνέχεια στο ίδιο θέμα εδώ." }]).items.length >= 1);
console.log("PASS learning-review proposals");
