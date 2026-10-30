/* NABOU//X — Book III (1577) voyage of Petros Lantzas on the 3D main map (3D only; never drawn in 2D).
 * Data: assets/nautical/routes/lantzas-1577-book3.json, built by tools/build_lantzas_route_3d.py from
 * data.json (routes atlas-lantzas-corfu-ragusa-1577, recyVLMINuHGWSlyL, atlas-book3-candia-porto-kagio-1577).
 * This is the voyage AS TOLD IN THE BOOK (Βιβλίο Γ' της τριλογίας), not archival history.
 * The line stays on water: the build step keeps the data.json corridor and goes around land where the
 * terrain grid needs it; here every drawn sample is checked again against the terrain (groundAt < 0).
 * Only the port names are shown; all legs are drawn the same solid line (data fields such as "uncertain" stay in the JSON).
 * No side panel: only a small play / pause button sits with the map tools (3D only). The ship sails slowly and is
 * drawn large in open sea; near a harbour it shrinks just enough for the hull to stay on water. */
import { addShip } from "./map-3d-ship.js";

const SRC = "./assets/nautical/routes/lantzas-1577-book3.json";
const SPEED = 0.037;    // world units per second (the whole board is 18 wide) · slow: ~2.6 min for the whole voyage
const DWELL = 4;        // seconds of calm at each stop
const BIG = 3.4;        // ship scale in open sea (clearly visible at the whole-board view)
const SMALL = 0.12;     // smallest scale, only in narrow channels / harbours where a bigger hull would touch land
const ANCHOR = 1.2;     // the ship waits off each harbour, at the first spot on the leg where it fits at this scale
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
  let landSamples = 0;
  const legs = data.legs.map((leg) => {
    const pts = leg.line.map(([la, lo]) => w(la, lo));
    // gently rounded corners; if rounding would touch land anywhere, keep the straight polyline
    let curve = new T.CatmullRomCurve3(pts, false, "centripetal");
    const test = (c) => { let n = 0; for (let i = 0; i <= 600; i++) if (!wet(c.getPointAt(i / 600))) n++; return n; };
    if (test(curve)) { curve = new T.CurvePath(); for (let i = 1; i < pts.length; i++) curve.add(new T.LineCurve3(pts[i - 1], pts[i])); }
    landSamples += test(curve);
    const len = curve.getLength();
    group.add(new T.Mesh(new T.TubeGeometry(curve, Math.max(64, Math.round(len * 120)), R, 6, false), ink)); // all legs solid, one style
    return { ...leg, curve, len };
  });
  /* stops: only the port name is shown (no notes, numbers or pop-ups) */
  const stops = data.stops.map((s, i) => {
    const b = el("div", "map3d-stop");
    b.dataset.place = s.place;
    b.append(el("span", "map3d-stop-dot"), el("span", "map3d-stop-name", label(s)));
    api.addObject(b, { lon: s.lon, lat: s.lat, z: 0.02 });
    return { ...s, el: b };
  });

  /* only a small play / pause button among the map tools (shown only in 3D) */
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tools = document.querySelector("#chartView .nxs-3d-tools");
  const play = el("button", "map3d-route-play"); play.type = "button"; play.id = "map3dPlay";
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13M15.5 5.5v13" /></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5 18.5 12 8 18.5z" /></svg>';
  (tools || host).appendChild(play);

  /* the ship sails the legs in order, waits at each stop, then starts again from Corfu */
  const ship = addShip(api, { at: { lon: data.stops[0].lon, lat: data.stops[0].lat }, exact: true });
  /* largest scale (SMALL..BIG) at which the whole hull and its wake stay on water here */
  const HL = 0.095, HB = 0.046;   // half length / half beam of the model at scale 1 (0.161 x 0.066), with a margin
  let scale = BIG, snap = true;
  const probe = new T.Vector3();
  const FOOT = [[1, 0], [-1, 0], [1, 0.5], [1, -0.5], [-1, 0.5], [-1, -0.5], [0.8, 0.9], [0.8, -0.9], [-0.8, 0.9], [-0.8, -0.9], [0.6, 1], [0.6, -1], [-0.6, 1], [-0.6, -1], [0, 1], [0, -1], [0.3, 0], [-0.3, 0], [-1.6, 0], [-1.6, 0.5], [-1.6, -0.5]]; // hull + wake
  function fit(p, yaw) {
    const fx = Math.cos(yaw), fz = -Math.sin(yaw), sx = -fz, sz = fx;
    const ok = (k) => {
      for (const [a, b] of FOOT) {
        probe.set(p.x + (fx * a * HL + sx * b * HB) * k, 0, p.z + (fz * a * HL + sz * b * HB) * k);
        if (!wet(probe)) return false;
      }
      return true;
    };
    if (ok(BIG)) return BIG;
    if (!ok(SMALL)) return 0;
    let lo = SMALL, hi = BIG;
    for (let i = 0; i < 7; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
    return lo;
  }
  // where the ship anchors off each harbour: the hull stays on water there (the ink line still reaches the port)
  for (const l of legs) {
    const at = (u) => { const p = l.curve.getPointAt(u), q = l.curve.getPointAt(Math.min(1, u + 0.002)); return fit(p, Math.atan2(-(q.z - p.z), q.x - p.x)); };
    // first spot that fits at ANCHOR scale; if none in the first / last third, the roomiest spot there
    const pick = (from, to, step) => { let best = from, bk = -1; for (let u = from; step > 0 ? u <= to : u >= to; u += step) { const k = at(Math.min(0.998, u)); if (k >= ANCHOR) return u; if (k > bk) { bk = k; best = u; } } return best; };
    l.u0 = pick(0, 0.35, 0.005); l.u1 = pick(1, 0.65, -0.005);
    l.sail = l.len * (l.u1 - l.u0);
  }
  const total = legs.reduce((a, l) => a + l.sail / SPEED + DWELL, 0) + DWELL;
  let t = 0, playing = !reduce, last = performance.now();
  const setBtn = () => {
    play.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    const t = playing ? "Παύση πλοίου" : "Πλεύση πλοίου";
    play.title = t; play.setAttribute("aria-label", t);
  };
  play.addEventListener("click", () => { playing = !playing; last = performance.now(); setBtn(); });
  setBtn();
  const tmp = new T.Vector3();
  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const DIP = 0.7; // seconds: the ship shrinks into the harbour and comes out again where the next leg leaves
  function place() {
    let r = t % total;
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i], d = l.sail / SPEED;
      if (r <= DWELL) {
        if (i === 0) { pose(l, l.u0, 0.002, smooth(r / DIP)); return; }
        const p = legs[i - 1], half = DWELL / 2, dip = smooth(Math.abs(r - half) / DIP);
        if (r < half) pose(p, p.u1, -0.002, dip); else pose(l, l.u0, 0.002, dip);
        return;
      }
      r -= DWELL;
      if (r <= d) { const f = r / d, e = f * f * (3 - 2 * f); pose(l, l.u0 + (l.u1 - l.u0) * (0.25 * e + 0.75 * f), 0.002, 1); return; } // eases out of / into the stops
      r -= d;
    }
    const L = legs[legs.length - 1]; pose(L, L.u1, -0.002, smooth((DWELL - r) / DIP));
  }
  function pose(l, u, du, dip = 1) {
    const p = l.curve.getPointAt(Math.min(1, Math.max(0, u)));
    const q = l.curve.getPointAt(Math.min(1, Math.max(0, u + du)));
    if (du < 0) tmp.subVectors(p, q); else tmp.subVectors(q, p);
    ship.object.position.set(p.x, 0, p.z);
    if (tmp.lengthSq() > 1e-12) ship.object.rotation.y = Math.atan2(-tmp.z, tmp.x);
    const k = fit(p, ship.object.rotation.y);
    scale = snap || dip < 0.05 ? k : scale + (k - scale) * 0.08; snap = false;
    ship.object.scale.setScalar(Math.max(1e-3, scale * dip));
    ship.object.visible = scale * dip > 0.01;
  }
  if (ship) {
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
    seek(frac) { t = Math.max(0, Math.min(0.9999, frac)) * total; snap = true; place(); },
    get scale() { return scale; },
  };
}
