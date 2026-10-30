"use strict";
/* NABOU//X — optional real 3D view of the main nautical chart (additive).
   The 2D chart stays exactly as it is and is the default. This file never edits the locked renderer
   (chamber.js, nautical-chart.js, nautical-emblems.js, gpu-field.js). The 3D button (4th under zoom) opens a
   WebGL scene (map-3d-scene.js, three.js vendored in ./vendor/three) on top of the chart: real terrain relief
   (NOAA ETOPO1) draped with a raster of the same 2D chart, the same lanes, seals, emblems and ink routes.
   Nothing is downloaded or drawn for 3D until the button is pressed. Pressing it again returns to the
   untouched 2D chart. Camera in 3D: left drag = rotate/tilt, right drag or Shift+drag = pan,
   wheel/pinch or +/- = zoom, compass button = default view.
   Extension point for the ship (step 2): window.NABOU_MAP3D.addObject(objOrElement, { lon, lat, z }). */
(() => {
  const C = window.NABOU_CHART;
  const $ = (id) => document.getElementById(id);
  const view = $("chartView"), plane = $("chartPlane");
  const tools = document.querySelector("#chartView .nxs-3d-tools");
  if (!C || !view || !plane || !tools) return;
  const supported = (() => {
    try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch { return false; }
  })();
  const KEY = "nabou.map3d";
  let on = false, busy = false, host = null, scene = null, loading = null;
  const pending = [];

  const M = (lat) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
  const project = (lon, lat) => ({ x: (lon - C.lon0) * C.k, y: (C.my1 - M(lat)) * C.k });
  /* current 2D pan/zoom of the chart plane, as written by chamber.js (read-only) */
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
    btn.title = "Η τρισδιάστατη προβολή χρειάζεται WebGL, που δεν υπάρχει σε αυτόν τον browser · παραμένει ο χάρτης 2D";
    btn.setAttribute("aria-label", btn.title);
  }
  tools.appendChild(btn);
  function label() {
    const t = on ? "Προβολή 2D (επίπεδος χάρτης)" : "Προβολή 3D με πραγματικό ανάγλυφο · σύρσιμο: περιστροφή/κλίση · δεξί κλικ: μετακίνηση · ροδέλα: ζουμ";
    btn.title = t;
    btn.setAttribute("aria-label", t);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.querySelector(".map3d-tag").textContent = on ? "2D" : "3D";
  }

  function ensureScene() {
    if (scene) return Promise.resolve(scene);
    if (loading) return loading;
    host = document.createElement("div");
    host.className = "map3d-gl";
    host.tabIndex = 0;
    host.setAttribute("role", "application");
    host.setAttribute("aria-label", "Τρισδιάστατος χάρτης · βέλη: μετακίνηση · σύρσιμο: περιστροφή");
    host.innerHTML = '<div class="map3d-loading">Φόρτωση τρισδιάστατου χάρτη…</div>';
    view.insertBefore(host, tools);
    loading = import("./map-3d-scene.js")
      .then((mod) => mod.createScene(host, { view2d: planeView }))
      .then((s) => {
        scene = s;
        host.querySelector(".map3d-loading")?.remove();
        for (const p of pending.splice(0)) p.resolve(scene.addObject(p.obj, p.opts));
        // the ship sails the Book III (1577) voyage of Petros Lantzas, as told in the book (3D only)
        import("./map-3d-route.js").then((m) => m.addRoute(window.NABOU_MAP3D))
          .then((r) => { window.NABOU_MAP3D.route = r; })
          .catch((e) => {
            console.warn("map3d: route not loaded, ship stays at its sea spot", e);
            import("./map-3d-ship.js").then((m) => { window.NABOU_MAP3D.ship = m.addShip(window.NABOU_MAP3D); });
          });
        return s;
      })
      .catch((e) => { console.warn("map3d: could not start the 3D scene", e); loading = null; host?.remove(); host = null; throw e; });
    return loading;
  }

  async function set(next, persist = true) {
    if (!supported) next = false;
    if (next === on || busy) return;
    busy = true;
    on = next;
    label();
    try {
      if (on) {
        document.body.classList.add("nx-map3d");
        const s = await ensureScene();
        if (!on) return;
        host.classList.add("shown");
        await s.enter(true);
      } else if (scene) {
        await scene.leave(true);
        host.classList.remove("shown");
        scene.stop();
        document.body.classList.remove("nx-map3d");
      } else document.body.classList.remove("nx-map3d");
    } catch {
      on = false; label(); document.body.classList.remove("nx-map3d");
    } finally { busy = false; }
    if (persist) try { localStorage.setItem(KEY, on ? "1" : "0"); } catch {}
    dispatchEvent(new CustomEvent("nabou:map3d", { detail: { on } }));
  }
  btn.addEventListener("click", () => set(!on));

  /* the existing zoom / reset buttons drive the 3D camera while 3D is on (2D behaviour untouched otherwise) */
  const hijack = (id, fn) => $(id)?.addEventListener("click", (e) => { if (!on || !scene) return; e.stopImmediatePropagation(); e.preventDefault(); fn(); }, true);
  hijack("zoomIn", () => scene.zoom(1.35));
  hijack("zoomOut", () => scene.zoom(1 / 1.35));
  hijack("resetView", () => scene.home());

  window.NABOU_MAP3D = {
    get enabled() { return on; },
    get supported() { return supported; },
    get ready() { return !!scene; },
    whenReady: () => ensureScene(),
    set: (v) => set(!!v),
    /* camera({ tilt: degrees from straight down, rot: degrees around north, dist, lon, lat }) */
    camera: (c = {}) => (scene ? scene.camera3d(c) : null),
    project,
    groundAt: (lon, lat) => (scene ? scene.groundAt(lon, lat) : 0),
    get THREE() { return scene ? scene.THREE : null; },
    get scene() { return scene ? scene.scene : null; },
    /* obj: a THREE.Object3D (added to the scene) or an HTML element (pinned on screen above that spot).
       z = height above the ground in world units. Returns { move({lon,lat,z}), remove() }. */
    addObject(obj, opts = {}) {
      if (scene) return scene.addObject(obj, opts);
      let handle = null;
      const p = new Promise((resolve) => pending.push({ obj, opts, resolve })).then((h) => (handle = h));
      return { ready: p, move: (q) => p.then(() => handle.move(q)), remove: () => p.then(() => handle.remove()) };
    },
  };

  label();
  let want = null;
  const q = new URLSearchParams(location.search).get("map3d");
  if (q === "1" || q === "0") want = q === "1";
  else try { want = localStorage.getItem(KEY) === "1"; } catch {}
  if (want) set(true, q == null);
})();
