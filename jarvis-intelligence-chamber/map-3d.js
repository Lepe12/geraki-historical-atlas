"use strict";
/* NABOU//X — optional 3D view of the main nautical chart (additive layer).
   The 2D chart stays exactly as it is and is the default. This file never edits the locked renderer
   (chamber.js, nautical-chart.js, nautical-emblems.js, gpu-field.js): when the user turns 3D on it only adds
   the class `nx-map3d` to <body>, tilts/rotates the existing chart layers with CSS 3D transforms, and adds a
   relief layer (extruded land) that follows the chart's pan/zoom. Turning 3D off removes all of it again.
   Camera: drag = pan, wheel/pinch/+/- = zoom (as in 2D); Shift+drag or right-drag = rotate/tilt;
   Shift+arrow keys = rotate/tilt; the compass "reset" button also resets the camera.
   Extension point for the next step (ship): window.NABOU_MAP3D.addObject(el, { lon, lat, z }). */
(() => {
  const C = window.NABOU_CHART;
  const $ = (id) => document.getElementById(id);
  const view = $("chartView"), stage = $("chartStage"), plane = $("chartPlane");
  const tools = document.querySelector("#chartView .nxs-3d-tools");
  if (!C || !view || !stage || !plane || !tools) return;
  const supported = !!(window.CSS && CSS.supports && CSS.supports("transform-style", "preserve-3d") && CSS.supports("perspective", "1px"));

  const DEF = { tilt: 48, rot: -6 };
  const LIM = { tiltMin: 0, tiltMax: 68 };
  const RELIEF_SLICES = 5, RELIEF_STEP = 1.6; // stage px per slice at chart scale 1 (scaled with zoom, capped)
  const KEY = "nabou.map3d";
  let on = false, tilt = DEF.tilt, rot = DEF.rot, relief = null, objects = null;
  const placed = new Set();

  /* ---------- projection (same Mercator as tools/build_chart.py and chamber.js) ---------- */
  const M = (lat) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
  const project = (lon, lat) => ({ x: (lon - C.lon0) * C.k, y: (C.my1 - M(lat)) * C.k });

  /* current 2D pan/zoom of the chart plane, as written by chamber.js */
  function planeView() {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(plane.style.transform || "");
    return m ? { x: +m[1], y: +m[2], s: +m[3] } : { x: 0, y: 0, s: 1 };
  }

  /* ---------- toggle button (appended to the existing map tools) ---------- */
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "map3dToggle";
  btn.className = "map3d-toggle";
  btn.setAttribute("aria-pressed", "false");
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 7.5v9L12 21 4 16.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></svg><span class="map3d-tag">3D</span>';
  if (!supported) {
    btn.disabled = true;
    btn.title = "Η τρισδιάστατη προβολή δεν υποστηρίζεται σε αυτόν τον browser · παραμένει ο χάρτης 2D";
    btn.setAttribute("aria-label", btn.title);
  }
  tools.appendChild(btn);
  function label() {
    const t = on ? "Προβολή 2D (επίπεδος χάρτης)" : "Προβολή 3D · Shift+σύρσιμο ή δεξί κλικ: περιστροφή/κλίση";
    btn.title = t;
    btn.setAttribute("aria-label", t);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.querySelector(".map3d-tag").textContent = on ? "2D" : "3D";
  }

  /* ---------- relief: stacked translucent copies of the land outline above the chart ---------- */
  function buildRelief() {
    const NS = "http://www.w3.org/2000/svg";
    relief = document.createElement("div");
    relief.className = "map3d-relief";
    relief.setAttribute("aria-hidden", "true");
    for (let i = 1; i <= RELIEF_SLICES; i++) {
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", `0 0 ${C.W} ${C.H}`);
      svg.setAttribute("class", "map3d-slice" + (i === RELIEF_SLICES ? " top" : ""));
      svg.style.width = C.W + "px";
      svg.style.height = C.H + "px";
      svg.dataset.level = String(i);
      const use = document.createElementNS(NS, "use");
      use.setAttribute("href", "#landP");
      svg.appendChild(use);
      relief.appendChild(svg);
    }
    objects = document.createElement("div");
    objects.className = "map3d-objects";
    stage.appendChild(relief);
    stage.appendChild(objects);
  }
  const lift = (s) => Math.min(RELIEF_STEP * Math.max(s, 0.35), 4.5);
  function sync() {
    if (!on || !relief) return;
    const v = planeView(), step = lift(v.s);
    const base = `translate(${v.x.toFixed(2)}px,${v.y.toFixed(2)}px) scale(${v.s.toFixed(5)})`;
    for (const svg of relief.children) svg.style.transform = `translateZ(${(step * +svg.dataset.level).toFixed(2)}px) ${base}`;
    view.style.setProperty("--m3d-lift", (step * RELIEF_SLICES).toFixed(2) + "px");
    for (const o of placed) placeObject(o, v);
  }
  function apply() {
    view.style.setProperty("--m3d-tilt", tilt.toFixed(1) + "deg");
    view.style.setProperty("--m3d-rot", rot.toFixed(1) + "deg");
    // keep the tilted chart covering the frame: the far edge recedes, so zoom the camera in a little
    view.style.setProperty("--m3d-zoom", (1 + 0.42 * Math.sin((tilt * Math.PI) / 180) + 0.004 * Math.abs(rot)).toFixed(3));
    sync();
  }
  function set(next, persist = true) {
    if (!supported) next = false;
    if (next === on) return;
    on = next;
    if (on && !relief) buildRelief();
    document.body.classList.toggle("nx-map3d", on);
    if (!on) {
      for (const p of ["--m3d-tilt", "--m3d-rot", "--m3d-zoom", "--m3d-lift"]) view.style.removeProperty(p);
      if (relief) { relief.remove(); objects.remove(); relief = objects = null; placed.clear(); }
    } else apply();
    label();
    if (persist) try { localStorage.setItem(KEY, on ? "1" : "0"); } catch {}
    dispatchEvent(new CustomEvent("nabou:map3d", { detail: { on } }));
  }
  btn.addEventListener("click", () => set(!on));
  new MutationObserver(sync).observe(plane, { attributes: true, attributeFilter: ["style"] });
  $("resetView")?.addEventListener("click", () => { if (on) { tilt = DEF.tilt; rot = DEF.rot; apply(); } });

  /* ---------- screen <-> chart-stage mapping under the 3D camera (for zoom anchoring) ---------- */
  function homography() {
    // maps chart-stage local px to #chartView local px (the stage fills the view: inset 0)
    const cx = stage.offsetWidth / 2, cy = stage.offsetHeight / 2;
    const P = parseFloat(getComputedStyle(view).perspective) || 1400;
    const T = new DOMMatrix(getComputedStyle(stage).transform);
    const persp = new DOMMatrix(); persp.m34 = -1 / P;
    const full = new DOMMatrix().translate(cx, cy).multiply(persp).multiply(T).translate(-cx, -cy);
    return [[full.m11, full.m21, full.m41], [full.m12, full.m22, full.m42], [full.m14, full.m24, full.m44]];
  }
  function inv3(m) {
    const [[a, b, c], [d, e, f], [g, h, i]] = m;
    const A = e * i - f * h, B = -(d * i - f * g), Cc = d * h - e * g, det = a * A + b * B + c * Cc;
    if (!det) return null;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [Cc / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }
  /* client point -> the client point the 2D renderer would need to hit the same chart spot */
  function flatClient(x, y) {
    const H = inv3(homography());
    if (!H) return { x, y };
    const r = view.getBoundingClientRect(), k = r.width / (view.offsetWidth || 1) || 1; // page may be scaled
    const lx = (x - r.left) / k, ly = (y - r.top) / k;
    const w = H[2][0] * lx + H[2][1] * ly + H[2][2];
    const u = (H[0][0] * lx + H[0][1] * ly + H[0][2]) / w, v = (H[1][0] * lx + H[1][1] * ly + H[1][2]) / w;
    return { x: r.left + u * k, y: r.top + v * k };
  }
  let reissuing = false;
  stage.addEventListener("wheel", (e) => {
    if (!on || reissuing) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const p = flatClient(e.clientX, e.clientY);
    reissuing = true;
    stage.dispatchEvent(new WheelEvent("wheel", { deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, clientX: p.x, clientY: p.y, ctrlKey: e.ctrlKey, bubbles: true, cancelable: true }));
    reissuing = false;
  }, { capture: true, passive: false });
  stage.addEventListener("dblclick", (e) => {
    if (!on || reissuing || e.target.closest("button")) return;
    e.stopImmediatePropagation();
    const p = flatClient(e.clientX, e.clientY);
    reissuing = true;
    stage.dispatchEvent(new MouseEvent("dblclick", { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
    reissuing = false;
  }, true);

  /* ---------- camera: Shift+drag / right-drag rotates and tilts ---------- */
  let orbit = null;
  stage.addEventListener("pointerdown", (e) => {
    if (!on || !(e.shiftKey || e.button === 2) || e.target.closest("button")) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    orbit = { id: e.pointerId, x: e.clientX, y: e.clientY, tilt, rot };
    stage.setPointerCapture?.(e.pointerId);
  }, true);
  stage.addEventListener("pointermove", (e) => {
    if (!orbit || e.pointerId !== orbit.id) return;
    e.stopImmediatePropagation();
    rot = orbit.rot + (e.clientX - orbit.x) * 0.3;
    tilt = Math.max(LIM.tiltMin, Math.min(LIM.tiltMax, orbit.tilt - (e.clientY - orbit.y) * 0.25));
    apply();
  }, true);
  const endOrbit = (e) => { if (orbit && e.pointerId === orbit.id) { e.stopImmediatePropagation(); orbit = null; } };
  stage.addEventListener("pointerup", endOrbit, true);
  stage.addEventListener("pointercancel", endOrbit, true);
  stage.addEventListener("contextmenu", (e) => { if (on) e.preventDefault(); });
  stage.addEventListener("keydown", (e) => {
    if (!on || !e.shiftKey) return;
    const d = { ArrowLeft: [0, -5], ArrowRight: [0, 5], ArrowUp: [4, 0], ArrowDown: [-4, 0] }[e.key];
    if (!d) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    tilt = Math.max(LIM.tiltMin, Math.min(LIM.tiltMax, tilt + d[0]));
    rot += d[1];
    apply();
  }, true);

  /* ---------- extension point: objects standing on the 3D chart (e.g. the ship, step 2) ---------- */
  function placeObject(o, v = planeView()) {
    const p = project(o.lon, o.lat);
    o.el.style.transform = `translate(${(v.x + p.x * v.s).toFixed(2)}px,${(v.y + p.y * v.s).toFixed(2)}px) translateZ(${(o.z || 0).toFixed(2)}px)`;
  }
  window.NABOU_MAP3D = {
    get enabled() { return on; },
    get supported() { return supported; },
    set: (v) => set(!!v),
    camera: (c = {}) => { if (c.tilt != null) tilt = Math.max(LIM.tiltMin, Math.min(LIM.tiltMax, +c.tilt)); if (c.rot != null) rot = +c.rot; if (on) apply(); return { tilt, rot }; },
    project,
    addObject(el, { lon, lat, z = 0 } = {}) {
      if (!on || !objects) return null;
      const o = { el, lon, lat, z };
      el.classList.add("map3d-object");
      objects.appendChild(el);
      placed.add(o);
      placeObject(o);
      return { move: (q) => { Object.assign(o, q); placeObject(o); }, remove: () => { placed.delete(o); el.remove(); } };
    },
  };

  label();
  let want = null;
  const q = new URLSearchParams(location.search).get("map3d");
  if (q === "1" || q === "0") want = q === "1";
  else try { want = localStorage.getItem(KEY) === "1"; } catch {}
  if (want) set(true, q == null);
})();
