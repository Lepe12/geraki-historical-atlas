/* Greek voice/text commands -> intents. Pure functions (tested in assistant-intents.test.mjs). */
export const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/ς/g, "σ").replace(/[«»"'.,;:!?·;]/g, " ").replace(/\s+/g, " ").trim();

const WAKE = /(?:^|\s)(?:ναμπου|να μπου|ναμπουξ|nabou|nambou)(?:\s|$)/;
/* returns null when the wake word is absent, otherwise the text after it ("" if only the wake word) */
export function afterWake(text) {
  const t = norm(text), m = WAKE.exec(t);
  return m ? t.slice(m.index + m[0].length).trim() : null;
}
const ART = /^(?:μου\s+)?(?:τον|την|τη|το|τα|τους|τισ|τ|στον|στην|στη|στο|στα)\s+/;

export function parse(text) {
  const t = norm(text);
  if (!t) return { type: "none" };
  let m;
  if ((m = /^(?:ψαξε|ψαξτε|αναζητησε|βρεσ)\s+(?:για\s+)?(.+)$/.exec(t))) return { type: "search", query: original(text, m[1]) };
  if (/^(?:ανοιξε|εμφανισου|εμφανισε|ελα|ξυπνα)/.test(t)) return { type: "open" };
  if (/^κλεισε/.test(t)) return { type: "close" };
  if (/(?:γυρνα|γυρισε|κοιτα|στριψε)/.test(t)) {
    if (/δεξια/.test(t)) return { type: "turn", dir: 1 };
    if (/αριστερα/.test(t)) return { type: "turn", dir: -1 };
    if (/(?:μπροστα|ευθεια|εμενα)/.test(t)) return { type: "turn", dir: 0 };
    if (/(?:πανω)/.test(t)) return { type: "look", pitch: -0.25 };
    if (/(?:κατω)/.test(t)) return { type: "look", pitch: 0.25 };
  }
  if (/(?:γνεψε|κουνα το κεφαλι|συμφωνεισ)/.test(t)) return { type: "nod" };
  if (/(?:τρισδιαστατ|τρισ διαστατ|3d|3 d|τρια d)/.test(t)) return { type: "map3d", on: true };
  if (/(?:δισδιαστατ|δισ διαστατ|δυσδιαστατ|2d|2 d|επιπεδ)/.test(t)) return { type: "map3d", on: false };
  if (/λαντζ/.test(t) && /(?:δειξε|δειξτε|πηγαινε|εστιασε)/.test(t)) return { type: "lantzas" };
  if ((m = /^(?:δειξε|δειξτε|πηγαινε|εστιασε)\s+(?:μου\s+)?(.+)$/.exec(t))) return { type: "place", place: m[1].replace(ART, "").trim() };
  if (/^(?:γεια|καλημερα|καλησπερα|χαιρε)/.test(t)) return { type: "hello" };
  if (/(?:ποια εισαι|τι εισαι|ποιοσ εισαι)/.test(t)) return { type: "who" };
  if (/(?:τι μπορεισ|βοηθεια|εντολεσ)/.test(t)) return { type: "help" };
  if (/(?:ευχαριστω|σ ευχαριστω)/.test(t)) return { type: "thanks" };
  return { type: "unknown", text: String(text).trim() };
}
/* keep the user's spelling (accents, capitals) for the search text */
function original(text, normTail) {
  const words = String(text).trim().split(/\s+/), n = normTail.split(" ").length;
  return words.slice(-n).join(" ").replace(/[.;!?·]+$/, "");
}

/* place matching: exact word or a shared stem (Greek case endings: Χάνδακας / Χάνδακα, Κέρκυρα / Κέρκυρας) */
const stem = (w) => (w.length > 4 ? w.slice(0, Math.max(4, w.length - 2)) : w);
export function matchPlace(query, places) {
  const q = norm(query).replace(ART, "");
  if (!q) return null;
  const qs = q.split(" ").map(stem);
  let best = null, bestScore = 0;
  for (const p of places) {
    for (const name of p.names) {
      const n = norm(name); if (!n) continue;
      let score = 0;
      if (n === q) score = 3;
      else { const ns = n.split(" ").map(stem); if (qs.every((w) => ns.some((x) => x.startsWith(w) || w.startsWith(x)))) score = 2; }
      if (score > bestScore) { best = p; bestScore = score; }
    }
  }
  return best;
}
