/* NABOU Atlas — explicit home vs research page states.
   Only one atlas page root is on screen; the live map stays full-bleed.
   Reuses operatorCommand + resultsDrawer by relocating them into research chrome. */
(() => {
  const body = document.body;
  if (!body.classList.contains("atlas-ui")) return;

  const $ = (id) => document.getElementById(id);
  const home = $("atlasHome");
  const research = $("atlasResearch");
  const panelSlot = $("atlasPanelSlot");
  const askSlot = $("atlasAskSlot");
  const filtersSlot = $("atlasFiltersSlot");
  const drawer = $("resultsDrawer");
  const form = $("operatorCommand");
  const hist = $("histList");
  const cards = $("cards");
  const query = $("operatorQuery");
  const explore = $("atlasExplore");
  const closeBtn = $("atlasCloseResearch");

  if (!home || !research || !drawer || !form) {
    console.warn("atlas-pages: missing markup");
    return;
  }

  // Relocate live nodes once into the research page tree (not CSS-hide overlays).
  if (panelSlot && drawer.parentElement !== panelSlot) panelSlot.appendChild(drawer);
  if (askSlot && form.parentElement !== askSlot) askSlot.appendChild(form);
  if (filtersSlot) {
    if (hist && hist.parentElement !== filtersSlot) filtersSlot.appendChild(hist);
    if (cards && cards.parentElement !== filtersSlot) filtersSlot.appendChild(cards);
  }

  // Drop laboratory leftovers from the live stage tree into an inert host.
  const host = $("atlasScriptHost");
  if (host) {
    for (const id of [
      "v2welcome",
      "v2rail",
      "v2tabbar",
      "v2ToolsMenu",
      "topbar",
      "workspaceWelcome",
      "v2aside",
    ]) {
      const el = $(id);
      if (el && el.parentElement !== host) host.appendChild(el);
    }
    const legacy = document.querySelector(".v2-legacy");
    if (legacy && legacy.parentElement !== host) host.appendChild(legacy);
  }

  function page() {
    return body.dataset.atlasPage === "research" ? "research" : "home";
  }

  function setPage(next, { focusSearch = false, openDrawer = false } = {}) {
    const mode = next === "research" ? "research" : "home";
    body.dataset.atlasPage = mode;
    home.hidden = mode !== "home";
    research.hidden = mode !== "research";

    document.querySelectorAll(".atlas-topnav [data-atlas-nav]").forEach((btn) => {
      const on =
        (mode === "home" && btn.dataset.atlasNav === "map") ||
        (mode === "research" && btn.dataset.atlasNav === "research");
      btn.setAttribute("aria-current", on ? "page" : "false");
    });

    if (mode === "research") {
      const shellView = body.dataset.nxsView || "universe";
      const secondary = ["agents", "pdf", "activity"].includes(shellView);
      if (!secondary) drawer.classList.remove("hidden");
      if (openDrawer && !secondary) {
        const toggle = $("resultsToggle");
        if (toggle && drawer.classList.contains("hidden")) toggle.click();
      }
      if (focusSearch) {
        requestAnimationFrame(() => {
          query?.focus({ preventScroll: true });
          const current = String(query?.value || "").trim();
          if (query) {
            query.placeholder = current
              ? "Τρέχουσα: " + current + " — νέο ερώτημα…"
              : "Τρέχουσα: — νέο ερώτημα…";
          }
        });
      }
    } else {
      // Home: research panel not on screen; keep drawer closed for shell state.
      drawer.classList.add("hidden");
    }

    window.dispatchEvent(
      new CustomEvent("nabou:atlas-page", { detail: { page: mode } }),
    );
  }

  function syncPlaceholder() {
    if (!query || page() !== "research") return;
    const current = String(query.value || "").trim();
    query.placeholder = current
      ? "Τρέχουσα: " + current + " — νέο ερώτημα…"
      : "Τρέχουσα: — νέο ερώτημα…";
  }

  explore?.addEventListener("click", () =>
    setPage("research", { focusSearch: true, openDrawer: true }),
  );
  closeBtn?.addEventListener("click", () => setPage("home"));

  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-atlas-nav]");
    if (!nav) return;
    const dest = nav.dataset.atlasNav;
    if (dest === "map" || dest === "home") {
      e.preventDefault();
      setPage("home");
      $("resetView")?.click();
      return;
    }
    if (dest === "research") {
      e.preventDefault();
      setPage("research", { focusSearch: true, openDrawer: true });
      document.querySelector('[data-dossier-section="researchOverview"]')?.click();
      return;
    }
    if (dest === "sources") {
      e.preventDefault();
      setPage("research", { openDrawer: true });
      document.querySelector('[data-dossier-section="researchFindings"]')?.click();
      $("resultSearch")?.focus({ preventScroll: true });
      return;
    }
    if (dest === "agents") {
      e.preventDefault();
      setPage("research");
      document.querySelector('[data-nx-go="agents"]')?.click();
      return;
    }
    if (dest === "tools") {
      e.preventDefault();
      setPage("research");
      document.querySelector('[data-nx-go="learning"]')?.click();
    }
  });

  // When existing shell opens findings, show research page (not a stacked lab layout).
  new MutationObserver(() => {
    const view = body.dataset.nxsView || "universe";
    if (["findings", "sources", "history", "pdf", "agents", "activity"].includes(view)) {
      if (page() !== "research") setPage("research");
    }
  }).observe(body, { attributes: true, attributeFilter: ["data-nxs-view"] });

  query?.addEventListener("input", syncPlaceholder);
  form?.addEventListener("submit", () => {
    if (page() !== "research") setPage("research");
    setTimeout(syncPlaceholder, 0);
  });

  // Deep links: ?run=… or #research open research; otherwise home.
  const params = new URLSearchParams(location.search);
  const wantResearch =
    params.has("run") ||
    ["research", "map"].includes(params.get("view")) ||
    location.hash === "#research" ||
    location.hash === "#έρευνα";

  setPage(wantResearch ? "research" : "home", {
    focusSearch: wantResearch,
    openDrawer: wantResearch,
  });
  syncPlaceholder();

  // Expose for other modules / tests.
  window.NABOU_ATLAS = { setPage, page };
})();
