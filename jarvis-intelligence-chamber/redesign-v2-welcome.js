/* NABOU//X — σελίδα καλωσορίσματος με το ολόγραμμα του βοηθού (assistant/assistant-scene.js).
   Εμφανίζεται μία φορά ανά συνεδρία· δεν εμφανίζεται σε άμεσους συνδέσμους (?run=…, ?skip, #…). Enter ή «Είσοδος» → fade ~400ms. */
const html = document.documentElement, root = document.getElementById("v2welcome");
if (root && !html.classList.contains("v2-welcome-on")) root.remove();
else if (root) {
  const btn = document.getElementById("v2wEnter"), canvas = document.getElementById("v2wCanvas"), app = document.getElementById("viewport");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let holo = null, done = false, raf = 0;
  app?.setAttribute("inert", "");
  app?.setAttribute("aria-hidden", "true");
  btn.focus({ preventScroll: true });

  function enter() {
    if (done) return;
    done = true;
    try { sessionStorage.setItem("nx-v2-seen", "1"); } catch {}
    root.classList.add("leaving");
    app?.removeAttribute("inert");
    app?.removeAttribute("aria-hidden");
    setTimeout(() => {
      cancelAnimationFrame(raf);
      try { holo?.dispose(); } catch {}
      html.classList.remove("v2-welcome-on");
      root.remove();
      if (matchMedia("(hover: hover) and (pointer: fine)").matches) document.getElementById("operatorQuery")?.focus({ preventScroll: true });
    }, reduce ? 20 : 420);
  }
  btn.addEventListener("click", enter);
  document.addEventListener("keydown", (e) => {
    if (done) return;
    if (e.key === "Enter" && e.target !== btn) { e.preventDefault(); enter(); }
    else if (e.key === "Tab") { e.preventDefault(); btn.focus(); }
  });

  const hasGL = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };
  if (!hasGL()) root.classList.add("no-webgl");
  else {
    import("./assistant/assistant-scene.js")
      .then((m) => m.createHologram(canvas))
      .then((h) => {
        if (done) { h.dispose(); return; }
        holo = h;
        h.jump(1); // πορτραίτο του χαρτογράφου από το νέφος σημείων
        h.tune({ uGain: 0.62, uSize: 0.04 });
        if (reduce) { h.freeze(2.2); return; }
        const t0 = performance.now();
        const loop = (now) => { // απαλή «αναπνοή»: φωτεινότητα και μέγεθος σημείων
          const s = Math.sin((now - t0) / 1000 * 1.05);
          h.tune({ uGain: 0.62 + 0.14 * s, uSize: 0.04 + 0.004 * s, strength: 0.7 + 0.12 * s });
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      })
      .catch(() => root.classList.add("no-webgl"));
  }
}
