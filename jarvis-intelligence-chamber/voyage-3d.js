/* NABOU//X — 3D voyage preview (separate page, no change to the 2D chamber).
 *
 * Land and sea come from the generated Natural Earth chart (window.NABOU_CHART,
 * read-only, same Mercator lon/lat window as the 2D map). Voyage legs come only
 * from data/voyages/voyages.v1.json and their coordinates only from the gazetteer.
 * The ship moves only on legs with review_status USER_APPROVED. When there are
 * none, a clearly labelled DEMO route between arbitrary sea points (Δ1–Δ3) is
 * shown instead; it is not historical data and lives only in this file.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const C = window.NABOU_CHART;
const VOYAGES_URL = "../data/voyages/voyages.v1.json";
const GAZETTEER_URL = "../data/gazetteer/mediterranean_gazetteer.v1.json";
const SCALE = 0.1;            // chart px -> world units
const SEA_Y = 0;
const params = new URLSearchParams(location.search);

/* Arbitrary open-sea test points. NOT places, NOT a historical route. */
const DEMO_POINTS = {
  D1: { label: "Δ1", lon: 18.5, lat: 37.8 },
  D2: { label: "Δ2", lon: 22.3, lat: 35.7 },
  D3: { label: "Δ3", lon: 25.3, lat: 35.95 },
};
const DEMO_LEGS = [
  { from: "D1", to: "D2", certainty: "STATED" },
  { from: "D2", to: "D3", certainty: "UNCERTAIN" },
];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const state = { mode: "loading", approvedLegs: 0, pendingLegs: 0, drawnLegs: 0 };
window.__v3d = state;

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

/* ---------- projection (same Mercator as tools/build_chart.py / chamber.js) ---------- */
const M = (lat) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
const projectPx = (lon, lat) => ({ x: (lon - C.lon0) * C.k, y: (C.my1 - M(lat)) * C.k });
const toWorld = (lon, lat, y = SEA_Y) => {
  const p = projectPx(lon, lat);
  return new THREE.Vector3((p.x - C.W / 2) * SCALE, y, (p.y - C.H / 2) * SCALE);
};

function landPath() {
  const m = C.svg.match(/<path id="landP" d="([^"]+)"/);
  return m ? new Path2D(m[1]) : null;
}

function buildLandCanvases(path) {
  // Height mask (low resolution) and colour texture (high resolution).
  const mw = 600, mh = Math.round((C.H / C.W) * mw);
  const mask = document.createElement("canvas");
  mask.width = mw; mask.height = mh;
  const m = mask.getContext("2d");
  m.fillStyle = "#000"; m.fillRect(0, 0, mw, mh);
  m.save(); m.scale(mw / C.W, mh / C.H); m.fillStyle = "#fff"; m.fill(path); m.restore();
  const blur = document.createElement("canvas");
  blur.width = mw; blur.height = mh;
  const b = blur.getContext("2d");
  b.filter = "blur(5px)"; b.drawImage(mask, 0, 0);

  const tw = 2400, th = Math.round((C.H / C.W) * tw);
  const tex = document.createElement("canvas");
  tex.width = tw; tex.height = th;
  const t = tex.getContext("2d");
  const g = t.createLinearGradient(0, 0, 0, th);
  g.addColorStop(0, "#1d4a5e"); g.addColorStop(1, "#14394b");
  t.fillStyle = g; t.fillRect(0, 0, tw, th);
  t.save(); t.scale(tw / C.W, th / C.H);
  // graticule every 5 degrees
  t.strokeStyle = "rgba(241,230,204,0.16)"; t.lineWidth = 1;
  for (let lon = -20; lon <= 40; lon += 5) { const a = projectPx(lon, C.lat0), z = projectPx(lon, C.lat1); t.beginPath(); t.moveTo(a.x, a.y); t.lineTo(z.x, z.y); t.stroke(); }
  for (let lat = 30; lat <= 55; lat += 5) { const a = projectPx(C.lon0, lat), z = projectPx(C.lon1, lat); t.beginPath(); t.moveTo(a.x, a.y); t.lineTo(z.x, z.y); t.stroke(); }
  t.fillStyle = "#cdb98a"; t.fill(path);
  t.strokeStyle = "#5b4426"; t.lineWidth = 1.2; t.stroke(path);
  t.restore();
  return { mask: m.getImageData(0, 0, mw, mh), blur: b.getImageData(0, 0, mw, mh), mw, mh, tex };
}

function buildTerrain(land) {
  const w = C.W * SCALE, h = C.H * SCALE;
  const sx = 360, sz = Math.round((C.H / C.W) * sx);
  const geo = new THREE.PlaneGeometry(w, h, sx, sz);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + w / 2) / w, v = (pos.getZ(i) + h / 2) / h;
    const px = Math.min(land.mw - 1, Math.max(0, Math.round(u * (land.mw - 1))));
    const py = Math.min(land.mh - 1, Math.max(0, Math.round(v * (land.mh - 1))));
    const k = (py * land.mw + px) * 4;
    const onLand = land.mask.data[k] > 127;
    const relief = land.blur.data[k] / 255;
    // Schematic relief: rises with distance from the coast. Not real elevation.
    pos.setY(i, onLand ? 0.18 + Math.max(0, relief - 0.5) * 4.2 : -0.12);
  }
  geo.computeVertexNormals();
  const map = new THREE.CanvasTexture(land.tex);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 }));
}

function buildShip() {
  const ship = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-0.9, -0.28); hullShape.lineTo(0.55, -0.28); hullShape.quadraticCurveTo(1.0, -0.15, 1.15, 0);
  hullShape.quadraticCurveTo(1.0, 0.15, 0.55, 0.28); hullShape.lineTo(-0.9, 0.28); hullShape.lineTo(-0.9, -0.28);
  const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 0.32, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
  hullGeo.rotateX(-Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.8 }));
  ship.add(hull);
  const wood = new THREE.MeshStandardMaterial({ color: 0x3b2614 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf2e8cf, side: THREE.DoubleSide, roughness: 1 });
  [[0.35, 1.5], [-0.35, 1.25]].forEach(([x, hgt]) => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, hgt, 6), wood);
    mast.position.set(x, 0.32 + hgt / 2, 0); ship.add(mast);
    const sailGeo = new THREE.PlaneGeometry(0.62, hgt * 0.62, 6, 4);
    const sp = sailGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) { const zz = sp.getX(i); sp.setZ(i, 0.12 * Math.cos((zz / 0.62) * Math.PI)); }
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.rotation.y = Math.PI / 2;           // sail spans the beam, billows forward
    sail.position.set(x + 0.06, 0.32 + hgt * 0.55, 0); ship.add(sail);
  });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.14), new THREE.MeshBasicMaterial({ color: 0xa3261b, side: THREE.DoubleSide }));
  flag.position.set(0.21, 0.32 + 1.5 - 0.07, 0); ship.add(flag);
  ship.scale.setScalar(2.1);
  return ship;
}

function legCurve(a, b) {
  const lift = 0.6 + a.distanceTo(b) * 0.04;
  const mid = a.clone().add(b).multiplyScalar(0.5); mid.y = lift * 2;
  const A = a.clone(), B = b.clone(); A.y = 0.5; B.y = 0.5;
  return new THREE.QuadraticBezierCurve3(A, mid, B);
}

function buildLegMesh(curve, certainty, color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color });
  if (certainty === "UNCERTAIN") {
    const n = 22;
    for (let i = 0; i < n; i += 2) {
      const pts = [];
      for (let j = 0; j <= 4; j++) pts.push(curve.getPoint((i + j / 4) / n));
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.11, 6), mat));
    }
  } else {
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.11, 6), mat));
  }
  const hit = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.7, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  group.add(hit);
  return { group, hit };
}

function portMarker(color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 16), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
  return m;
}

function showInfo(html) {
  const box = $("v3d-info");
  box.querySelector(".body").innerHTML = html;
  box.hidden = false;
}

function legInfoHtml(leg) {
  if (leg.demo) {
    return `<h3>Δοκιμαστική διαδρομή</h3><p class="warn">Όχι ιστορικό δεδομένο. Δεν υπάρχει πηγή.</p>
      <p>Τα σημεία ${esc(leg.fromLabel)} και ${esc(leg.toLabel)} είναι τυχαία σημεία στη θάλασσα, μόνο για να δοκιμαστεί η εικόνα.</p>
      <p>Εμφάνιση: ${leg.certainty === "UNCERTAIN" ? "διακεκομμένη (δείγμα «αβέβαιο»)" : "συνεχής (δείγμα «ρητό»)"}.</p>`;
  }
  const c = leg.citation || {};
  return `<h3>${esc(leg.from.name_in_source)} → ${esc(leg.to.name_in_source)}</h3>
    ${leg.certainty === "UNCERTAIN" ? '<p class="warn">Αβέβαιο σκέλος</p>' : ""}
    <dl>
      <dt>Χρονιά</dt><dd>${esc(leg.date_in_source || "— (δεν αναφέρεται)")}</dd>
      <dt>Πηγή</dt><dd>${esc(c.title)}</dd>
      <dt>Σελίδα</dt><dd>${esc(c.page)}</dd>
      <dt>Σύνδεσμος</dt><dd>${/^https?:\/\//.test(c.url || "") ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">άνοιγμα</a>` : esc(c.url)}</dd>
      <dt>run_id</dt><dd>${esc(leg.run_id)}</dd>
      <dt>claim_id</dt><dd>${esc((leg.claim_ids || []).join(", "))}</dd>
    </dl>
    <blockquote>${esc(c.quote)}</blockquote>
    <p>Η γραμμή είναι σχηματική, όχι η πραγματική πορεία.</p>`;
}

function portInfoHtml(port) {
  if (port.demo) return `<h3>${esc(port.label)}</h3><p class="warn">Δοκιμαστικό σημείο — όχι τόπος, όχι ιστορικό δεδομένο.</p>`;
  const p = port.place;
  return `<h3>${esc([...port.names].join(" / "))}</h3>
    <dl>
      <dt>Σήμερα</dt><dd>${esc(p.modern_name?.el || p.modern_name?.en || "")}</dd>
      <dt>Wikidata</dt><dd><a href="https://www.wikidata.org/wiki/${esc(p.wikidata)}" target="_blank" rel="noopener">${esc(p.wikidata)}</a></dd>
      <dt>Συντεταγμένες</dt><dd>${esc(p.coordinates?.source || "")}</dd>
    </dl>`;
}

async function loadJson(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}

async function collectLegs() {
  const legs = [];
  let voyages = { voyages: [] }, gaz = { places: [] };
  try { voyages = await loadJson(VOYAGES_URL); } catch (e) { console.warn("voyages", e); }
  const all = (voyages.voyages || []).flatMap((v) => (v.legs || []).map((l) => ({ ...l, voyage_id: v.voyage_id })));
  const approved = all.filter((l) => l.review_status === "USER_APPROVED");
  state.pendingLegs = all.length - approved.length;
  if (approved.length) {
    try { gaz = await loadJson(GAZETTEER_URL); } catch (e) { console.warn("gazetteer", e); }
    const byId = new Map((gaz.places || []).map((p) => [p.id, p]));
    for (const l of approved) {
      const pa = byId.get(l.from?.gazetteer_id), pb = byId.get(l.to?.gazetteer_id);
      if (!pa?.coordinates || !pb?.coordinates || !l.citation?.quote) continue; // never draw an unresolved or uncited leg
      legs.push({ ...l, a: pa, b: pb });
    }
  }
  state.approvedLegs = legs.length;
  return legs;
}

async function main() {
  if (!C || !hasWebGL()) { $("v3d-nogl").hidden = false; state.mode = "no-webgl"; window.__v3dReady = true; return; }
  const stage = $("v3d-stage");
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1a24);
  scene.fog = new THREE.Fog(0x0b1a24, 140, 320);
  scene.add(new THREE.HemisphereLight(0xfff4dc, 0x203040, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-60, 80, -40); scene.add(sun);

  const path = landPath();
  if (path) scene.add(buildTerrain(buildLandCanvases(path)));

  const camera = new THREE.PerspectiveCamera(40, stage.clientWidth / stage.clientHeight, 0.5, 1000);
  const focus = toWorld(21.5, 37.2);
  camera.position.set(focus.x - 4, 42, focus.z + 46);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(focus);
  controls.enableDamping = true;
  controls.maxPolarAngle = 1.32; controls.minDistance = 8; controls.maxDistance = 170;
  controls.update();

  const realLegs = await collectLegs();
  const demo = realLegs.length === 0 && params.get("demo") !== "0";
  state.mode = realLegs.length ? "approved" : demo ? "demo" : "empty";

  const legs = [];
  const ports = new Map();
  const addPort = (key, vec, info) => {
    if (!ports.has(key)) ports.set(key, { vec, ...info, names: new Set() });
    return ports.get(key);
  };
  if (realLegs.length) {
    for (const l of realLegs) {
      const a = toWorld(l.a.coordinates.lon, l.a.coordinates.lat), b = toWorld(l.b.coordinates.lon, l.b.coordinates.lat);
      addPort(l.a.id, a, { place: l.a, label: l.from.name_in_source }).names.add(l.from.name_in_source);
      addPort(l.b.id, b, { place: l.b, label: l.to.name_in_source }).names.add(l.to.name_in_source);
      legs.push({ ...l, va: a, vb: b });
    }
  } else if (demo) {
    $("v3d-demo").hidden = false;
    for (const d of DEMO_LEGS) {
      const A = DEMO_POINTS[d.from], B = DEMO_POINTS[d.to];
      const a = toWorld(A.lon, A.lat), b = toWorld(B.lon, B.lat);
      addPort(d.from, a, { demo: true, label: A.label });
      addPort(d.to, b, { demo: true, label: B.label });
      legs.push({ demo: true, certainty: d.certainty, fromLabel: A.label, toLabel: B.label, va: a, vb: b });
    }
  }
  state.drawnLegs = legs.length;

  const hits = [];
  const legColor = demo ? 0xff7a5c : 0xe8b04a;
  for (const leg of legs) {
    leg.curve = legCurve(leg.va, leg.vb);
    const { group, hit } = buildLegMesh(leg.curve, leg.certainty, legColor);
    hit.userData = { kind: "leg", leg };
    scene.add(group); hits.push(hit);
  }
  const labels = [];
  for (const port of ports.values()) {
    const m = portMarker(demo ? 0xff7a5c : 0xffd27a);
    m.position.copy(port.vec); m.position.y = 0.45;
    m.userData = { kind: "port", port };
    scene.add(m); hits.push(m);
    const el = document.createElement("div");
    el.className = "v3d-label"; el.textContent = port.label + (demo ? " (ΔΟΚΙΜΗ)" : "");
    document.body.appendChild(el); labels.push({ el, vec: port.vec.clone().setY(1.2) });
  }

  let ship = null, shipLabel = null;
  if (legs.length) {
    ship = buildShip(); scene.add(ship);
    shipLabel = document.createElement("div");
    shipLabel.className = "v3d-label"; document.body.appendChild(shipLabel);
  }

  const total = legs.reduce((s, l) => s + l.va.distanceTo(l.vb), 0);
  const status = [`Εγκεκριμένα σκέλη με πηγή: ${state.approvedLegs}`, `Σε αναμονή ελέγχου: ${state.pendingLegs}`];
  if (demo) status.push("Δείχνεται δοκιμαστική διαδρομή (όχι ιστορική).");
  else if (!legs.length) status.push("Καμία διαδρομή για εμφάνιση.");
  $("v3d-status").textContent = status.join(" · ");

  /* ---------- picking ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(hits, false)[0];
    if (!hit) return;
    const u = hit.object.userData;
    showInfo(u.kind === "leg" ? legInfoHtml(u.leg) : portInfoHtml(u.port));
  });
  $("v3d-info").querySelector(".close").addEventListener("click", () => { $("v3d-info").hidden = true; });

  addEventListener("resize", () => {
    camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix();
    renderer.setSize(stage.clientWidth, stage.clientHeight);
  });

  /* ---------- animation ---------- */
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const speed = reduce ? 1.5 : 4;          // world units per second
  const clock = { t0: performance.now() / 1000, last: performance.now() / 1000, elapsedTime: 0,
    getDelta() { const n = performance.now() / 1000, d = n - this.last; this.last = n; this.elapsedTime = n - this.t0; return d; } };
  let travelled = 0;
  const tmp = new THREE.Vector3();
  const placeLabel = (el, v) => {
    tmp.copy(v).project(camera);
    const visible = tmp.z < 1;
    el.style.display = visible ? "" : "none";
    el.style.left = ((tmp.x + 1) / 2) * stage.clientWidth + "px";
    el.style.top = ((1 - tmp.y) / 2) * stage.clientHeight + "px";
  };
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    controls.update();
    if (ship && total > 0) {
      travelled = (travelled + dt * speed) % total;
      let d = travelled, leg = legs[0];
      for (const l of legs) { const len = l.va.distanceTo(l.vb); if (d <= len) { leg = l; break; } d -= len; }
      const t = Math.min(1, d / Math.max(1e-6, leg.va.distanceTo(leg.vb)));
      const p = leg.curve.getPoint(t), q = leg.curve.getPoint(Math.min(1, t + 0.01));
      const ahead = t >= 0.99 ? leg.curve.getPoint(1).sub(leg.curve.getPoint(0.98)) : q.sub(p);
      ship.position.set(p.x, SEA_Y + 0.05 + Math.sin(clock.elapsedTime * 2) * 0.04, p.z);
      ship.rotation.set(0, Math.atan2(-ahead.z, ahead.x), Math.sin(clock.elapsedTime * 1.6) * 0.05);
      shipLabel.textContent = (leg.demo ? "ΔΟΚΙΜΗ" : "") + (leg.certainty === "UNCERTAIN" ? (leg.demo ? " · " : "") + "αβέβαιο" : "");
      shipLabel.style.visibility = shipLabel.textContent ? "visible" : "hidden";
      placeLabel(shipLabel, ship.position.clone().setY(3));
    }
    for (const l of labels) placeLabel(l.el, l.vec);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
  window.__v3dReady = true;
}

main().catch((e) => { console.error(e); $("v3d-status").textContent = "Σφάλμα φόρτωσης: " + e.message; window.__v3dReady = true; });
