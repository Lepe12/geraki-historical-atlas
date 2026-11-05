/* Plot accepted Greek-narrative places on the portolan chart.
   Does not modify the locked chamber.js core; uses NABOU_CHART projection. */
(function () {
  const LAYER_ID = "nabouFactPins";
  function project(lon, lat) {
    const C = window.NABOU_CHART;
    if (!C) return null;
    const M = (y) => (Math.log(Math.tan(Math.PI / 4 + (y * Math.PI) / 360)) * 180) / Math.PI;
    return { x: (lon - C.lon0) * C.k, y: (C.my1 - M(lat)) * C.k };
  }
  function ensureLayer() {
    const plane = document.getElementById("chartPlane");
    if (!plane) return null;
    let layer = document.getElementById(LAYER_ID);
    if (layer) return layer;
    layer = document.createElement("div");
    layer.id = LAYER_ID;
    layer.setAttribute("aria-hidden", "false");
    layer.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:4;";
    plane.appendChild(layer);
    return layer;
  }
  function clear() {
    const layer = document.getElementById(LAYER_ID);
    if (layer) layer.innerHTML = "";
  }
  function setFactPins(places) {
    const layer = ensureLayer();
    if (!layer) return;
    clear();
    const rows = Array.isArray(places) ? places : [];
    for (const place of rows) {
      if (!place || place.status !== "RESOLVED") continue;
      const lon = Number(place.lon),
        lat = Number(place.lat);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const xy = project(lon, lat);
      if (!xy) continue;
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "nabou-fact-pin";
      pin.style.cssText =
        "position:absolute;left:" +
        xy.x +
        "px;top:" +
        xy.y +
        "px;transform:translate(-50%,-100%);pointer-events:auto;border:0;background:transparent;padding:0;cursor:pointer;";
      pin.title = String(place.label || place.surface || "Τόπος ευρήματος");
      pin.setAttribute("aria-label", "Τόπος από αποδεκτό εύρημα: " + pin.title);
      pin.innerHTML =
        '<span style="display:block;width:14px;height:14px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#8e231b;border:2px solid #f6e2a4;box-shadow:0 0 0 1px #3a0c09;"></span>' +
        '<span style="display:block;margin-top:4px;transform:translateX(-50%);margin-left:7px;font:600 11px/1.2 Georgia,serif;color:#3a0c09;background:rgba(246,226,164,.92);padding:2px 5px;border-radius:3px;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;">' +
        String(place.label || place.surface || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;") +
        "</span>";
      layer.appendChild(pin);
    }
  }
  function fromSnapshot(snapshot) {
    const places = snapshot?.research_answer?.greek_narrative?.map_places || [];
    setFactPins(places);
  }
  window.NABOU_FACT_PINS = { setFactPins, clear, fromSnapshot };
  window.addEventListener("jarvis:snapshot", (e) => fromSnapshot(e.detail));
})();
