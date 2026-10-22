"use strict";
/* Lamp-light layer for the nautical edition (replaces the former WebGL nebula).
   A warm, slowly breathing light over the chart; purely decorative and CSS-driven. */
(() => {
  const base = document.getElementById("universe");
  if (!base || document.getElementById("gpuField")) return;
  const glow = document.createElement("div");
  glow.id = "gpuField";
  glow.className = "lamp-light";
  glow.setAttribute("aria-hidden", "true");
  base.insertAdjacentElement("afterend", glow);
})();
