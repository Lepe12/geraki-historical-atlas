/* NABOU//X — WebGL 3D scene for the optional 3D view of the main map (loaded only when 3D is turned on).
 * Terrain: real elevation (NOAA ETOPO1, public domain) from assets/nautical/terrain/mediterranean-elevation.png,
 * on the same Mercator window as the 2D chart. Surface: a raster of the existing 2D chart SVG (read-only copy of
 * the live <svg class="chart">), so the 3D board wears exactly the 2D chart's look. Lanes, seals, emblems and ink
 * routes come from the same data the 2D map uses (window.NABOU_LANES, NABOU_CHART.core / .analysis); each lane
 * carries a waving period flag (c. 1577) drawn in code by map-3d-flags.js.
 * Nothing here writes to the 2D chart's DOM. three.js r184 is vendored in ./vendor/three (MIT). */
import * as THREE from "./vendor/three/three.module.min.js";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { makeFlag } from "./map-3d-flags.js";

const C = window.NABOU_CHART;
const S = 0.01;                 // chart px -> world units (board = 18 x 11.05)
const BW = C.W * S, BH = C.H * S;
const KM_PER_PX = 2.9;          // ~ground size of one chart px around 38-45 N
const EXAG = 34;                // vertical exaggeration of the relief (real scale would be invisible)
const LAND_Y = (m) => (m / (KM_PER_PX * 1000)) * EXAG * S;
const SEA_Y = (m) => -Math.min(m, 4500) / 4500 * 0.05; // gentle sea-floor dip, under translucent water
const BOARD = 0.32;             // thickness of the board below sea level
const DEF = { tilt: 56, rot: 0 };  // degrees from straight down / around north
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

const world = (px, py, y = 0) => new THREE.Vector3((px - C.W / 2) * S, y, (py - C.H / 2) * S);
const M = (lat) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
const project = (lon, lat) => ({ x: (lon - C.lon0) * C.k, y: (C.my1 - M(lat)) * C.k });

async function loadImage(src) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  return img;
}
async function dataURL(url) {
  const blob = await (await fetch(url)).blob();
  return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
}

/* ---------- heightmap ---------- */
async function loadHeights() {
  const img = await loadImage("./assets/nautical/terrain/mediterranean-elevation.png");
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data, n = img.width * img.height;
  const land = new Float32Array(n), sea = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] / 255, gg = d[i * 4 + 1] / 255;
    land[i] = r * r * 4000; sea[i] = gg * gg * 6000;
  }
  const gw = img.width, gh = img.height;
  const sample = (arr, px, py) => {
    const fx = Math.max(0, Math.min(gw - 1.001, px / C.W * gw - 0.5)), fy = Math.max(0, Math.min(gh - 1.001, py / C.H * gh - 0.5));
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, i = y0 * gw + x0;
    return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - ty) + (arr[i + gw] * (1 - tx) + arr[i + gw + 1] * tx) * ty;
  };
  return { gw, gh, land: (px, py) => sample(land, px, py), sea: (px, py) => sample(sea, px, py) };
}
const groundY = (H, px, py) => { const l = H.land(px, py); return l > 1 ? LAND_Y(l) : SEA_Y(H.sea(px, py)); };

/* ---------- surface texture: raster of the live 2D chart SVG (styles inlined, painted hills dropped) ---------- */
const PROPS = ["fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "display", "visibility", "mix-blend-mode", "filter", "font-family", "font-size", "font-style", "font-weight", "letter-spacing", "text-anchor"];
async function chartTexture(renderer) {
  const live = document.querySelector("#chartPlane svg.chart");
  const SC = Math.min(2, (renderer.capabilities.maxTextureSize || 4096) / C.W);
  const cv = document.createElement("canvas");
  cv.width = Math.round(C.W * SC); cv.height = Math.round(C.H * SC);
  const g = cv.getContext("2d");
  g.fillStyle = "#cdb888"; g.fillRect(0, 0, cv.width, cv.height);
  if (live) {
    const clone = live.cloneNode(true);
    const a = [live, ...live.querySelectorAll("*")], b = [clone, ...clone.querySelectorAll("*")];
    for (let i = 0; i < a.length; i++) {
      if (!(a[i] instanceof SVGElement) || a[i].closest("defs")) continue; // <use> targets must keep inheriting
      const cs = getComputedStyle(a[i]);
      b[i].setAttribute("style", PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";"));
    }
    clone.querySelectorAll(".mts").forEach((e) => e.remove()); // painted hill symbols: the real relief replaces them
    for (const im of clone.querySelectorAll("image")) {
      const href = im.getAttribute("href");
      if (href && !href.startsWith("data:")) try { im.setAttribute("href", await dataURL(new URL(href, location.href).href)); } catch {}
    }
    clone.setAttribute("width", cv.width); clone.setAttribute("height", cv.height);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    try { g.drawImage(await loadImage(url), 0, 0, cv.width, cv.height); } catch (e) { console.warn("map3d: chart raster failed", e); }
    URL.revokeObjectURL(url);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

function softDisc(inner, outer) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const g = cv.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export async function createScene(host, { view2d } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "map3d-canvas";
  host.appendChild(canvas);
  const pins = document.createElement("div");
  pins.className = "map3d-pins";
  host.appendChild(pins);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x140d07, 22, 48);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 200);

  const [H, tex] = await Promise.all([loadHeights(), chartTexture(renderer)]);

  /* terrain: one displaced grid sampled from the heightmap */
  const geo = new THREE.PlaneGeometry(BW, BH, Math.round(H.gw * 0.6), Math.round(H.gh * 0.6)); // ~3.3 chart px per cell
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i) / S + C.W / 2, py = pos.getZ(i) / S + C.H / 2;
    pos.setY(i, groundY(H, px, py));
  }
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.93, metalness: 0 }));
  terrain.castShadow = terrain.receiveShadow = true;
  scene.add(terrain);

  /* water: translucent sheet at sea level so the sea reads as water over a deeper floor */
  const water = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshStandardMaterial({ color: 0x4f6f78, transparent: true, opacity: 0.16, roughness: 0.25, metalness: 0.1, depthWrite: false }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.002;
  scene.add(water);

  /* the board: dark wooden slab with a brass trim, and a soft shadow on the table under it */
  const wood = new THREE.MeshStandardMaterial({ color: 0x3b2614, roughness: 0.8 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(BW + 0.24, BOARD, BH + 0.24), [wood, wood, new THREE.MeshStandardMaterial({ color: 0x2a190e }), wood, wood, wood]);
  slab.position.y = -0.052 - BOARD / 2; slab.receiveShadow = true;
  scene.add(slab);
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xb48d45, roughness: 0.35, metalness: 0.75 });
  for (const [w, d, x, z] of [[BW + 0.3, 0.06, 0, -BH / 2 - 0.12], [BW + 0.3, 0.06, 0, BH / 2 + 0.12], [0.06, BH + 0.3, -BW / 2 - 0.12, 0], [0.06, BH + 0.3, BW / 2 + 0.12, 0]]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), trimMat); t.position.set(x, 0.0, z); scene.add(t);
  }
  const table = new THREE.Mesh(new THREE.PlaneGeometry(BW * 2.2, BH * 2.6), new THREE.MeshBasicMaterial({ map: softDisc("rgba(0,0,0,.85)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false }));
  table.rotation.x = -Math.PI / 2; table.position.y = -BOARD - 0.25;
  scene.add(table);

  /* light: warm low sun from the north-west so slopes are shaded like a relief model */
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x2a1a0c, 0.95));
  const sun = new THREE.DirectionalLight(0xffe2b0, 2.6);
  sun.position.set(-9, 7, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 8, bottom: -8, near: 1, far: 40 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  /* ink routes: same pairs and same gentle arc as the 2D chart, draped over the relief */
  const lanes = window.NABOU_LANES || [];
  const core = { x: C.core[0], y: C.core[1] }, hub = { x: C.analysis[0], y: C.analysis[1] };
  const arc = (a, b, q) => { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, cx = mx - dy * 0.12, cy = my + dx * 0.12, u = 1 - q; return { x: u * u * a.x + 2 * u * q * cx + q * q * b.x, y: u * u * a.y + 2 * u * q * cy + q * q * b.y }; };
  const routeMat = new THREE.LineDashedMaterial({ color: 0x2a190e, dashSize: 0.09, gapSize: 0.07, transparent: true, opacity: 0.8 });
  const routeLines = [];
  const pairs = lanes.map((l) => [l, l.kind === "archive" ? core : hub]).concat([[hub, core]]);
  for (const [a, b] of pairs) {
    const pts = [];
    for (let i = 0; i <= 96; i++) { const p = arc(a, b, i / 96); pts.push(world(p.x, p.y, Math.max(0, groundY(H, p.x, p.y)) + 0.025)); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), routeMat.clone());
    line.computeLineDistances();
    line.userData.agentId = a.agentId;
    scene.add(line); routeLines.push(line);
  }

  /* lanes: wax seal on the ground, a flag pole with a period flag (c. 1577, drawn in map-3d-flags.js) waving
     on it, turned towards the camera so it reads from any angle, and the name above it */
  const POLE = 0.42;
  const shadowTex = softDisc("rgba(20,10,4,.55)", "rgba(20,10,4,0)");
  const markers = [];
  const pinsFor = (lane) => {
    const seal = [...document.querySelectorAll("#nodeSeals .node-seal")].find((e) => e.dataset.agent === lane.agentId);
    const label = [...document.querySelectorAll("#nodeLabels .node-label")].find((e) => e.dataset.emblem === lane.agentId);
    return { seal, label };
  };
  for (const lane of lanes) {
    const gy = Math.max(0, groundY(H, lane.x, lane.y));
    const base = world(lane.x, lane.y, gy), top = world(lane.x, lane.y, gy + POLE + 0.03);
    const flag = makeFlag(THREE, renderer, lane.agentId, { pole: POLE });
    flag.group.position.copy(base); scene.add(flag.group);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.copy(base).add(new THREE.Vector3(0.05, 0.006, 0.04)); scene.add(sh);
    const el = document.createElement("button");
    el.type = "button"; el.className = "map3d-pin " + lane.kind; el.dataset.agent = lane.agentId;
    el.innerHTML = '<span class="map3d-flag"></span><span class="map3d-name"></span>';
    const sealEl = document.createElement("span"); sealEl.className = "map3d-seal";
    pins.appendChild(sealEl); pins.appendChild(el);
    const src = pinsFor(lane);
    el.addEventListener("click", () => src.label?.click());
    sealEl.addEventListener("click", () => src.seal?.click());
    flag.cloth.userData.open = () => src.label?.click();
    el.dataset.flag = flag.info.title;
    markers.push({ lane, base, top, el, sealEl, src, sig: "", flag });
  }
  const refreshPins = () => {
    for (const m of markers) {
      const { seal, label } = m.src;
      const sig = (seal?.outerHTML.length || 0) + "|" + (seal?.dataset.state || "") + (seal?.dataset.activity || "") + "|" + (label?.className || "") + (label?.dataset.state || "");
      if (sig === m.sig) continue;
      m.sig = sig;
      m.el.querySelector(".map3d-flag").innerHTML = ""; // the 3D flag on the pole replaces the 2D emblem
      m.el.querySelector(".map3d-name").textContent = label?.querySelector(".nl-name")?.textContent || m.lane.name;
      m.el.setAttribute("aria-label", label?.getAttribute("aria-label") || m.lane.name);
      m.el.dataset.state = label?.dataset.state || "";
      m.el.classList.toggle("active", !!label?.classList.contains("active"));
      m.sealEl.innerHTML = seal ? seal.innerHTML : "";
      m.sealEl.dataset.state = seal?.dataset.state || "";
      m.sealEl.dataset.activity = seal?.dataset.activity || "";
      m.sealEl.className = "map3d-seal " + m.lane.kind;
      const line = routeLines.find((l) => l.userData.agentId === m.lane.agentId);
      if (line) { const act = seal?.dataset.activity === "active"; line.material.color.set(act ? 0x8c1c14 : 0x2a190e); line.material.opacity = act ? 0.95 : 0.8; }
    }
  };
  refreshPins();
  const pinTimer = setInterval(refreshPins, 1000);

  /* click on a 3D flag = click on its lane name (opens the same panel) */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(markers.map((m) => m.flag.cloth), false)[0];
    hit?.object.userData.open?.();
  });

  /* extra objects (the ship, step 2): THREE.Object3D placed in the scene, or an HTML element pinned like the lanes */
  const extras = new Set();
  function addObject(obj, { lon, lat, z = 0 } = {}) {
    const rec = { obj, lon, lat, z, html: !(obj && obj.isObject3D) };
    const place = () => {
      const p = project(rec.lon, rec.lat);
      rec.at = world(p.x, p.y, Math.max(0, groundY(H, p.x, p.y)) + (rec.z || 0));
      if (!rec.html) obj.position.copy(rec.at);
    };
    place();
    if (rec.html) { obj.classList.add("map3d-object"); pins.appendChild(obj); } else scene.add(obj);
    extras.add(rec);
    return { move: (q) => { Object.assign(rec, q); place(); }, remove: () => { extras.delete(rec); rec.html ? obj.remove() : scene.remove(obj); } };
  }

  /* camera: orbit like a model. Left drag = rotate/tilt, right drag (or Shift+drag) = pan, wheel/pinch = zoom */
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reduce; controls.dampingFactor = 0.08; // inertia after a drag
  controls.rotateSpeed = 0.4;                // slower, steadier rotation (default is 1)
  controls.screenSpacePanning = false;       // pan along the board, not up into the sky
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(80); // never at or below the board's edge
  controls.minDistance = 0.35; controls.maxDistance = 24;
  controls.zoomToCursor = false;             // zoom toward the view centre, so the pivot stays the visible centre
  controls.keys = { LEFT: "ArrowLeft", UP: "ArrowUp", RIGHT: "ArrowRight", BOTTOM: "ArrowDown" };
  controls.listenToKeyEvents(host);

  function size() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  size();
  const ro = new ResizeObserver(size); ro.observe(host);

  /* camera poses: "flat" = straight down over the same area the 2D map shows; "home" = tilted default */
  function flatPose() {
    const v = view2d ? view2d() : { x: 0, y: 0, s: 0.6 };
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    const cx = (w / 2 - v.x) / v.s, cy = (h / 2 - v.y) / v.s;
    const target = world(cx, cy, 0);
    const dist = ((h / v.s) * S / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return { target, dist: Math.min(controls.maxDistance, dist), tilt: 0.5, rot: 0 };
  }
  function homePose() {
    // the whole board, centred in the canvas: orbit target = board centre
    // distance: the nearest at which all four board corners are inside the view (binary search)
    const w = host.clientWidth || 1, h = host.clientHeight || 1, o = new THREE.Vector3(0, 0, 0);
    const probe = new THREE.PerspectiveCamera(camera.fov, w / h, 0.02, 400), q = new THREE.Vector3();
    const fits = (d) => {
      probe.position.setFromSpherical(new THREE.Spherical(d, THREE.MathUtils.degToRad(DEF.tilt), THREE.MathUtils.degToRad(-DEF.rot)));
      probe.lookAt(o); probe.updateMatrixWorld();
      for (const [x, z] of [[-BW / 2, -BH / 2], [BW / 2, -BH / 2], [BW / 2, BH / 2], [-BW / 2, BH / 2]]) {
        q.set(x, 0, z).project(probe);
        if (Math.abs(q.x) > 0.97 || Math.abs(q.y) > 0.97) return false;
      }
      return true;
    };
    let lo = 2, hi = controls.maxDistance;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
    return { target: o.clone(), dist: hi, tilt: DEF.tilt, rot: DEF.rot };
  }
  /* keep the orbit pivot on the board, at the visible centre of the view, and never let the board leave the view */
  const fwd = new THREE.Vector3(), shift = new THREE.Vector3();
  function keepOnBoard() {
    camera.getWorldDirection(fwd);
    if (fwd.y < -1e-3) { // pivot = where the centre of the view meets the board plane
      const k = -camera.position.y / fwd.y;
      controls.target.copy(camera.position).addScaledVector(fwd, k);
    }
    const tx = Math.max(-BW / 2, Math.min(BW / 2, controls.target.x)), tz = Math.max(-BH / 2, Math.min(BH / 2, controls.target.z));
    shift.set(tx - controls.target.x, 0, tz - controls.target.z);
    if (shift.lengthSq() > 0) { controls.target.add(shift); camera.position.add(shift); }
  }
  const poseFromCamera = () => {
    const off = camera.position.clone().sub(controls.target), sp = new THREE.Spherical().setFromVector3(off);
    return { target: controls.target.clone(), dist: sp.radius, tilt: THREE.MathUtils.radToDeg(sp.phi), rot: -THREE.MathUtils.radToDeg(sp.theta) };
  };
  function applyPose(p) {
    const sp = new THREE.Spherical(p.dist, THREE.MathUtils.degToRad(Math.max(0.01, p.tilt)), THREE.MathUtils.degToRad(-p.rot));
    controls.target.copy(p.target);
    camera.position.copy(p.target).add(new THREE.Vector3().setFromSpherical(sp));
    camera.lookAt(p.target);
  }
  let tween = null;
  function flyTo(p, ms = 1300) {
    const from = poseFromCamera();
    if (reduce || ms <= 0) { tween = null; applyPose(p); controls.update(); return Promise.resolve(); }
    return new Promise((done) => { tween = { from, to: p, t0: performance.now(), ms, done }; });
  }

  const v = new THREE.Vector3();
  function placeHTML(el, p3, bottom = false) {
    v.copy(p3).project(camera);
    const w = host.clientWidth, h = host.clientHeight;
    const behind = v.z > 1 || v.z < -1;
    const d = camera.position.distanceTo(p3), k = Math.max(0.6, Math.min(1.3, 9 / d));
    el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px,${((1 - v.y) / 2 * h ).toFixed(1)}px) translate(-50%,${bottom ? "-100%" : "-50%"}) scale(${k.toFixed(3)})`;
    el.style.visibility = behind ? "hidden" : "";
    el.style.zIndex = String(1000 - Math.round(d * 20));
  }
  let raf = 0, running = false;
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (tween) {
      const q = ease(Math.min(1, (now - tween.t0) / tween.ms)), a = tween.from, b = tween.to;
      applyPose({ target: a.target.clone().lerp(b.target, q), dist: a.dist + (b.dist - a.dist) * q, tilt: a.tilt + (b.tilt - a.tilt) * q, rot: a.rot + (b.rot - a.rot) * q });
      if (q >= 1) { const d = tween.done; tween = null; controls.update(); d(); }
    } else { controls.update(); keepOnBoard(); }
    for (const m of markers) {
      placeHTML(m.el, m.top, true); placeHTML(m.sealEl, m.base);
      m.flag.swing.rotation.y = Math.atan2(camera.position.x - m.base.x, camera.position.z - m.base.z);
      if (!reduce) m.flag.wave(now / 1000);
    }
    for (const r of extras) if (r.html) placeHTML(r.obj, r.at);
    renderer.render(scene, camera);
  }
  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(frame); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  applyPose(flatPose());
  return {
    THREE, scene, camera, controls, renderer, project, addObject,
    groundAt: (lon, lat) => { const p = project(lon, lat); return groundY(H, p.x, p.y); },
    start, stop,
    enter: (animate = true) => { start(); applyPose(flatPose()); return flyTo(homePose(), animate ? 1500 : 0); },
    leave: (animate = true) => flyTo(flatPose(), animate ? 900 : 0),
    home: () => flyTo(homePose(), 900),
    zoom: (f) => flyTo({ ...poseFromCamera(), dist: Math.max(controls.minDistance, Math.min(controls.maxDistance, poseFromCamera().dist / f)) }, 350),
    camera3d: (c = {}) => { tween = null; const p = poseFromCamera(); if (c.tilt != null || c.rot != null || c.dist != null) { applyPose({ ...p, tilt: c.tilt ?? p.tilt, rot: c.rot ?? p.rot, dist: c.dist ?? p.dist, target: c.lon != null ? (() => { const q = project(c.lon, c.lat); return world(q.x, q.y, 0); })() : p.target }); controls.update(); } return poseFromCamera(); },
    dispose: () => { stop(); clearInterval(pinTimer); ro.disconnect(); controls.dispose(); renderer.dispose(); host.replaceChildren(); },
  };
}
