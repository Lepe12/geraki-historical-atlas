"use strict";
/* Small launcher for the NABOU voice assistant. Everything else (code, styles, the 3D head) loads on the first press. */
(() => {
  const b = document.createElement("button");
  b.type = "button"; b.id = "nabouAssistantLauncher";
  b.title = "Ναμπού — φωνητική βοηθός"; b.setAttribute("aria-label", "Άνοιγμα φωνητικής βοηθού Ναμπού");
  b.style.cssText = "position:fixed;right:22px;bottom:14px;z-index:9001;width:34px;height:34px;min-width:0;min-height:0;box-sizing:border-box;padding:0;margin:0;border-radius:50%;" +
    "border:1px solid rgba(214,170,92,.7);background:radial-gradient(circle at 50% 45%,#3a2810,#140d06);cursor:pointer;display:grid;place-items:center";
  b.innerHTML = '<svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="#e8bd68" stroke-width="1.1">' +
    '<circle r="9"/><ellipse rx="9" ry="3.2"/><ellipse rx="3.2" ry="9"/><ellipse rx="9" ry="3.2" transform="rotate(-23)"/><circle r="1.6" fill="#e8bd68"/></svg>';
  let mod = null, busy = false;
  b.addEventListener("click", async () => {
    if (busy) return;
    if (mod && mod.isOpen()) { mod.close(); return; }
    busy = true;
    try {
      if (!mod) {
        const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "./assistant/assistant.css?v=1"; document.head.appendChild(css);
        mod = await import("./assistant/assistant.js?v=1");
        document.addEventListener("nabou:assistant", (e) => b.classList.toggle("open", e.detail.open));
      }
      mod.open();
    } finally { busy = false; }
  });
  document.body.appendChild(b);
})();
