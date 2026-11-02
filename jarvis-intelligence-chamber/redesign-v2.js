/* NABOU//X — redesign v2: πλοήγηση 5 ενοτήτων (ράγα + κάτω μπάρα), μενού «Εργαλεία», πάνελ δεξιάς στήλης.
   Δεν αλλάζει τη λογική της εφαρμογής: οι ενέργειες περνούν από τα υπάρχοντα [data-nx-go] του nautical-dashboard.js. */
(() => {
  "use strict";
  const body = document.body, $ = (id) => document.getElementById(id);
  const navs = [...document.querySelectorAll(".v2-nav[data-v2]")];
  const menu = $("v2ToolsMenu");
  const toolBtns = [$("v2ToolsBtn"), $("v2MoreBtn")].filter(Boolean);
  let last = "map";

  const viewToNav = { universe: "map", findings: "research", agents: "agents", pdf: "tools", activity: "research" };
  function paint() {
    const view = body.dataset.nxsView || "universe";
    let key = viewToNav[view] || "map";
    if (view === "findings" && last === "sources") key = "sources";
    if (view === "findings" && ["history", "learning"].includes(last)) key = "tools";
    if (view === "universe" && last === "research") key = "map";
    navs.forEach((b) => {
      const on = b.dataset.v2 === key;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
  }
  new MutationObserver(paint).observe(body, { attributes: true, attributeFilter: ["data-nxs-view"] });

  document.addEventListener("click", (e) => {
    const n = e.target.closest(".v2-nav[data-v2]");
    if (n && n.dataset.v2 !== "tools") { last = n.dataset.v2; closeMenu(); paint(); }
    const m = e.target.closest("#v2ToolsMenu [data-nx-go]");
    if (m) { last = m.dataset.nxGo; closeMenu(); setTimeout(paint, 60); }
    if (!e.target.closest("#v2ToolsMenu, .v2-tools-btn")) closeMenu();
  });

  // μενού «Εργαλεία / Περισσότερα»
  function openMenu(btn) {
    menu.hidden = false;
    toolBtns.forEach((b) => b.setAttribute("aria-expanded", String(b === btn)));
    menu.querySelector("[role=menuitem]")?.focus();
  }
  function closeMenu(refocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    toolBtns.forEach((b) => b.setAttribute("aria-expanded", "false"));
    if (refocus) (toolBtns.find((b) => b.offsetWidth) || toolBtns[0])?.focus();
  }
  toolBtns.forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden ? openMenu(b) : closeMenu(true); }));
  menu.addEventListener("keydown", (e) => {
    const items = [...menu.querySelectorAll("[role=menuitem]")], i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); closeMenu(true); }
  });

  // δεξιά στήλη: ανοιχτή σε μεγάλες οθόνες, συρταρωτή σε στενές
  const toggle = $("v2AsideToggle");
  const wide = () => matchMedia("(min-width: 1181px)").matches;
  function asideOpen() { return wide() ? !body.classList.contains("v2-aside-off") : body.classList.contains("v2-aside-open"); }
  function syncToggle() { toggle?.setAttribute("aria-expanded", String(asideOpen())); }
  toggle?.addEventListener("click", () => {
    if (wide()) body.classList.toggle("v2-aside-off"); else body.classList.toggle("v2-aside-open");
    syncToggle();
    window.dispatchEvent(new Event("resize")); // ο χάρτης προσαρμόζεται στο νέο πλάτος
  });
  matchMedia("(min-width: 1181px)").addEventListener("change", syncToggle);
  syncToggle();

  paint();
})();
