/* NABOU · one library and library-first research (reader side).
 *
 * - Πηγές is the one place for books: published sources + books the owner adds as PDF.
 * - Adding a PDF puts the book in that library (pct-live /library/books); it is
 *   then searched by every question. No approve/reject step.
 * - A question searches the library first (pct-live /library/search, a few
 *   seconds). If that is enough, a short story with a source under each fact is
 *   shown and the long research run (usually 20–90 minutes) does not start.
 *   The long run starts only when the library is not enough or the owner asks.
 * - Δεδομένα and Ερευνητές are operator screens: hidden unless ?operator=1.
 *
 * Until pct-live is deployed with library-reader.js the library calls fail and
 * the UI says so; the long run is then offered with one button, never started
 * silently.
 */
"use strict";
(() => {
  const core = window.NABOU_LIBRARY_CORE;
  if (!core) return;
  const API = "https://pct-live.piratecartography.com/pct-api/live";
  const SEARCH_TIMEOUT_MS = 20000;
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k in node && typeof v !== "string") node[k] = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c != null) node.append(c);
    return node;
  };

  /* ---------- operator screens stay out of the reader's way ---------- */
  try {
    const flag = new URLSearchParams(location.search).get("operator");
    if (flag === "1") localStorage.setItem("nabou-operator", "1");
    if (flag === "0") localStorage.removeItem("nabou-operator");
    if (localStorage.getItem("nabou-operator") === "1") document.body.classList.add("nabou-operator");
  } catch (_) {}
  document
    .querySelectorAll('#n7Shell [data-atlas-nav="tools"], #n7Shell [data-atlas-nav="agents"]')
    .forEach((b) => b.classList.add("n7-operator-only"));

  /* ---------- server calls (cookie session; nothing secret in JS) ---------- */
  async function call(path, { method = "GET", body = null, headers = {}, timeout = SEARCH_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetch(API + path, { method, body, headers, credentials: "include", signal: controller.signal });
      let data = {};
      try { data = await r.json(); } catch (_) {}
      // HTTP status wins over a «status» field in the reply body (kept as «state»).
      return { ...data, state: data.status, ok: r.ok, status: r.status };
    } catch (error) {
      return { ok: false, status: 0, error: error?.name === "AbortError" ? "timeout" : "network" };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- Πηγές: the library ---------- */
  const library = el("section", { id: "readerLibrary", "aria-label": "Βιβλιοθήκη" });
  const libStatus = el("p", { class: "library-status", role: "status" });
  const pubList = el("ol", { class: "library-books", "aria-label": "Δημοσιευμένες πηγές" });
  const addedList = el("ol", { class: "library-books", "aria-label": "Βιβλία που πρόσθεσες" });
  const addedNote = el("p", { class: "library-note" });
  const fileInput = el("input", { type: "file", id: "libraryFile", accept: "application/pdf,.pdf" });
  const titleInput = el("input", { type: "text", id: "libraryTitle", maxlength: "300", placeholder: "π.χ. Οι φουρτούνες του καπετάν-Πέτρου Λάντζα" });
  const authorInput = el("input", { type: "text", id: "libraryAuthor", maxlength: "200", placeholder: "π.χ. Π. Κ. Ιωάννου" });
  const yearInput = el("input", { type: "text", id: "libraryYear", maxlength: "20", inputmode: "numeric", placeholder: "π.χ. 2000" });
  const addButton = el("button", { type: "submit", id: "libraryAdd", text: "Πρόσθεσε στη βιβλιοθήκη" });
  const addState = el("p", { class: "library-add-state", role: "status", "aria-live": "polite" });
  const keyInput = el("input", { type: "password", id: "libraryKey", autocomplete: "current-password", placeholder: "Κωδικός ιδιοκτήτη" });
  const signButton = el("button", { type: "submit", text: "Σύνδεση" });
  const signForm = el("form", { class: "library-sign", id: "librarySignIn" },
    el("label", { for: "libraryKey", text: "Για να προσθέσεις βιβλία και να ψάχνει η Έρευνα μέσα τους, συνδέσου μία φορά σε αυτόν τον υπολογιστή." }),
    el("div", { class: "library-row" }, keyInput, signButton));
  const addForm = el("form", { class: "library-add", id: "libraryAddForm" },
    el("h3", { text: "Πρόσθεσε βιβλίο (PDF)" }),
    el("p", { class: "library-note", text: "Το βιβλίο μπαίνει στη βιβλιοθήκη μαζί με τις υπόλοιπες πηγές. Από εκεί και πέρα κάθε ερώτημα ψάχνει και μέσα σε αυτό. Δεν χρειάζεται να εγκρίνεις αποσπάσματα." }),
    el("label", { for: "libraryFile", class: "library-drop" },
      el("span", { class: "library-drop-title", text: "Διάλεξε PDF από τον υπολογιστή" }),
      el("small", { text: "Έως 25 MB. Οι σαρωμένες σελίδες χωρίς κείμενο δεν διαβάζονται ακόμη." }),
      fileInput),
    el("div", { class: "library-fields" },
      el("label", { for: "libraryTitle", text: "Τίτλος" }), titleInput,
      el("label", { for: "libraryAuthor", text: "Συγγραφέας" }), authorInput,
      el("label", { for: "libraryYear", text: "Έτος" }), yearInput),
    el("div", { class: "library-row" }, addButton),
    addState);
  library.append(
    el("h2", { text: "Βιβλιοθήκη" }),
    el("p", { class: "library-intro", text: "Όλα τα βιβλία και οι πηγές που διαβάζει η Έρευνα, σε ένα μέρος. Όταν ρωτάς κάτι, ψάχνω πρώτα εδώ· μόνο αν δεν φτάνουν, ξεκινά η μεγάλη έρευνα στο διαδίκτυο." }),
    libStatus,
    el("h3", { text: "Δημοσιευμένες πηγές" }), pubList,
    el("h3", { text: "Βιβλία που πρόσθεσες" }), addedNote, addedList,
    signForm, addForm,
  );
  let signedIn = false, serverReady = false;

  function bookItem(b) {
    const li = el("li");
    li.append(el("span", { class: "library-book-title", text: b.title || b.short || "Βιβλίο" }));
    const meta = [b.author, b.where || (b.year ? String(b.year) : ""), b.pages ? b.pages + " σελίδες" : ""].filter(Boolean).join(" · ");
    if (meta) li.append(el("small", { text: meta }));
    return li;
  }
  function renderLibrary(published, added) {
    pubList.replaceChildren(...published.map(bookItem));
    addedList.replaceChildren(...(added || []).map(bookItem));
    addedList.hidden = !(added && added.length);
    addedNote.textContent = !serverReady
      ? "Θα φαίνονται εδώ μόλις συνδεθεί η βιβλιοθήκη στον διακομιστή."
      : !signedIn
        ? "Συνδέσου για να δεις και να προσθέσεις τα δικά σου βιβλία."
        : added && added.length
          ? ""
          : "Δεν έχεις προσθέσει ακόμη βιβλίο.";
    signForm.hidden = !serverReady || signedIn;
    addButton.disabled = !serverReady || !signedIn;
    fileInput.disabled = !serverReady || !signedIn;
  }
  let catalog = [];
  async function loadLibrary() {
    try {
      const r = await fetch("./data/published-library.json", { cache: "no-cache" });
      catalog = (await r.json()).books || [];
    } catch (_) { catalog = []; }
    const status = await call("/library/status", { timeout: 8000 });
    serverReady = status.ok && status.schema === "nabou-library-status-v1";
    signedIn = Boolean(serverReady && status.signed_in);
    let added = null;
    if (serverReady) {
      const books = await call("/library/books", { timeout: 8000 });
      if (books.ok) {
        const pages = new Map((books.published || []).map((b) => [b.id, b.pages]));
        catalog = catalog.map((b) => ({ ...b, pages: pages.get(b.id) || null }));
        added = books.added;
      }
    }
    libStatus.textContent = !serverReady
      ? "Η βιβλιοθήκη στον διακομιστή δεν έχει ανέβει ακόμη. Μέχρι τότε βλέπεις μόνο τους τίτλους των δημοσιευμένων πηγών, δεν μπορείς να προσθέσεις βιβλίο, και η Έρευνα δεν μπορεί να ψάξει μέσα τους."
      : signedIn
        ? "Συνδεδεμένος. Η Έρευνα ψάχνει πρώτα σε όλα αυτά τα βιβλία."
        : "Η βιβλιοθήκη είναι διαθέσιμη. Συνδέσου για να ψάχνει η Έρευνα μέσα στα βιβλία.";
    library.dataset.state = !serverReady ? "offline" : signedIn ? "ready" : "signed-out";
    renderLibrary(catalog, added);
  }
  signForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = keyInput.value.trim();
    keyInput.value = "";
    if (!key) return;
    libStatus.textContent = "Σύνδεση…";
    const r = await call("/session", { method: "POST", headers: { authorization: "Bearer " + key }, timeout: 15000 });
    libStatus.textContent = r.ok ? "Συνδέθηκες." : r.status === 401 ? "Λάθος κωδικός." : "Η σύνδεση δεν έγινε. Δοκίμασε ξανά σε λίγο.";
    if (r.ok) loadLibrary();
  });
  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f && !titleInput.value) titleInput.value = f.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ");
    addState.textContent = f ? "Επιλέχθηκε: " + f.name + " · " + Math.max(1, Math.round(f.size / 1024 / 1024)) + " MB" : "";
  });
  addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const f = fileInput.files?.[0];
    if (!f) { addState.textContent = "Διάλεξε πρώτα ένα PDF."; return; }
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { addState.textContent = "Χρειάζεται αρχείο PDF."; return; }
    if (f.size > 25 * 1024 * 1024) { addState.textContent = "Το αρχείο είναι πάνω από 25 MB."; return; }
    addButton.disabled = true;
    addState.textContent = "Προσθήκη στη βιβλιοθήκη και ανάγνωση των σελίδων… Για ένα άρθρο κρατάει λίγα δευτερόλεπτα, για βιβλίο λίγα λεπτά.";
    const r = await call("/library/books", { method: "POST", body: f, timeout: 10 * 60000, headers: {
      "content-type": "application/pdf", "x-file-name": encodeURIComponent(f.name),
      "x-book-title": encodeURIComponent(titleInput.value.trim()), "x-book-author": encodeURIComponent(authorInput.value.trim()),
      "x-book-year": encodeURIComponent(yearInput.value.trim()) } });
    addButton.disabled = false;
    if (r.ok && r.status === 201) {
      addState.textContent = "Μπήκε στη βιβλιοθήκη: «" + (r.book?.title || f.name) + "». Διαβάστηκαν " + (r.readable_pages ?? "?") + " από " + (r.pages ?? "?") + " σελίδες. Από τώρα η Έρευνα ψάχνει και εδώ.";
      addForm.reset();
      loadLibrary();
    } else if (r.ok) {
      addState.textContent = "Το βιβλίο υπάρχει ήδη στη βιβλιοθήκη.";
    } else {
      addState.textContent = r.status === 401 ? "Χρειάζεται σύνδεση." : r.status === 422 ? "Δεν μπόρεσα να διαβάσω αυτό το PDF." : r.status === 413 ? "Το αρχείο είναι πολύ μεγάλο." : "Δεν μπήκε στη βιβλιοθήκη. Δοκίμασε ξανά σε λίγο.";
    }
  });

  // The library sits right above the selected run's sources, on the same Πηγές sheet.
  const syncLibraryView = () => { library.hidden = document.body.dataset.readerView !== "sources"; };
  new MutationObserver(syncLibraryView).observe(document.body, { attributes: true, attributeFilter: ["data-reader-view"] });
  syncLibraryView();
  function mountLibrary() {
    const sources = $("readerSources");
    if (!sources) return false;
    if (!library.isConnected) sources.before(library);
    const runHeading = sources.querySelector(":scope > h2");
    if (runHeading) { runHeading.textContent = "Πηγές της επιλεγμένης έρευνας"; runHeading.classList.add("reader-run-sources"); }
    return true;
  }
  if (!mountLibrary()) {
    const wait = new MutationObserver(() => { if (mountLibrary()) wait.disconnect(); });
    wait.observe(document.body, { childList: true, subtree: true });
  }
  loadLibrary();

  /* ---------- Έρευνα: library first ---------- */
  const card = el("section", { id: "libraryAnswer", class: "library-answer", "aria-live": "polite", hidden: true });
  function mountCard() {
    const overview = $("researchOverview");
    if (!overview) return false;
    if (!card.isConnected) overview.before(card);
    return true;
  }
  if (!mountCard()) setTimeout(mountCard, 0);
  // The «search further» switch lives in the «Η έρευνά μου» header, next to the question it changes.
  const deep = document.querySelector(".research-deep");
  const head = document.querySelector("#atlasResearch .atlas-panel-head");
  if (deep && head) head.append(deep);
  let lastQuery = "";

  const startLongButton = (label) => {
    const b = el("button", { type: "button", class: "library-long", text: label || "Ψάξε και στο διαδίκτυο · συνήθως 20–90 λεπτά" });
    b.addEventListener("click", () => {
      b.disabled = true;
      window.dispatchEvent(new CustomEvent("nabou:start-long-research", { detail: { query: lastQuery } }));
    });
    return b;
  };
  function details(decision, reply) {
    const d = el("details", { class: "library-details" }, el("summary", { text: "Λεπτομέρειες" }));
    const lines = [];
    const v = decision.verdict;
    if (v) lines.push("Αποσπάσματα που αναφέρουν το όνομα: " + v.passages + " · σε " + v.books + (v.books === 1 ? " βιβλίο" : " βιβλία"));
    lines.push("Ψάχτηκε το όνομα: " + (decision.focus.names.join(", ") || "—") + " (και γραφές " + decision.focus.stems.join(", ") + ")");
    const st = reply?.stores;
    if (st) {
      const label = { OK: "ψάχτηκε", NOT_CONFIGURED: "δεν έχει συνδεθεί ακόμη", UNAVAILABLE: "δεν απάντησε", PENDING: "—" };
      lines.push("Δημοσιευμένες πηγές: " + (label[st.published] || st.published) + " · Βιβλία που πρόσθεσες: " + (label[st.uploaded] || st.uploaded) + " · Ιστορική βιβλιοθήκη: " + (label[st.historical] || st.historical));
    }
    if (reply?.took_ms != null) lines.push("Χρόνος αναζήτησης: " + (reply.took_ms < 1000 ? reply.took_ms + " ms" : Math.round(reply.took_ms / 100) / 10 + " δευτ."));
    lines.push("Κανόνας: αρκεί η βιβλιοθήκη όταν υπάρχουν τουλάχιστον 3 αποσπάσματα για το όνομα, ή 2 από 2 διαφορετικά βιβλία.");
    lines.push("Τα αποσπάσματα είναι κείμενο των βιβλίων (συχνά από οπτική ανάγνωση) και δεν έχουν ελεγχθεί από ιστορικό.");
    d.append(el("ul", {}, ...lines.map((t) => el("li", { text: t }))));
    return d;
  }
  function storyNode(story) {
    const ol = el("ol", { class: "library-story" });
    for (const f of story.facts) {
      ol.append(el("li", {},
        el("span", { class: "library-when", text: f.when }),
        el("p", { class: "library-fact", text: f.text }),
        el("small", { class: "library-source", text: "Πηγή: " + f.source })));
    }
    return ol;
  }
  function show(kind, title, lead, ...extra) {
    mountCard();
    card.hidden = false;
    card.dataset.path = kind;
    card.replaceChildren(
      el("p", { class: "library-kicker", text: { searching: "Βιβλιοθήκη · λίγα δευτερόλεπτα", library: "Από τη βιβλιοθήκη σου", long: "Μεγάλη έρευνα στο διαδίκτυο", ask: "Η βιβλιοθήκη δεν απάντησε" }[kind] || "" }),
      el("h2", { text: title }),
      el("p", { class: "library-lead", text: lead }),
      ...extra.filter(Boolean),
    );
    window.N7_READER?.show?.("research", { focus: false });
  }

  async function search(query) {
    const r = await call("/library/search", { method: "POST", body: JSON.stringify({ query }), headers: { "content-type": "text/plain;charset=UTF-8" } });
    if (!r.ok || r.schema !== "nabou-library-search-v1") return { ok: false, status: r.status, error: r.error };
    return r;
  }

  /** Called by operator-command.js before any long run. Returns the decision. */
  async function consult(query, { deep = false } = {}) {
    lastQuery = query;
    const f = core.focus(query);
    const label = f.names.join(", ") || query;
    if (deep || core.wantsDeepSearch(query)) {
      const decision = { path: "long", reason: "OWNER_ASKED_TO_SEARCH_FURTHER", focus: f };
      show("long", "«" + label + "»", "Ζήτησες να ψάξω και πέρα από τη βιβλιοθήκη. Ξεκινά η μεγάλη έρευνα στο διαδίκτυο και στα αρχεία· συνήθως κρατάει 20–90 λεπτά. Η πρόοδος φαίνεται παρακάτω.");
      return decision;
    }
    show("searching", "«" + label + "»", "Ψάχνω πρώτα στη βιβλιοθήκη σου. Παίρνει λίγα δευτερόλεπτα. Η μεγάλη έρευνα δεν έχει ξεκινήσει.");
    const reply = await search(query);
    const decision = core.decide(query, reply);
    if (decision.path === "library") {
      show("library", decision.story.title, decision.story.lead + " Η μεγάλη έρευνα στο διαδίκτυο δεν ξεκίνησε, γιατί η βιβλιοθήκη έφτανε.",
        storyNode(decision.story), el("div", { class: "library-row" }, startLongButton()), details(decision, reply));
    } else if (decision.path === "long") {
      const found = decision.verdict?.passages || 0;
      show("long", "«" + label + "»",
        (found ? "Η βιβλιοθήκη είχε μόνο " + found + (found === 1 ? " απόσπασμα" : " αποσπάσματα") + " για «" + label + "», όχι αρκετά για ιστορία. " : "Η βιβλιοθήκη δεν είχε τίποτα για «" + label + "». ") +
          "Ξεκινά η μεγάλη έρευνα στο διαδίκτυο και στα αρχεία· συνήθως κρατάει 20–90 λεπτά. Η πρόοδος φαίνεται παρακάτω.",
        decision.partial ? storyNode(decision.partial) : null, details(decision, reply));
    } else {
      const signIn = decision.reason === "LIBRARY_SIGN_IN_REQUIRED";
      const go = el("button", { type: "button", class: "library-go-sources", text: signIn ? "Σύνδεση στη βιβλιοθήκη" : "Δες τη βιβλιοθήκη" });
      go.addEventListener("click", () => window.N7_READER?.show?.("sources"));
      show("ask", "«" + label + "»",
        (signIn ? "Για να ψάξω στα βιβλία σου χρειάζεται σύνδεση (στις Πηγές). " : "Δεν μπόρεσα να ψάξω στη βιβλιοθήκη τώρα· η βιβλιοθήκη στον διακομιστή δεν έχει ανέβει ακόμη ή δεν απαντά. ") +
          "Η μεγάλη έρευνα δεν ξεκίνησε μόνη της. Αν θέλεις, ξεκίνα τη· κρατάει συνήθως 20–90 λεπτά.",
        el("div", { class: "library-row" }, startLongButton("Ξεκίνα τη μεγάλη έρευνα · 20–90 λεπτά"), go), details(decision, reply));
    }
    return decision;
  }
  function longStarted(ok) {
    if (card.hidden) return;
    const lead = card.querySelector(".library-lead");
    if (!lead) return;
    if (ok) {
      card.dataset.path = "long";
      card.querySelector(".library-kicker").textContent = "Μεγάλη έρευνα στο διαδίκτυο";
      card.querySelectorAll(".library-long").forEach((b) => b.remove());
      if (!/Ξεκινά η μεγάλη έρευνα/.test(lead.textContent)) lead.textContent += " Ξεκίνησε και η μεγάλη έρευνα στο διαδίκτυο· συνήθως κρατάει 20–90 λεπτά.";
    } else {
      card.querySelectorAll(".library-long").forEach((b) => (b.disabled = false));
    }
  }
  window.addEventListener("jarvis:dispatch-accepted", (e) => { if (!e.detail?.restored) longStarted(true); });
  window.addEventListener("jarvis:dispatch-failed", () => longStarted(false));

  window.NABOU_LIBRARY_FIRST = { consult, reload: loadLibrary };
})();
