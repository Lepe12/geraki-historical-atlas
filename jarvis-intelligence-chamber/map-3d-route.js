/* NABOU//X — Book III (1577) voyage of Petros Lantzas on the 3D main map (3D only; never drawn in 2D).
 * Data: assets/nautical/routes/lantzas-1577-book3.json, built by tools/build_lantzas_route_3d.py from
 * data.json (routes atlas-lantzas-corfu-ragusa-1577, recyVLMINuHGWSlyL, atlas-book3-candia-porto-kagio-1577).
 * This is the voyage AS TOLD IN THE BOOK (Βιβλίο Γ' της τριλογίας), not archival history.
 * The line stays on water: the build step keeps the data.json corridor and goes around land where the
 * terrain grid needs it; here every drawn sample is checked again against the terrain (groundAt < 0).
 * A leg recorded as a reconstruction (Corfu → Ragusa) is dashed and marked "αβέβαιο". No page numbers. */
import { addShip } from "./map-3d-ship.js";

const SRC = "./assets/nautical/routes/lantzas-1577-book3.json";
const BOOK = "Από το βιβλίο · Βιβλίο Γ' της τριλογίας (αφήγηση, όχι αρχειακή ιστορία)";
const SPEED = 0.2;      // world units per second (the whole board is 18 wide)
const DWELL = 1.6;      // seconds at each stop
const LINE_Y = 0.008, R = 0.011;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const label = (s) => s.atlasLabel || s.historicalNames || s.place;

export async function addRoute(api) {
  const T = api.THREE, scene = api.scene;
  const host = document.querySelector("#chartView .map3d-gl");
  if (!T || !scene || !host) return null;
  const data = await (await fetch(SRC)).json();
  const C = window.NABOU_CHART, S = 0.01;
  const w = (lat, lon) => { const p = api.project(lon, lat); return new T.Vector3((p.x - C.W / 2) * S, LINE_Y, (p.y - C.H / 2) * S); };
  const wet = (v) => api.groundAt((v.x / S + C.W / 2) / C.k + C.lon0, latOf(v.z / S + C.H / 2)) < 0;
  const latOf = (py) => { const m = C.my1 - py / C.k; return (2 * Math.atan(Math.exp((m * Math.PI) / 180)) - Math.PI / 2) * 180 / Math.PI; };

  const group = new T.Group(); group.name = "lantzas-route-1577"; scene.add(group);
  group.scale.y = 0.3; // flat ink ribbon lying on the water, so the ship rides over it
  const ink = new T.MeshStandardMaterial({ color: 0x8c1c14, emissive: 0x3a0806, roughness: 0.6 });
  const inkPale = new T.MeshStandardMaterial({ color: 0x3b2410, emissive: 0x1a0f05, roughness: 0.6 });
  let landSamples = 0;
  const legs = data.legs.map((leg) => {
    const pts = leg.line.map(([la, lo]) => w(la, lo));
    // gently rounded corners; if rounding would touch land anywhere, keep the straight polyline
    let curve = new T.CatmullRomCurve3(pts, false, "centripetal");
    const test = (c) => { let n = 0; for (let i = 0; i <= 600; i++) if (!wet(c.getPointAt(i / 600))) n++; return n; };
    if (test(curve)) { curve = new T.CurvePath(); for (let i = 1; i < pts.length; i++) curve.add(new T.LineCurve3(pts[i - 1], pts[i])); }
    landSamples += test(curve);
    const len = curve.getLength();
    if (leg.uncertain) {          // dashed
      const dash = 0.07, gap = 0.05;
      for (let s = 0; s < len; s += dash + gap) {
        const a = s / len, b = Math.min(len, s + dash) / len, sub = [];
        for (let i = 0; i <= 4; i++) sub.push(curve.getPointAt(a + (b - a) * i / 4));
        group.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(sub), 4, R, 6), inkPale));
      }
    } else group.add(new T.Mesh(new T.TubeGeometry(curve, Math.max(64, Math.round(len * 120)), R, 6, false), ink));
    return { ...leg, curve, len };
  });
  // 'αβέβαιο' on the uncertain leg
  for (const l of legs) if (l.uncertain) {
    const m = l.curve.getPointAt(0.5), tag = el("div", "map3d-route-tag", "αβέβαιο");
    tag.title = "Σκέλος που στο data.json είναι ανασύνθεση (STRONG RECONSTRUCTION), όχι ρητό ταξίδι";
    api.addObject(tag, { lon: (m.x / S + C.W / 2) / C.k + C.lon0, lat: latOf(m.z / S + C.H / 2), z: 0.03 });
  }

  /* stops: click shows place, year and the book label */
  const pop = el("div", "map3d-route-pop"); pop.hidden = true; host.appendChild(pop);
  const close = () => { pop.hidden = true; for (const b of host.querySelectorAll(".map3d-stop.open")) b.classList.remove("open"); };
  const stops = data.stops.map((s, i) => {
    const b = el("button", "map3d-stop" + (s.coordinateStatus === "NEEDS RESEARCH" ? " research" : ""));
    b.type = "button"; b.dataset.place = s.place;
    b.append(el("span", "map3d-stop-dot", String(i + 1)), el("span", "map3d-stop-name", label(s)));
    b.setAttribute("aria-label", `${label(s)} · ${s.year}`);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const was = b.classList.contains("open"); close(); if (was) return;
      pop.replaceChildren(el("b", "", label(s)), el("span", "map3d-pop-year", s.year), el("span", "map3d-pop-book", BOOK));
      if (s.coordinateStatus === "NEEDS RESEARCH") pop.append(el("span", "map3d-pop-flag", "Θέση: χρειάζεται έρευνα"));
      const x = el("button", "map3d-pop-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Κλείσιμο"); x.onclick = close; pop.append(x);
      const r = b.getBoundingClientRect(), h = host.getBoundingClientRect();
      pop.style.left = Math.max(8, Math.min(h.width - 270, r.left - h.left + r.width / 2 - 125)) + "px";
      pop.style.top = Math.max(8, r.top - h.top - 8) + "px";
      pop.hidden = false; b.classList.add("open");
    });
    api.addObject(b, { lon: s.lon, lat: s.lat, z: 0.02 });
    return { ...s, el: b };
  });
  host.addEventListener("pointerdown", (e) => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest(".map3d-stop")) close(); });

  /* panel: title, legend, play / pause */
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const panel = el("div", "map3d-route-panel");
  const play = el("button", "map3d-route-play"); play.type = "button";
  panel.append(el("b", "", "Πέτρος Λάντζας · 1577"), el("span", "map3d-route-src", "Διαδρομή από το βιβλίο (Βιβλίο Γ' της τριλογίας) · αφήγηση, όχι αρχειακή ιστορία"));
  const lg = el("span", "map3d-route-legend");
  lg.append(el("i", "solid"), document.createTextNode(" ταξίδι στο βιβλίο  "), el("i", "dash"), document.createTextNode(" αβέβαιο"));
  panel.append(lg, play);
  host.appendChild(panel);

  /* the ship sails the legs in order, waits at each stop, then starts again from Corfu */
  const ship = addShip(api, { at: { lon: data.stops[0].lon, lat: data.stops[0].lat }, exact: true });
  const total = legs.reduce((a, l) => a + l.len / SPEED + DWELL, 0) + DWELL;
  let t = 0, playing = !reduce, last = performance.now();
  const setBtn = () => { play.textContent = playing ? "❚❚ Παύση" : "▶ Πλεύση"; play.setAttribute("aria-pressed", String(playing)); };
  play.addEventListener("click", () => { playing = !playing; last = performance.now(); setBtn(); });
  setBtn();
  const tmp = new T.Vector3();
  function place() {
    let r = t % total;
    for (const l of legs) {
      const d = l.len / SPEED;
      if (r <= DWELL) { pose(l, 0, 0.002); return; }
      r -= DWELL;
      if (r <= d) { pose(l, r / d, 0.002); return; }
      r -= d;
    }
    pose(legs[legs.length - 1], 1, -0.002);
  }
  function pose(l, u, du) {
    const p = l.curve.getPointAt(Math.min(1, Math.max(0, u)));
    const q = l.curve.getPointAt(Math.min(1, Math.max(0, u + du)));
    if (du < 0) tmp.subVectors(p, q); else tmp.subVectors(q, p);
    ship.object.position.set(p.x, 0, p.z);
    if (tmp.lengthSq() > 1e-12) ship.object.rotation.y = Math.atan2(-tmp.z, tmp.x);
  }
  if (ship) {
    ship.object.scale.setScalar(0.7);
    place();
    group.children[0].onBeforeRender = () => {
      const now = performance.now();
      if (playing) t += Math.min(0.1, (now - last) / 1000);
      last = now; place();
    };
  }
  return {
    group, stops, legs, landSamples, total, ship,
    get playing() { return playing; },
    play() { playing = true; last = performance.now(); setBtn(); },
    pause() { playing = false; setBtn(); },
    seek(frac) { t = Math.max(0, Math.min(0.9999, frac)) * total; place(); },
  };
}
