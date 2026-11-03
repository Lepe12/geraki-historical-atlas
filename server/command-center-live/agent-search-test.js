// Unit tests for the /knowledge/agent-search matcher (no network, no auth, no server).
const assert = require("assert");
const {foldText, stemToken, compileQuery, scoreExcerpt, rankAttestations} = require("./historical-evidence");
const hits = (q, excerpts) => rankAttestations(q, excerpts.map(e => ({exact_excerpt: e}))).map(x => x.att.exact_excerpt);

assert.strictEqual(foldText("ΜΆΝΗΣ Όμηρος"), "μανησ ομηροσ");
assert.strictEqual(foldText("Μάνης"), foldText("ΜΑΝΗΣ"), "final sigma and accents fold");
// Πειρατεία vs πειρατές
assert.strictEqual(stemToken(foldText("Πειρατεία")), stemToken(foldText("πειρατές")));
assert.deepStrictEqual(hits("Πειρατεία", ["Οι πειρατές του Αιγαίου λεηλάτησαν τη Μήλο.", "Ο εμπορικός στόλος της Ύδρας."]),
  ["Οι πειρατές του Αιγαίου λεηλάτησαν τη Μήλο."]);
// ΜΑΝΗ vs Μάνη, and accent-less / lowercase queries
for (const q of ["ΜΑΝΗ", "Μάνη", "μανη"]) assert.strictEqual(hits(q, ["Στη Μάνη οι κάτοικοι ήταν πολεμιστές."]).length, 1, q);
assert.strictEqual(hits("πειρατες αιγαιου", ["Οι πειρατές του Αιγαίου επιτέθηκαν."]).length, 1);
// English stemming
assert.strictEqual(hits("pirate ship", ["Two pirate ships were seen off Milo."]).length, 1);
assert.strictEqual(hits("pirate", ["Pirates raided the coast.", "Pirating was common."]).length, 2);
assert.strictEqual(hits("Milo", ["The ship anchored at Milos in 1674."]).length, 1);
// No false positives on short stems (stems under 4 letters are never cut)
assert.strictEqual(stemToken(foldText("Μάνη")), "μανη");
assert.strictEqual(hits("Μάνη", ["Ο Μάνος και η μανία της θάλασσας."]).length, 0);
assert.strictEqual(hits("Μήλος", ["Έφαγε ένα μήλο και ένα αχλάδι."]).length, 0);
assert.strictEqual(hits("ship", ["The shipping company and the shipyard."]).length, 0);
assert.strictEqual(hits("Παρος", ["Η Πάρνηθα και η Πατρα."]).length, 0);
// Stop-words are not matched on their own: "the" must not make an unrelated excerpt a hit
assert.strictEqual(hits("the pirates", ["The merchants of the town."]).length, 0);
assert.strictEqual(hits("οι πειρατες", ["Οι έμποροι της πόλης."]).length, 0);
// Ranking: exact phrase first, then all tokens, then proximity
const ranked = hits("πειρατεία Αιγαίο", [
  "Το Αιγαίο και πολύ μακριά, μετά από πολλές σελίδες, η πειρατεία.",
  "Η πειρατεία στο Αιγαίο ήταν συχνή.",
  "Μόνο η πειρατεία αναφέρεται εδώ.",
  "Η πειρατεία και το Αιγαίο.",
]);
assert.deepStrictEqual(ranked, [
  "Η πειρατεία στο Αιγαίο ήταν συχνή.",
  "Η πειρατεία και το Αιγαίο.",
  "Το Αιγαίο και πολύ μακριά, μετά από πολλές σελίδες, η πειρατεία.",
]);
assert.ok(ranked.indexOf("Η πειρατεία στο Αιγαίο ήταν συχνή.") < ranked.indexOf("Το Αιγαίο και πολύ μακριά, μετά από πολλές σελίδες, η πειρατεία."), "tighter span first");
assert.ok(ranked.indexOf("Το Αιγαίο και πολύ μακριά, μετά από πολλές σελίδες, η πειρατεία.") < ranked.indexOf("Μόνο η πειρατεία αναφέρεται εδώ.") || ranked.indexOf("Μόνο η πειρατεία αναφέρεται εδώ.") === -1, "all tokens before partial");
const exactFirst = hits("Μάνη πειρατές", ["Πειρατές της Μάνη και τα νησιά.", "Στη Μάνη υπήρχαν πειρατές.", "Μάνη πειρατές: κατάλογος."]);
assert.strictEqual(exactFirst[0], "Μάνη πειρατές: κατάλογος.", "exact phrase ranks first");
assert.strictEqual(exactFirst.length, 3);
// Two-token query requires both; three-token queries tolerate one missing token but rank it lower
assert.strictEqual(hits("πειρατεία Αιγαίο", ["Μόνο η πειρατεία αναφέρεται εδώ."]).length, 0);
const three = hits("πειρατεία Αιγαίο Μήλος", ["πειρατεία Αιγαίο Μήλος", "πειρατεία Αιγαίο μόνο"]);
assert.deepStrictEqual(three, ["πειρατεία Αιγαίο Μήλος", "πειρατεία Αιγαίο μόνο"]);
// Stop-word-only query falls back to phrase matching (previous behaviour)
assert.strictEqual(hits("και το", ["Ο Γιώργος και το πλοίο."]).length, 1);
assert.strictEqual(hits("και το", ["Ο Γιώργος έφυγε."]).length, 0);
// Empty / missing excerpts never match
assert.strictEqual(hits("Milo", ["", null]).length, 0);
console.log("NABOU AGENT-SEARCH MATCHER PASS");
