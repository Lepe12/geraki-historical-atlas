/* NABOU library-first core (browser + Node, no dependencies).
 *
 * One library: published sources + books the owner adds (PDF). When the owner
 * asks a question, the library is searched first. Only when it is not enough,
 * or when the owner clearly asks to search further, does the long GitHub
 * research run (usually 20–90 minutes) start.
 *
 * Pure functions only: no network, no storage. The pct-live reader
 * (server/command-center-live/library-reader.js) and the chamber
 * (jarvis-intelligence-chamber/library-first.js) share this file.
 *
 * Name focus mirrors tools/research_focus.py (#350): search the person or place
 * asked about, never the whole instruction sentence. Spellings produced here are
 * search hypotheses, never attested aliases.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NABOU_LIBRARY_CORE = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const fold = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .replace(/ς/g, "σ");

  // Instruction, role and topic words never become the searched name.
  const STOP = new Set(
    fold(
      "βρες βρεσ ψαξε ψάξε πες δωσε δώσε θελω θέλω μαθε στοιχεια στοιχεία πληροφοριες πληροφορίες πηγες πηγές τεκμηρια " +
        "ιστορια ιστορία ιστορικη ιστορική ερευνα έρευνα ερευνησε βιογραφια βιογραφία για τον την το του της των τους τις στο στη στην στον στα " +
        "και ή να σε με απο από ως που ότι οτι μου μας ενα ένα μια μία ο η οι τα αιωνα αιώνα αιωνασ αιώνας αιωνεσ αιώνες ποιος ποια ποιο τι πως πώς " +
        "πειρατικεσ πειρατικές πειρατικη πειρατική επιδρομεσ επιδρομές επιδρομη επιδρομή επιθεσεισ επιθέσεις κουρσαροσ κουρσάρος κουρσαρο κουρσάρο κουρσατο " +
        "πειρατησ πειρατής πειρατη πειρατή καπετανιοσ καπετάνιος καπεταν ναυαρχοσ ναύαρχος ρεισ ρεΐς κουρσα νησι νησί λιμανι λιμάνι πολη πόλη " +
        "find about the of on in and history information sources pirate pirates corsair corsairs captain admiral raid raids island port search " +
        "δηλαδη δηλαδή ξεχωρισε ξεχώρισε υποθεσεισ υποθέσεις περιοδοσ περίοδος περιοδο"
    ).split(/\s+/).filter(Boolean),
  );
  const ROLE_PREFIX = ["κουρσα", "κορσα", "κουρσε", "πειρατ", "καπετα", "ναυαρχ", "corsa", "pirat", "privateer", "captain", "admiral"];
  const isRole = (f) => ROLE_PREFIX.some((p) => f.startsWith(p));

  const GREEK_LATIN = {
    α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m",
    ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
  };
  const latin = (word) =>
    fold(word)
      .replace(/ου/g, "ou")
      .replace(/ντ/g, "nt")
      .replace(/μπ/g, "mp")
      .split("")
      .map((c) => GREEK_LATIN[c] || c)
      .join("");

  const MIN_STEM = 4;
  const SUFFIXES = ["ουσ", "εια", "εσ", "ων", "ου", "οσ", "ησ", "ασ", "α", "η", "ο", "ι", "ε", "os", "es", "s", "o", "a"];
  function stem(word) {
    const f = fold(word);
    for (const s of SUFFIXES) if (f.length - s.length >= MIN_STEM && f.endsWith(s)) return f.slice(0, -s.length);
    return f;
  }

  /** Years asked about: «1500–1700», «16ος–17ος αιώνας», «16ος αιώνας». */
  function yearRange(query) {
    const q = String(query || "");
    const years = [...q.matchAll(/(?<!\d)(1[0-9]{3})(?!\d)/g)].map((m) => Number(m[1]));
    if (years.length >= 2) return { from: Math.min(...years), to: Math.max(...years) };
    if (years.length === 1) return { from: years[0], to: years[0] };
    const centuries = [...fold(q).matchAll(/(?<!\d)(1[0-9])(?:οσ|ο|ου|th)?(?=\s*(?:[–-]|και|εωσ|$|\s*αιων|\s*c))/g)].map((m) => Number(m[1]));
    if (centuries.length && /αιων|century|c\./.test(fold(q)))
      return { from: (Math.min(...centuries) - 1) * 100, to: Math.max(...centuries) * 100 - 1 };
    return null;
  }

  /**
   * The person or place asked about. Capitalised words that are not
   * instruction/role/topic words; falls back to long content words.
   */
  function focusNames(query) {
    const text = String(query || "").replace(/[^\p{L}\p{N}\s,.;:–—\-/()«»"']/gu, "");
    const tokens = [...text.matchAll(/[\p{L}]+/gu)].map((m) => m[0]);
    const content = tokens.filter((t) => !STOP.has(fold(t)) && !isRole(fold(t)) && fold(t).length >= 3);
    const caps = content.filter((t) => t[0] === t[0].toUpperCase() && t[0] !== t[0].toLowerCase());
    // Keep adjacent capitalised words together as one name («Πέτρο Λάντζα»).
    // Lowercase name particles stay inside a name («Martín de Acuña»).
    const PARTICLES = new Set(["de", "del", "da", "di", "dei", "la", "van", "von", "el", "al", "ibn", "bin"]);
    const names = [];
    let current = [];
    tokens.forEach((t, i) => {
      if (caps.includes(t)) current.push(t);
      else if (current.length && PARTICLES.has(t) && caps.includes(tokens[i + 1])) current.push(t);
      else if (current.length) { names.push(current.join(" ")); current = []; }
    });
    if (current.length) names.push(current.join(" "));
    const picked = names.length ? names : content.slice(0, 3);
    return [...new Set(picked)].slice(0, 4);
  }

  /** Word stems to look for in a passage (accent/case-folded). */
  function searchStems(names) {
    const stems = new Set();
    for (const name of names) {
      const words = [...String(name).matchAll(/[\p{L}]+/gu)].map((m) => m[0]);
      if (!words.length) continue;
      // A person is matched on the surname (last word), which every spelling keeps.
      const key = words[words.length - 1];
      const s = stem(key);
      if (s.length >= 3) stems.add(s);
      if (/[α-ω]/.test(fold(key))) {
        let l = latin(s);
        stems.add(l);
        if (l.includes("nts") || l.includes("ntz")) stems.add(l.replace(/nt[sz]/, "nz"));
        if (l.startsWith("k")) stems.add("c" + l.slice(1));
        if (l.endsWith("ie")) { stems.add(l.slice(0, -1)); stems.add("c" + l.slice(1, -1)); }
      }
    }
    return [...stems].filter((s) => s.length >= 3);
  }

  function focus(query) {
    const names = focusNames(query);
    return { names, stems: searchStems(names), years: yearRange(query) };
  }

  /** Owner clearly asks to go beyond the library. */
  function wantsDeepSearch(query) {
    const f = fold(query);
    return /ψαξε (?:και )?(?:στο |στα |σε )?(?:διαδικτυο|ιντερνετ|internet|παντου|αλλου|παραπερα|περισσοτερ|αρχεια|σε βαθοσ)|σε βαθοσ|μεγαλη ερευνα|πληρη ερευνα|ολα τα αρχεια|search (?:further|the web|online|everywhere)|deep search/.test(f);
  }

  /** Character spans of the focus stems in a passage (word-start matches). */
  function matchSpans(stems, text) {
    const f = fold(text);
    const spans = [];
    for (const s of stems) {
      const re = new RegExp("(?<![\\p{L}])" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gu");
      for (const m of f.matchAll(re)) spans.push([m.index, m.index + s.length]);
    }
    return spans.sort((a, b) => a[0] - b[0]);
  }

  // Archive shelf marks and page numbers are not years («legajo 1074», «σ. 1081»).
  const NOT_A_YEAR = /(?:legajo|leg\.|doc\.|estado|busta|filza|f\.|fol\.|ff\.|pp?\.|σσ?\.|αρ\.|no\.|n\.|nº|vol\.|τ\.)\s*[\d\s,–-]*$/i;
  function yearNear(text, at, range) {
    let best = null;
    const lo = range ? range.from - 50 : 1300, hi = range ? range.to + 50 : 1850;
    for (const m of String(text).matchAll(/(?<!\d)(1[0-9]{3})(?!\d)/g)) {
      const y = Number(m[1]);
      if (y < lo || y > hi) continue;
      if (NOT_A_YEAR.test(String(text).slice(Math.max(0, m.index - 24), m.index))) continue;
      const d = Math.abs(m.index - at);
      if (!best || d < best.d) best = { y, d };
    }
    return best && best.d <= 400 ? best.y : null;
  }

  /** A readable window around the first match: sentence boundaries, ≤ max chars. */
  function snippet(text, at, max = 320) {
    const t = String(text).replace(/\s+/g, " ");
    // Offsets are computed on folded text, which keeps one char per char for Greek/Latin.
    let start = Math.max(0, at - Math.floor(max / 2));
    let end = Math.min(t.length, start + max);
    const before = t.lastIndexOf(". ", at);
    if (before >= 0 && at - before < max * 0.7) start = before + 2;
    const after = t.indexOf(". ", at);
    if (after >= 0 && after - start < max) end = after + 1;
    let s = t.slice(start, end).trim();
    if (start > 0) s = "… " + s;
    if (end < t.length) s = s + " …";
    return s;
  }

  /**
   * hits: [{book:{id,title,short,kind}, page, text}] (raw passages from the
   * stores). Returns the passages that really mention the focus.
   */
  function focusedPassages(hits, f) {
    const out = [];
    const seen = new Set();
    for (const hit of hits || []) {
      const text = String(hit.text || hit.excerpt || "").replace(/\s+/g, " ");
      const spans = matchSpans(f.stems, text);
      if (!spans.length) continue;
      const at = spans[0][0];
      const excerpt = snippet(text, at);
      // OCR noise («/ > fi € LÀ Δ è») is not a readable fact.
      const letters = (excerpt.match(/\p{L}/gu) || []).length / Math.max(1, excerpt.replace(/\s/g, "").length);
      if (letters < 0.75 || excerpt.replace(/[…\s]/g, "").length < 60) continue;
      const key = fold(excerpt).slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ book: hit.book || {}, page: hit.page ?? null, excerpt, year: yearNear(text, at, f.years), mentions: spans.length });
    }
    return out;
  }

  /**
   * Is the library enough for a short documented story?
   * Enough = at least 3 passages that name the focus, or 2 from 2 different books.
   */
  function judge(passages) {
    const books = new Set(passages.map((p) => p.book.id || p.book.title));
    const enough = passages.length >= 3 || (passages.length >= 2 && books.size >= 2);
    return { enough, passages: passages.length, books: books.size };
  }

  const sourceLine = (p) => {
    const b = p.book || {};
    const name = b.short || b.title || "Βιβλίο της βιβλιοθήκης";
    return name + (p.page != null && p.page !== "" ? ", σ. " + p.page : "");
  };

  /**
   * A short chronological story: one fact per passage, its source under it.
   * The excerpts stay in the language of the book; nothing is invented.
   */
  function buildStory(query, passages, max = 8) {
    const f = focus(query);
    const label = f.names.join(", ") || String(query || "").trim();
    const inRange = (y) => !f.years || y == null || (y >= f.years.from - 25 && y <= f.years.to + 25);
    // Pick the most relevant passages (dated, more mentions, one per page), then tell them in time order.
    const seenPage = new Set();
    const sorted = passages
      .filter((p) => inRange(p.year))
      .sort((a, b) => (b.year != null) - (a.year != null) || b.mentions - a.mentions)
      .filter((p) => { const k = (p.book.id || p.book.title) + "|" + p.page; if (seenPage.has(k)) return false; seenPage.add(k); return true; })
      .slice(0, max)
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    const dated = sorted.filter((p) => p.year != null).map((p) => p.year);
    const books = new Set(sorted.map((p) => p.book.id || p.book.title));
    const span = dated.length ? (dated[0] === dated[dated.length - 1] ? " (γύρω στο " + dated[0] + ")" : " (από το " + dated[0] + " έως το " + dated[dated.length - 1] + ")") : "";
    const lead =
      "Τι λένε τα βιβλία της βιβλιοθήκης για «" + label + "»" + span + ". " +
      (books.size === 1 ? "Από ένα βιβλίο." : "Από " + books.size + " βιβλία.") +
      " Κάθε απόσπασμα μένει στη γλώσσα του βιβλίου, με την πηγή από κάτω.";
    return {
      title: label,
      lead,
      facts: sorted.map((p) => ({
        when: p.year != null ? String(p.year) : "Χωρίς χρονολογία",
        text: p.excerpt,
        source: sourceLine(p),
        book_kind: p.book.kind || "",
      })),
    };
  }

  /**
   * The whole decision, given the search reply (or its failure).
   *  - path "library": show the story; the long run does not start.
   *  - path "long":    start the long run now (library not enough, or asked).
   *  - path "ask":     the library could not be consulted; ask before the long run.
   */
  function decide(query, reply) {
    const f = focus(query);
    if (wantsDeepSearch(query)) return { path: "long", reason: "OWNER_ASKED_TO_SEARCH_FURTHER", focus: f };
    if (!reply || reply.ok === false) {
      return { path: "ask", reason: reply && reply.status === 401 ? "LIBRARY_SIGN_IN_REQUIRED" : "LIBRARY_UNAVAILABLE", focus: f };
    }
    const passages = focusedPassages(reply.hits || [], f);
    const verdict = judge(passages);
    if (verdict.enough) return { path: "library", reason: "LIBRARY_ENOUGH", focus: f, verdict, story: buildStory(query, passages) };
    return { path: "long", reason: "LIBRARY_NOT_ENOUGH", focus: f, verdict, partial: passages.length ? buildStory(query, passages) : null };
  }

  return { fold, stem, latin, yearRange, focusNames, searchStems, focus, wantsDeepSearch, matchSpans, snippet, focusedPassages, judge, buildStory, decide };
});
