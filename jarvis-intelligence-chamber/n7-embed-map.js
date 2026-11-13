// N7_SPLIT_MAP_V1 — read-only hook for the N7 link (../tools/n7/atlas-map-link.js) when N7 embeds this
// chart. It shows the records of ../data.json on the existing 3D chart (window.NABOU_MAP3D public API)
// at their STORED coordinates and focuses one on request. It adds no place and computes no coordinate;
// the renderer, camera code and 2D chart are untouched.
(() => {
  "use strict";
  if (!window.N7_EMBED) return;
  let records = [], selected = null, last = null, shown = false;
  const M3 = () => window.NABOU_MAP3D;
  const located = (r) => Number.isFinite(r.lat) && Number.isFinite(r.lon);
  function markers() {
    if (shown || !M3()?.ready) return;
    shown = true;
    for (const r of records.filter(located)) {
      const b = document.createElement("button");
      // A small dot for every record; the name is shown for the focused place and on hover/focus.
      b.type = "button"; b.className = "n7e-3d-place";
      const dot = document.createElement("span"); dot.className = "n7e-3d-dot";
      const name = document.createElement("span"); name.className = "n7e-3d-name"; name.textContent = r.place;
      b.append(dot, name); b.setAttribute("aria-label", r.place);
      b.dataset.placeId = r.id; b.dataset.coordinateStatus = r.coordinateStatus || "";
      b.title = r.place + (r.coordinateStatus === "APPROXIMATE" ? " · σημείο κατά προσέγγιση" : "");
      b.addEventListener("click", () => focus(r.id));
      M3().addObject(b, { lon: r.lon, lat: r.lat, z: 0.02 });  // on the ground: the camera comes close
    }
  }
  function focus(id) {
    const r = records.find((x) => x.id === id);
    if (!r || !located(r) || !M3()?.ready) return Promise.resolve(false);
    selected = id; last = { lng: r.lon, lat: r.lat, zoom: null };
    document.querySelectorAll("[data-n7-focus]").forEach((e) => e.removeAttribute("data-n7-focus"));
    // Last in the pin layer, so the focused name is drawn above the other dots.
    document.querySelectorAll('.n7e-3d-place[data-place-id="' + CSS.escape(id) + '"]').forEach((e) => { e.setAttribute("data-n7-focus", "1"); e.parentElement?.append(e); });
    // The existing 3D camera API: centre on the stored point, closer and slightly tilted.
    M3().camera({ lon: r.lon, lat: r.lat, tilt: 48, rot: 0, dist: 2.4 });
    return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))));
  }
  window.NABOU_MAP = {
    get records() { return records; },
    ready: () => records.length > 0 && !!M3()?.ready && !!M3()?.enabled,
    selected: () => selected,
    camera: () => last,
    padding: () => {},
    focus,
  };
  fetch("../data.json", { cache: "no-store" }).then((r) => r.json()).then((d) => { records = Array.isArray(d.places) ? d.places : []; })
    .catch(() => { records = []; });
  // 3D is the view N7 asks for (?map3d=1); markers are added once the scene exists.
  const t = setInterval(() => { if (records.length && M3()?.ready) { clearInterval(t); markers(); } }, 200);
  setTimeout(() => clearInterval(t), 60000);
})();
