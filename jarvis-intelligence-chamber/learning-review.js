"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const panel = $("learningPanel"),
    toggle = $("learningToggle"),
    close = $("closeLearning"),
    input = $("learningFile"),
    analyze = $("learningAnalyze"),
    status = $("learningState"),
    source = $("learningSource"),
    list = $("learningItems"),
    summary = $("learningSummary"),
    save = $("learningSave");
  if (!panel || !toggle || !close || !input || !analyze || !status || !source || !list || !summary || !save)
    return;

  const L = window.NABOU_LEARNING;
  if (!L) return;
  const T = {
    readingLocal: "Ανάγνωση του PDF στον υπολογιστή σας",
    reading: (n, N) => "Ανάγνωση σελίδας " + n + " / " + N,
    building: "Προετοιμασία προτάσεων για έλεγχο",
    noText: "Χωρίς επίπεδο κειμένου — απαιτείται OCR",
    pdfRequired: "Απαιτείται αρχείο PDF",
    uploading: "Αποστολή της εγκεκριμένης πηγής",
    saving: "Αποθήκευση εγκεκριμένων στοιχείων",
    backendDown: "Η υπηρεσία αποθήκευσης δεν είναι διαθέσιμη",
    textFound: "Βρέθηκε κείμενο — η εξαγωγή χρειάζεται έλεγχο",
    ready: "Έτοιμο",
  };
  const endpoint = "https://pct-live.piratecartography.com/pct-api/live";
  let saving = false;
  let current = { source_id: "", file: null, pages: [], items: [] };

  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m],
    );
  const setState = (s, mode = "") => {
    status.textContent = window.NABOU_GR ? window.NABOU_GR.ui(s) : s;
    panel.dataset.state = mode;
  };

  function open() {
    const results = $("resultsDrawer");
    if (results) results.classList.add("hidden");
    panel.classList.remove("hidden");
  }
  let reviewPage = 0;
  const batchSize = 50;
  const reader = document.createElement("section");
  reader.className = "learning-source";
  reader.innerHTML =
    '<label>Σελίδα PDF <input type="number" min="1" value="1" aria-label="Αριθμός σελίδας PDF" style="width:80px"></label><small class="coverage"></small><pre style="white-space:pre-wrap;max-height:240px;overflow:auto;user-select:text"></pre>';
  list.before(reader);
  /* Έγκριση όλου του PDF + αναίρεση: ένα βήμα για όλα τα στοιχεία όλων των σελίδων, χωρίς αποθήκευση. */
  const bulk = document.createElement("section");
  bulk.className = "learning-bulk";
  bulk.hidden = true;
  bulk.innerHTML =
    '<div class="learning-bulk-row"><button type="button" class="learning-approve-all" data-bulk="approve"></button><button type="button" class="learning-undo" data-bulk="undo" hidden>Αναίρεση</button></div><small class="learning-bulk-note" role="status" aria-live="polite"></small>';
  list.before(bulk);
  const approveBtn = bulk.querySelector('[data-bulk="approve"]'),
    undoBtn = bulk.querySelector('[data-bulk="undo"]'),
    bulkNote = bulk.querySelector(".learning-bulk-note");
  let undoSnapshot = null;
  const pageInput = reader.querySelector("input"),
    pageText = reader.querySelector("pre"),
    coverage = reader.querySelector(".coverage");
  function showPage() {
    const n = Math.max(1, Math.min(current.pages.length, Number(pageInput.value) || 1));
    pageInput.value = n;
    pageInput.max = current.pages.length || 1;
    pageText.textContent =
      current.pages[n - 1]?.text ||
      "Δεν βρέθηκε κείμενο σε αυτή τη σελίδα. Οι σαρωμένες σελίδες απαιτούν OCR.";
  }
  pageInput.addEventListener("change", showPage);
  const pager = document.createElement("div");
  pager.className = "learning-actions";
  const previous = document.createElement("button"),
    next = document.createElement("button"),
    position = document.createElement("span");
  previous.type = next.type = "button";
  previous.textContent = "Προηγούμενες 50";
  next.textContent = "Επόμενες 50";
  pager.append(previous, position, next);
  list.after(pager);
  previous.addEventListener("click", () => {
    reviewPage = Math.max(0, reviewPage - 1);
    render();
  });
  next.addEventListener("click", () => {
    reviewPage++;
    render();
  });
  function render() {
    reader.hidden = !current.pages.length;
    const readable = current.pages.filter((p) => p.text.trim().length >= 40).length;
    coverage.textContent = current.pages.length
      ? `${current.pages.length} / ${current.pages.length} σελίδες διαβάστηκαν · ${readable} με κείμενο · ${current.pages.length - readable} κενές ή χρειάζονται OCR. Η αρίθμηση είναι των σελίδων του PDF· η έντυπη σελιδαρίθμηση δεν έχει επαληθευτεί.`
      : "";
    showPage();
    reviewPage = Math.min(reviewPage, Math.max(0, Math.ceil(current.items.length / batchSize) - 1));
    const offset = reviewPage * batchSize;
    pager.hidden = !current.items.length;
    previous.disabled = reviewPage === 0;
    next.disabled = offset + batchSize >= current.items.length;
    position.textContent = ` ${offset + 1}–${Math.min(offset + batchSize, current.items.length)} / ${current.items.length} `;
    const accepted = current.items.filter((x) => x.status === "accepted").length;
    const rejected = current.items.filter((x) => x.status === "rejected").length;
    const pending = current.items.length - accepted - rejected;
    const savedCount = current.items.filter((x) => x.saved).length;
    const openCount = current.items.filter((x) => !x.saved && x.status !== "accepted").length;
    bulk.hidden = !current.items.length;
    approveBtn.textContent = "Έγκριση όλου του PDF (" + openCount + ")";
    approveBtn.disabled = saving || openCount === 0;
    undoBtn.hidden = !undoSnapshot;
    undoBtn.disabled = saving;
    summary.textContent = current.items.length
      ? current.items.length + " στοιχεία · " + accepted + " εγκεκριμένα · " + rejected + " απορριφθέντα · " + pending + " προς έλεγχο" + (savedCount ? " · " + savedCount + " αποθηκευμένα" : "")
      : "Δεν υπάρχουν ακόμη στοιχεία προς έλεγχο.";
    list.innerHTML = current.items.length
      ? current.items
          .slice(offset, offset + batchSize)
          .map(
            (x, j) =>
              '<article class="learning-item" data-i="' +
              (offset + j) +
              '" data-status="' +
              esc(x.status) +
              '"><div class="learning-item-head"><span>' +
              esc(
                x.saved
                  ? "ΑΠΟΘΗΚΕΥΜΕΝΟ"
                  : x.extraction_kind === "excerpt"
                    ? "ΑΠΟΣΠΑΣΜΑ — ΑΝΕΠΙΒΕΒΑΙΩΤΟ"
                    : ({ claim: "ΙΣΧΥΡΙΣΜΟΣ", person: "ΠΡΟΣΩΠΟ", place: "ΤΟΠΟΣ", date: "ΧΡΟΝΟΛΟΓΙΑ", year: "ΧΡΟΝΟΛΟΓΙΑ", event: "ΓΕΓΟΝΟΣ", ship: "ΠΛΟΙΟ", source: "ΠΗΓΗ", entity: "ΟΝΟΜΑ", hidden: "ΚΡΥΦΟ" }[x.type] || x.type.toUpperCase()),
              ) +
              "</span><small>" +
              (x.pages && x.pages.length > 1
                ? "ΣΕΛΙΔΕΣ " + esc(x.pages.slice(0, 8).join(", ") + (x.pages.length > 8 ? " … (" + x.pages.length + " σελίδες)" : ""))
                : "ΣΕΛΙΔΑ " + esc(x.page || "—")) +
              " · " +
              (x.confidence == null ? "ΧΩΡΙΣ ΕΚΤΙΜΗΣΗ ΒΕΒΑΙΟΤΗΤΑΣ" : Math.round(x.confidence * 100) + "%") +
              '</small></div><div class="learning-item-text" contenteditable="' +
              (x.editing ? "true" : "false") +
              '">' +
              esc(x.text) +
              '</div><div class="learning-actions"><button data-act="accept">ΕΓΚΡΙΣΗ</button><button data-act="reject">ΑΠΟΡΡΙΨΗ</button><button data-act="edit">' +
              (x.editing ? "ΤΕΛΟΣ ΕΠΕΞΕΡΓΑΣΙΑΣ" : "ΕΠΕΞΕΡΓΑΣΙΑ") +
              "</button></div></article>",
          )
          .join("")
      : '<div class="learning-empty">Επιλέξτε PDF και πατήστε Ανάλυση. Εδώ θα εμφανιστούν τα στοιχεία για έλεγχο.</div>';
    save.disabled = saving || !current.items.some((x) => x.status === "accepted" && !x.saved);
  }

  async function uploadPdf(file) {
    const r = await fetch(endpoint + "/knowledge/upload", {
      method: "POST",
      headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent(file.name) },
      body: file,
    });
    let data = {};
    try {
      data = await r.json();
    } catch (_) {}
    if (!r.ok) {
      const e = new Error(data.error || "upload_http_" + r.status);
      e.status = r.status;
      throw e;
    }
    return data;
  }

  async function loadPdfJs() {
    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    return pdfjs;
  }

  async function extractPages(file) {
    const pdfjs = await loadPdfJs(),
      bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data: bytes }).promise,
      pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n),
        tc = await page.getTextContent();
      const lines = L.linesFromItems(tc.items),
        text = lines.map((l) => l.text).join("\n");
      pages.push({ page: n, text, lines });
      page.cleanup();
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (n % 5 === 0 || n === pdf.numPages) setState(T.reading(n, pdf.numPages), "working");
    }
    await pdf.destroy();
    return pages;
  }

  toggle.addEventListener("click", () => {
    open();
  });
  close.addEventListener("click", () => panel.classList.add("hidden"));

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    open();
    undoSnapshot = null;
    bulkNote.textContent = "";
    current = { source_id: "", file: file || null, pages: [], items: [] };
    render();
    analyze.disabled = !file;
    if (!file) {
      source.textContent = "Δεν έχει επιλεγεί αρχείο.";
      setState(T.ready);
      return;
    }
    source.textContent = file.name + " · " + (file.size / 1048576).toFixed(1) + " MB";
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setState(T.pdfRequired, "error");
      analyze.disabled = true;
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setState("Το PDF υπερβαίνει τα 25 MB", "error");
      analyze.disabled = true;
      return;
    }
    setState("Το PDF είναι έτοιμο — πατήστε Ανάλυση", "ready");
  });

  analyze.addEventListener("click", async () => {
    const file = current.file;
    if (!file) return;
    analyze.disabled = true;
    input.disabled = true;
    save.disabled = true;
    current.items = [];
    undoSnapshot = null;
    bulkNote.textContent = "";
    reviewPage = 0;
    render();
    try {
      setState(T.readingLocal, "working");
      current.pages = await extractPages(file);
      const textChars = current.pages.reduce((n, p) => n + String(p.text || "").trim().length, 0);
      if (textChars < 40) {
        current.items = [];
        setState(T.noText, "error");
        summary.textContent =
          "Το PDF φαίνεται σαρωμένο ή μόνο εικόνα. Απαιτείται OCR πριν από την εξαγωγή στοιχείων.";
        list.innerHTML =
          '<div class="learning-empty">Δεν βρέθηκε αναγνώσιμο κείμενο στο PDF. Απαιτείται OCR πριν εξαχθούν προτάσεις.</div>';
        return;
      }
      setState(T.building, "working");
      const built = L.buildProposals(current.pages);
      current.items = built.items;
      undoSnapshot = null;
      bulkNote.textContent = "";
      setState(
        current.items.length
          ? "Ελέγξτε τα στοιχεία πριν την αποθήκευση"
          : T.textFound,
        current.items.length ? "ready" : "error",
      );
      render();
      summary.textContent +=
        " · Αυτόματες προτάσεις και αποσπάσματα· απαιτείται έλεγχος OCR και ιστορική επαλήθευση.";
    } catch (e) {
      setState("Αποτυχία ανάγνωσης — δοκιμάστε ξανά ή επιλέξτε άλλο PDF", "error");
    } finally {
      analyze.disabled = false;
      input.disabled = false;
    }
  });

  list.addEventListener("input", (e) => {
    const card = e.target.closest(".learning-item");
    if (card && e.target.matches(".learning-item-text")) {
      const item = current.items[Number(card.dataset.i)];
      if (item) item.text = e.target.textContent.trim();
    }
  });
  bulk.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-bulk]");
    if (!b || saving) return;
    const todo = current.items.filter((x) => !x.saved);
    if (b.dataset.bulk === "approve") {
      list.querySelectorAll(".learning-item").forEach((card) => {
        const it = current.items[Number(card.dataset.i)];
        if (it?.editing) it.text = card.querySelector(".learning-item-text")?.textContent?.trim() || it.text;
      });
      undoSnapshot = new Map(todo.map((x) => [x.id, { status: x.status, editing: x.editing }]));
      const changed = todo.filter((x) => x.status !== "accepted");
      todo.forEach((x) => { x.status = "accepted"; x.editing = false; });
      const places = new Set(changed.flatMap((x) => x.pages || [x.page])).size;
      bulkNote.textContent = "Εγκρίθηκαν " + changed.length + " στοιχεία σε " + places + " σελίδες. Δεν έχει αποθηκευτεί τίποτα ακόμη — πατήστε «Αποθήκευση εγκεκριμένων».";
    } else if (b.dataset.bulk === "undo" && undoSnapshot) {
      let n = 0;
      todo.forEach((x) => { const was = undoSnapshot.get(x.id); if (was && x.status !== was.status) n++; if (was) { x.status = was.status; x.editing = false; } });
      undoSnapshot = null;
      bulkNote.textContent = "Η έγκριση αναιρέθηκε (" + n + " στοιχεία επανήλθαν).";
    }
    render();
  });
  list.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]"),
      card = e.target.closest(".learning-item");
    if (!b || !card || saving) return;
    const i = Number(card.dataset.i),
      item = current.items[i];
    if (!item) return;
    if (item.saved) return;
    if (item.editing) {
      item.text = card.querySelector(".learning-item-text")?.textContent?.trim() || item.text;
    }
    if (b.dataset.act === "accept") {
      item.status = "accepted";
      item.editing = false;
    }
    if (b.dataset.act === "reject") {
      item.status = "rejected";
      item.editing = false;
    }
    if (b.dataset.act === "edit") {
      if (item.editing) {
        const t = card.querySelector(".learning-item-text");
        item.text = t?.textContent?.trim() || item.text;
        item.editing = false;
      } else item.editing = true;
    }
    render();
    if (item.editing) list.querySelector(`[data-i="${i}"] .learning-item-text`)?.focus();
  });

  save.addEventListener("click", async () => {
    if (saving) return;
    list.querySelectorAll(".learning-item").forEach((card) => {
      const item = current.items[Number(card.dataset.i)];
      if (item?.editing) {
        item.text = card.querySelector(".learning-item-text")?.textContent?.trim() || item.text;
        item.editing = false;
      }
    });
    const fresh = current.items.filter((x) => x.status === "accepted" && !x.saved);
    if (!fresh.length || !current.file) return;
    /* Ο διακομιστής αντικαθιστά την προηγούμενη έγκριση της ίδιας πηγής, γι' αυτό στέλνονται ΟΛΑ τα εγκεκριμένα, και τα ήδη αποθηκευμένα. */
    const payload = L.toPayload(current.items.filter((x) => x.status === "accepted"));
    if (payload.length > 5000) {
      setState("Πάρα πολλά εγκεκριμένα αποσπάσματα (" + payload.length + " > 5000) — απορρίψτε μερικά", "error");
      return;
    }
    const edited = current.items.filter((x) => x.status === "accepted" && (x.occurrences || []).some((o) => o.excerpt !== x.text)).length;
    saving = true;
    input.disabled = true;
    analyze.disabled = true;
    list.inert = true;
    save.disabled = true;
    setState(T.uploading, "working");
    try {
      if (!current.source_id) {
        const uploaded = await uploadPdf(current.file);
        current.source_id = uploaded.source_id;
      }
      setState(T.saving, "working");
      const r = await fetch(endpoint + "/knowledge/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_id: current.source_id, pages: current.pages.map((p) => ({ page: p.page, text: p.text })), items: payload }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(data.error || "save_http_" + r.status), { status: r.status });
      fresh.forEach((x) => (x.saved = true));
      undoSnapshot = null;
      const kept = Number(data.accepted_items) || 0, lost = payload.length - kept;
      if (lost > 0) {
        setState("Αποθηκεύτηκαν " + kept + " από " + payload.length + " αποσπάσματα — " + lost + " δεν βρέθηκαν αυτούσια στη σελίδα που διάβασε ο διακομιστής και δεν αποθηκεύτηκαν", "error");
      } else setState("Αποθηκεύτηκαν " + kept + " αποσπάσματα από " + fresh.length + " νέα στοιχεία", "learned");
      bulkNote.textContent = edited
        ? "Οι διορθώσεις σας αποθηκεύτηκαν ως κείμενο του στοιχείου· η αναζήτηση της έρευνας γίνεται στο αρχικό απόσπασμα του PDF."
        : "";
      source.textContent = (source.textContent || "Πηγή") + " · Αποθηκεύτηκε";
    } catch (e) {
      setState(
        e.message === "Failed to fetch"
          ? T.backendDown
          : e.status === 401 || e.status === 403
            ? "Δεν αποθηκεύτηκε: χρειάζεται σύνδεση χειριστή στον διακομιστή. Το PDF και οι επιλογές σου μένουν μόνο σε αυτή τη σελίδα."
            : "Αποτυχία αποθήκευσης — τα στοιχεία παραμένουν για νέα προσπάθεια",
        "error",
      );
    } finally {
      saving = false;
      input.disabled = false;
      analyze.disabled = false;
      list.inert = false;
      render();
    }
  });

  render();
})();
