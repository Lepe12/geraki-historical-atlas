"use strict";
/* Προτάσεις για τον έλεγχο PDF: λίγες, με νόημα, και με απόσπασμα που ο διακομιστής μπορεί να βρει αυτούσιο στη σελίδα.
   Χωρίς DOM· λειτουργεί και στο Node (δοκιμές). Είσοδος: σελίδες { page, lines: [{ text, y }] } (y = ύψος γραμμής στη σελίδα). */
(function (root) {
  const MIN_PASSAGE = 60, SOFT_TARGET = 600, MAX_PASSAGE = 1200;

  const norm = (t) => String(t).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ς/g, "σ");
  const clean = (t) => String(t || "").replace(/[ \t\u00a0]+/g, " ").trim();
  const STOP = new Set(
    ("την τον της του των το τα τις τους στη στην στο στον και εις από για με ο η οι εν ένας μια ένα αυτό αυτή αυτός σελίδες περιεχόμενα κεφάλαιο βιβλιογραφία " +
      "όταν όπως επίσης όμως ενώ αλλά έτσι μετά πριν κατά παρά δεν ώστε στις στους στα στων ότι εάν αν είναι ήταν υπό περί ανά " +
      "the this that from with there their they for and but not chapter page figure table introduction conclusion references bibliography when where which however also after before").split(" ").map(norm),
  );

  const isPageNumber = (s) =>
    /^[-–—.·\s]*(?:(?:σελίδα|σελ\.?|page|p\.)\s*)?(\d{1,4}|[ivxlc]{1,4})(?:\s*(?:\/|of|από)\s*\d{1,4})?[-–—.·\s]*$/i.test(s);
  const isLeader = (s) => /(?:\.\s?){4,}|…{2,}|·{4,}|(?:_\s?){6,}/.test(s);
  const headerKey = (s) => norm(s).replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

  function median(a) {
    if (!a.length) return 0;
    const b = a.slice().sort((x, y) => x - y);
    return b[Math.floor(b.length / 2)];
  }

  /* Επαναλαμβανόμενες κεφαλίδες/υποσέλιδα: ίδιο κείμενο (με τους αριθμούς αγνοημένους) στις πρώτες/τελευταίες 2 γραμμές πολλών σελίδων. */
  function runningKeys(pages) {
    const counts = new Map();
    for (const pg of pages) {
      const L = pg.lines.map((l) => clean(l.text)).filter(Boolean);
      const keys = new Set([...L.slice(0, 2), ...L.slice(-2)].map(headerKey).filter((k) => k.length >= 3));
      for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
    }
    const need = pages.length <= 2 ? 2 : Math.max(2, Math.ceil(pages.length * 0.4));
    const out = new Set();
    for (const [k, n] of counts) if (n >= need && pages.length >= 2) out.add(k);
    return out;
  }

  function buildProposals(pagesIn) {
    const pages = (pagesIn || []).map((p) => ({
      page: p.page,
      lines: (p.lines || String(p.text || "").split("\n").map((t) => ({ text: t }))).map((l) => ({ text: clean(l.text), y: l.y })),
    }));
    const running = runningKeys(pages);
    const stats = { pages: pages.length, dropped_running: 0, dropped_page_numbers: 0, dropped_toc: 0, dropped_short: 0 };
    const passages = [], keptLines = [];
    for (const pg of pages) {
      const gaps = [];
      for (let i = 1; i < pg.lines.length; i++) {
        const a = pg.lines[i - 1].y, b = pg.lines[i].y;
        if (a != null && b != null && a - b > 0) gaps.push(a - b);
      }
      const med = median(gaps);
      let cur = [], prevY = null, hard = true;
      const flush = () => {
        if (!cur.length) return;
        const text = cur.map((l) => l.text).join("\n");
        const letters = (text.match(/\p{L}/gu) || []).length;
        if (text.length >= MIN_PASSAGE && letters >= text.length * 0.5) passages.push({ page: pg.page, text });
        else stats.dropped_short++;
        cur = [];
      };
      for (const l of pg.lines) {
        if (!l.text) { flush(); hard = true; prevY = l.y ?? prevY; continue; }
        let drop = null;
        if (running.has(headerKey(l.text)) && l.text.length < 140) drop = "dropped_running";
        else if (isPageNumber(l.text)) drop = "dropped_page_numbers";
        else if (isLeader(l.text)) drop = "dropped_toc";
        if (drop) { stats[drop]++; flush(); hard = true; prevY = l.y ?? prevY; continue; }
        keptLines.push({ page: pg.page, text: l.text });
        const ratio = prevY != null && l.y != null && med > 0 ? (prevY - l.y) / med : 1;
        const chars = cur.reduce((n, x) => n + x.text.length + 1, 0);
        if (hard && cur.length) flush();
        else if (ratio > 2.0) flush();
        else if (ratio > 1.25 && chars >= SOFT_TARGET) flush();
        else if (chars + l.text.length + 1 > MAX_PASSAGE) flush();
        cur.push(l);
        prevY = l.y ?? prevY;
        hard = false;
      }
      flush();
    }
    const base = {
      extraction_method: "text_layer_heuristic", verification_status: "UNREVIEWED", confidence: null,
      status: "pending", editing: false, saved: false, printed_page: null,
    };
    const items = [];
    const mk = (kind, type, text, occurrences) => {
      const pagesList = [...new Set(occurrences.map((o) => o.page))].sort((a, b) => a - b);
      items.push({ ...base, id: "k-" + items.length, type, extraction_kind: kind, text, page: pagesList[0], pdf_page: pagesList[0], pages: pagesList, occurrences });
    };
    for (const p of passages) mk("excerpt", "claim", p.text, [{ page: p.page, excerpt: p.text }]);

    /* Ονόματα και χρονολογίες: ένα στοιχείο ανά διακριτή τιμή, με όλες τις σελίδες. Οι εμφανίσεις βγαίνουν από μία γραμμή (άρα αυτούσιο απόσπασμα). */
    const ents = new Map(), dates = new Map();
    const put = (map, key, text, page, excerpt) => {
      let e = map.get(key);
      if (!e) map.set(key, (e = { text, count: 0, byPage: new Map() }));
      e.count++;
      if (!e.byPage.has(page)) e.byPage.set(page, excerpt);
    };
    for (const l of keptLines) {
      for (const m of l.text.matchAll(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/g)) put(dates, m[1], m[1], l.page, m[1]);
      for (const m of l.text.matchAll(/[\p{Lu}][\p{Ll}’'-]{2,}(?:\s+[\p{Lu}][\p{Ll}’'-]{2,}){1,3}/gu)) {
        const v = m[0].trim();
        if (v.length > 90 || v.split(/\s+/).some((w) => STOP.has(norm(w)))) continue;
        put(ents, norm(v), v, l.page, v);
      }
    }
    const occs = (e) => [...e.byPage].map(([page, excerpt]) => ({ page, excerpt })).sort((a, b) => a.page - b.page);
    for (const e of [...ents.values()].filter((e) => e.count >= 2).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))) mk("entity", "entity", e.text, occs(e));
    for (const e of [...dates.values()].sort((a, b) => a.text.localeCompare(b.text))) mk("date", "date", e.text, occs(e));
    stats.passages = passages.length;
    return { items, stats };
  }

  /* Το σώμα του /knowledge/review: ένα στοιχείο ανά εμφάνιση σε σελίδα. Το exact_excerpt είναι πάντα το αυτούσιο απόσπασμα του PDF·
     αν ο χρήστης διόρθωσε το κείμενο, αποθηκεύεται το διορθωμένο στο text και η επαλήθευση γίνεται στο αρχικό απόσπασμα. */
  function toPayload(items) {
    const out = [];
    for (const it of items) {
      if (it.status !== "accepted") continue;
      for (const o of it.occurrences || [{ page: it.page, excerpt: it.text }]) {
        out.push({
          id: it.id + "@p" + o.page, type: it.type, extraction_kind: it.extraction_kind,
          text: String(it.text || "").trim() || o.excerpt, exact_excerpt: o.excerpt, page: o.page, pdf_page: o.page,
          printed_page: null, confidence: it.confidence, extraction_method: it.extraction_method,
          verification_status: it.verification_status, status: "accepted",
        });
      }
    }
    return out;
  }

  /* pdf.js getTextContent().items → γραμμές { text, y }. Τα κενά ανάμεσα σε τμήματα της ίδιας γραμμής διατηρούνται μόνο όπου υπάρχει πραγματικό διάστημα. */
  function linesFromItems(items) {
    const lines = [];
    let text = "", y = null, prevEnd = null;
    const end = () => { lines.push({ text: clean(text), y }); text = ""; y = null; prevEnd = null; };
    for (const it of items || []) {
      if (it.str == null) continue;
      const x = it.transform ? it.transform[4] : null;
      if (y == null && it.transform) y = it.transform[5];
      if (text && x != null && prevEnd != null && !/\s$/.test(text) && !/^\s/.test(it.str) && it.str && x - prevEnd > Math.max(1, (it.height || 10) * 0.15)) text += " ";
      text += it.str;
      prevEnd = x != null ? x + (it.width || 0) : null;
      if (it.hasEOL) end();
    }
    if (clean(text)) end();
    return lines.filter((l) => l.text);
  }

  const api = { buildProposals, toPayload, linesFromItems, MIN_PASSAGE, MAX_PASSAGE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NABOU_LEARNING = api;
})(typeof window !== "undefined" ? window : globalThis);
