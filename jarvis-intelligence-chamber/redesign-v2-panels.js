/* NABOU//X — redesign v2, φάση 2: κοινή κεφαλίδα πάνελ, Escape/εστίαση, ζώνη σύρε-και-άφησε PDF,
   μπάρα ταξινόμησης, φιλικές κενές καταστάσεις. Δεν κάνει δικτυακά αιτήματα (ούτε POST). */
(() => {
  "use strict";
  const body = document.body;
  if (!body.classList.contains("nx-v2")) return;
  const $ = (id) => document.getElementById(id);

  /* ---------- 1. κοινή κεφαλίδα: διαδρομή (breadcrumb) + κουμπί × ---------- */
  const PANELS = [
    { id: "nxsAgentsPage", head: ".nxs-workspace-head", close: "#nxsCloseAgents", crumb: ["Έρευνα", "Ερευνητές"], title: "Ερευνητές" },
    { id: "resultsDrawer", head: ".results-head", close: "#closeResults", crumb: ["Έρευνα", "Η έρευνά μου"], title: "Η έρευνά μου" },
    { id: "learningPanel", head: ".learning-head", close: "#closeLearning", crumb: ["Εργαλεία", "Έλεγχος PDF"], title: "Έλεγχος PDF" },
    { id: "activityStrip", head: ".activity-head", close: "#nxsCloseActivity", crumb: ["Έρευνα", "Πορεία"], title: "Πορεία" },
    { id: "detailPanel", head: ".detail-head", close: "#closeDetail", crumb: ["Χάρτης", "Λεπτομέρειες"], title: "Λεπτομέρειες" },
  ];
  const state = new Map();
  for (const p of PANELS) {
    const el = $(p.id);
    if (!el) continue;
    const head = el.querySelector(p.head), x = el.querySelector(p.close);
    if (head && !head.querySelector(".v2-crumb")) {
      const nav = document.createElement("nav");
      nav.className = "v2-crumb";
      nav.setAttribute("aria-label", "Διαδρομή");
      nav.innerHTML = '<a href="#" data-v2-home>NABOU//X</a>' + p.crumb.map((c, i) => '<i aria-hidden="true">›</i><em' + (i === p.crumb.length - 1 ? ' aria-current="page"' : "") + ">" + c + "</em>").join("");
      head.prepend(nav);
      nav.querySelector("[data-v2-home]").addEventListener("click", (e) => { e.preventDefault(); x?.click(); });
    }
    if (["resultsDrawer", "learningPanel", "detailPanel"].includes(p.id) && head && !el.querySelector(":scope > .v2-scroll")) {
      // κεφαλίδα σταθερή, το περιεχόμενο κυλά μέσα σε δικό του περιέκτη (οι ταυτότητες/χειριστές δεν αλλάζουν)
      const sc = document.createElement("div");
      sc.className = "v2-scroll";
      [...el.children].filter((c) => c !== head && !c.classList.contains("learning-footer")).forEach((c) => sc.append(c));
      head.after(sc);
    }
    x?.classList.add("v2-x");
    x && (x.textContent = "✕");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "false");
    el.setAttribute("aria-label", p.title);
    state.set(el, { trigger: null, wasOpen: !el.classList.contains("hidden") && !el.hidden, p });
  }

  const isOpen = (el) => !el.classList.contains("hidden") && !el.hidden && getComputedStyle(el).display !== "none";
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      const el = m.target, st = state.get(el);
      if (!st) continue;
      const open = isOpen(el);
      if (open === st.wasOpen) continue;
      st.wasOpen = open;
      if (open) {
        const t = st.trigger = lastFocus && lastFocus.isConnected ? lastFocus : null;
        requestAnimationFrame(() => {
          const h = el.querySelector(st.p.head + " h1, " + st.p.head + " strong, " + st.p.head + " span:not(.nxs-index)") || el;
          // εστίαση στο πάνελ ώστε το πληκτρολόγιο και οι αναγνώστες οθόνης να «μπουν» μέσα
          const x = el.querySelector(".v2-x");
          (x || h).focus({ preventScroll: true });
        });
      } else {
        const t = st.trigger;
        st.trigger = null;
        if (t && t.isConnected && t.offsetWidth && !document.querySelector(".v2-panel-open")) {
          if (!document.activeElement || document.activeElement === document.body || el.contains(document.activeElement)) t.focus({ preventScroll: true });
        }
      }
    }
    body.classList.toggle("v2-panel-open", PANELS.some((p) => { const e = $(p.id); return e && isOpen(e); }));
    const wide = PANELS.some((p) => { const e = $(p.id); return e && isOpen(e); });
    const slim = wide && !PANELS.some((p) => { const e = $(p.id); return p.id !== "detailPanel" && e && isOpen(e); }); // μόνο το πάνελ λεπτομερειών (400px)
    body.classList.toggle("v2-panel-slim", slim);
    if (body.classList.contains("v2-panel-wide") !== wide || body.dataset.v2Slim !== String(slim)) {
      body.dataset.v2Slim = String(slim);
      body.classList.toggle("v2-panel-wide", wide);
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize"))); // ο χάρτης προσαρμόζεται στο νέο πλάτος
    }
  });
  let lastFocus = null;
  document.addEventListener("focusin", (e) => { if (!e.target.closest?.("#nxsAgentsPage,#resultsDrawer,#learningPanel,#activityStrip,#detailPanel")) lastFocus = e.target; }, true);
  document.addEventListener("pointerdown", (e) => { const b = e.target.closest?.("button,a,[tabindex]"); if (b && !b.closest("#nxsAgentsPage,#resultsDrawer,#learningPanel,#activityStrip,#detailPanel")) lastFocus = b; }, true);
  for (const [el] of state) mo.observe(el, { attributes: true, attributeFilter: ["class", "hidden"] });

  /* ---------- 2. Escape: κλείνει πρώτα μενού/popover, μετά το πάνελ που είναι πάνω ---------- */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    const menu = $("ddMenu"), pop = $("nxPopover"), tools = $("v2ToolsMenu"), asst = $("nabouAssistant");
    if ((menu && !menu.hidden) || (pop && !pop.hidden) || (tools && !tools.hidden)) return; // τα κλείνουν οι δικοί τους χειριστές
    if (asst && !asst.hidden && asst.contains(e.target)) return;
    const disc = $("discoveryDetail");
    if (disc && !disc.hidden && disc.contains(e.target)) { $("closeDiscovery")?.click(); e.preventDefault(); return; }
    for (const id of ["detailPanel", "learningPanel", "activityStrip", "nxsAgentsPage", "resultsDrawer"]) {
      const el = $(id);
      if (el && isOpen(el)) { el.querySelector(".v2-x")?.click(); e.preventDefault(); return; }
    }
  });

  /* ---------- 3. Έλεγχος PDF: κουμπί «Επιλογή αρχείου» + ζώνη σύρε-και-άφησε ---------- */
  const input = $("learningFile"), analyze = $("learningAnalyze"), src = document.querySelector(".learning-source");
  if (input && src) {
    const zone = document.createElement("div");
    zone.className = "v2-drop";
    zone.innerHTML =
      '<div class="v2-drop-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg></div>' +
      '<p class="v2-drop-t">Σύρετε εδώ ένα αρχείο PDF</p><p class="v2-drop-s">ή</p>' +
      '<button type="button" class="v2-drop-btn">Επιλογή αρχείου</button>' +
      '<p class="v2-drop-h">Μόνο αρχεία PDF, έως 25 MB. Το έγγραφο διαβάζεται στον υπολογιστή σας.</p>' +
      '<p class="v2-drop-file" role="status" aria-live="polite"></p>';
    input.after(zone);
    input.classList.add("v2-file-native");
    input.setAttribute("tabindex", "-1");
    input.setAttribute("aria-hidden", "true");
    const btn = zone.querySelector(".v2-drop-btn"), fileEl = zone.querySelector(".v2-drop-file");
    const MAX = 25 * 1024 * 1024;
    const show = () => {
      const f = input.files && input.files[0];
      zone.classList.toggle("has-file", !!f);
      fileEl.classList.remove("err");
      fileEl.textContent = f ? "Επιλέχθηκε: " + f.name + " (" + (f.size / 1048576).toFixed(1).replace(".", ",") + " MB)" : "";
      btn.textContent = f ? "Αλλαγή αρχείου" : "Επιλογή αρχείου";
      hint();
    };
    btn.addEventListener("click", () => input.click());
    input.addEventListener("change", show);
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    ["dragenter", "dragover"].forEach((t) => zone.addEventListener(t, (e) => { stop(e); zone.classList.add("drag"); }));
    ["dragleave", "dragend"].forEach((t) => zone.addEventListener(t, (e) => { stop(e); zone.classList.remove("drag"); }));
    zone.addEventListener("drop", (e) => {
      stop(e);
      zone.classList.remove("drag");
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      const bad = !(/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) ? "Το αρχείο «" + f.name + "» δεν είναι PDF. Επιλέξτε αρχείο .pdf." : f.size > MAX ? "Το αρχείο ξεπερνά τα 25 MB." : "";
      if (bad) { fileEl.textContent = bad; fileEl.classList.add("err"); return; }
      const dt = new DataTransfer();
      dt.items.add(f);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // καθαρή ένδειξη ενεργοποιημένου / απενεργοποιημένου κουμπιού ανάλυσης
    const h = document.createElement("p");
    h.className = "v2-hint";
    analyze?.after(h);
    function hint() {
      if (!analyze) return;
      h.textContent = analyze.disabled ? "Η ανάλυση ενεργοποιείται μόλις επιλέξετε αρχείο PDF." : "Έτοιμο — πατήστε «Ανάλυση εγγράφου».";
      h.dataset.on = analyze.disabled ? "0" : "1";
    }
    analyze && new MutationObserver(hint).observe(analyze, { attributes: true, attributeFilter: ["disabled"] });
    hint();
    const save = $("learningSave");
    if (save) save.title = "Ενεργοποιείται όταν εγκρίνετε τουλάχιστον μία πρόταση.";
  }

  /* ---------- 4. Ευρήματα: ορατή ταξινόμηση, εξαγωγή, κενή κατάσταση ---------- */
  const tabs = $("resultTabs"), sort = $("resultSort");
  if (tabs && sort) {
    const bar = document.createElement("div");
    bar.className = "v2-sortbar";
    bar.innerHTML = '<label for="resultSort"><span class="v2-sort-ico" aria-hidden="true">⇅</span> Ταξινόμηση κατά</label>';
    const lab = document.querySelector('label.tool-help[for="resultSort"]');
    lab?.remove();
    bar.append(sort);
    document.querySelector(".results-tools .nxs-tool-row")?.after(bar);
    const note = document.createElement("span");
    note.className = "v2-sort-note";
    bar.append(note);
    const upd = () => { note.textContent = "Τώρα: " + (sort.selectedOptions[0]?.textContent || ""); };
    sort.addEventListener("change", upd);
    upd();
    const sum = document.querySelector(".result-options > summary");
    if (sum) sum.textContent = "Εξαγωγή δεδομένων και άνοιγμα με αριθμό";
  }
  const exp = $("exportResults");
  if (exp) {
    const fmt = $("exportFormat");
    const note = document.createElement("p");
    note.className = "v2-hint";
    exp.after(note);
    const u = () => { note.textContent = exp.disabled ? "Η εξαγωγή ενεργοποιείται όταν φορτωθεί μια έρευνα." : "Θα γίνει λήψη αρχείου στη συσκευή σας."; };
    new MutationObserver(u).observe(exp, { attributes: true, attributeFilter: ["disabled"] });
    u();
    void fmt;
  }
  const list = $("resultsList");
  const decorate = () => {
    list?.querySelectorAll(".result-empty:not([data-v2])").forEach((d) => {
      d.dataset.v2 = "1";
      const noRun = /Δεν έχει επιλεγεί/.test($("resultsRun")?.textContent || "") || !$("resultsRun")?.textContent;
      const ico = document.createElement("div");
      ico.className = "v2-empty-ico";
      ico.setAttribute("aria-hidden", "true");
      ico.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/></svg>';
      d.prepend(ico);
      const acts = document.createElement("div");
      acts.className = "v2-empty-acts";
      const ask = document.createElement("button");
      ask.type = "button";
      ask.textContent = "Γράψε ένα ερώτημα";
      ask.addEventListener("click", () => { $("closeResults")?.click(); setTimeout(() => $("operatorQuery")?.focus(), 80); });
      if (noRun) acts.append(ask);
      if (noRun) {
        const ex = document.createElement("button");
        ex.type = "button";
        ex.className = "primary";
        ex.textContent = "Δοκίμασε ένα παράδειγμα";
        // ανοίγει μια υπάρχουσα προηγούμενη έρευνα (μόνο ανάγνωση, GET) — δεν στέλνει νέο ερώτημα
        ex.addEventListener("click", () => {
          const hi = $("researchHistory");
          if (hi) hi.open = true;
          const first = document.querySelector("#historyList [data-history-run]");
          if (first) first.click(); else $("latestResearch")?.click();
        });
        acts.prepend(ex);
      }
      d.append(acts);
    });
  };
  list && new MutationObserver(decorate).observe(list, { childList: true });
  decorate();

  document.querySelector(".dossier-navigation")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-dossier-section]");
    if (!b) return;
    b.parentElement.querySelectorAll("button").forEach((x) => { x.classList.toggle("is-current", x === b); x.toggleAttribute("aria-current", x === b); });
  });

  /* ---------- 5b. Αναδυόμενα (Επίπεδα/Ρυθμίσεις): εστίαση στο ✕ και επιστροφή εστίασης ---------- */
  const popEl = $("nxPopover");
  if (popEl) {
    let from = null, wasHidden = popEl.hidden;
    document.addEventListener("click", (e) => { const t = e.target.closest("button,a"); if (t && !popEl.contains(t)) from = t; }, true);
    new MutationObserver(() => {
      if (wasHidden && !popEl.hidden) {
        popEl.setAttribute("role", "dialog");
        popEl.setAttribute("aria-label", popEl.querySelector("h2")?.textContent.trim() || "Αναδυόμενο παράθυρο");
        requestAnimationFrame(() => popEl.querySelector(".close")?.focus({ preventScroll: true }));
      } else if (!wasHidden && popEl.hidden) {
        const t = from && from.isConnected && from.offsetWidth ? from : $("v2ToolsBtn") || $("v2MoreBtn");
        if (t && (document.activeElement === document.body || popEl.contains(document.activeElement))) t.focus({ preventScroll: true });
      }
      wasHidden = popEl.hidden;
    }).observe(popEl, { attributes: true, attributeFilter: ["hidden"] });
  }
  /* ---------- 5. Σύνθετη: έλεγχος ότι ανοίγει (πραγματικό click) ---------- */
  const adv = $("advBtn");
  adv?.setAttribute("aria-haspopup", "dialog");
})();
