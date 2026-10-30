/* NABOU//X — 3D ship on the 3D main map (loaded only after the 3D scene starts; never in 2D).
 * Model: a late-16th-century galleon (fore and main square-rigged, mizzen and bonaventure lateen), built here from three.js geometry,
 * no external model files. On its own it floats at a fixed open-sea spot in the Cyclades (near Milos and
 * Kimolos); map-3d-route.js instead sails it along the Book III (1577) route and moves it every frame.
 * It always floats at sea level: the fixed spot is checked against the terrain (groundAt < 0 = sea) and
 * moved to the nearest open-sea spot if needed. */
const SHIP_AT = { lon: 24.72, lat: 36.86 }; // preferred: open water by Milos / Kimolos (not a historical place); nearest open sea is used
const LEN = 0.16;                            // hull length in world units (the whole board is 18 wide)

function seaSpot(api) {
  const LEN_DEG = 0.22; // keep the whole hull over water
  const wet = (lon, lat) => {
    for (let a = 0; a < 8; a++) if (api.groundAt(lon + Math.cos(a * Math.PI / 4) * LEN_DEG, lat + Math.sin(a * Math.PI / 4) * LEN_DEG * 0.8) >= 0) return false;
    return api.groundAt(lon, lat) < 0;
  };
  if (wet(SHIP_AT.lon, SHIP_AT.lat)) return SHIP_AT;
  for (let r = 0.05; r <= 1.2; r += 0.05)
    for (let a = 0; a < 16; a++) {
      const lon = SHIP_AT.lon + Math.cos(a * Math.PI / 8) * r, lat = SHIP_AT.lat + Math.sin(a * Math.PI / 8) * r * 0.8;
      if (wet(lon, lat)) return { lon, lat };
    }
  return null;
}

function buildShip(T) {
  /* late-16th-century galleon: low waist between a high forecastle and a tall stern castle, four masts
     (fore and main square-rigged, mizzen and bonaventure lateen), bowsprit with spritsail, gunports,
     dark wood with red and gilt trim, pennants and an ensign. Bow = +x, up = +y, beam = z. No oars. */
  const ship = new T.Group();
  ship.name = "nabou-galleon";
  const M = (o) => new T.MeshStandardMaterial({ roughness: 0.75, ...o });
  const wood = M({ color: 0x4a2c16, emissive: 0x140a04 });
  const darkWood = M({ color: 0x2a190c });
  const deckMat = M({ color: 0x9a7448, roughness: 0.85 });
  const redPaint = M({ color: 0x8e1d16, emissive: 0x220504, roughness: 0.6 });
  const gold = M({ color: 0xc09a4c, roughness: 0.4, metalness: 0.6, emissive: 0x2a1e08 });
  const portMat = M({ color: 0x0c0705, roughness: 1 });
  const sailMat = M({ color: 0xf1e4c2, emissive: 0x4a3d26, roughness: 0.9, side: T.DoubleSide });
  const flagRed = M({ color: 0xb0241a, roughness: 0.6, side: T.DoubleSide });
  const flagGold = M({ color: 0xd8b558, roughness: 0.6, side: T.DoubleSide });

  // hull half-beam at (x, y): sharp bow, broad round stern, narrower at the keel and inward at the castles
  const HB = 0.105;
  const along = (x) => (x > 0.18 ? Math.max(0.05, 1 - ((x - 0.18) / 0.34) ** 1.7) : x < -0.36 ? 0.8 + 0.2 * Math.max(0, 1 - (-0.36 - x) / 0.16) : 1);
  const down = (y) => 0.35 + 0.65 * Math.min(1, Math.max(0, (y + 0.1) / 0.14));
  const tumble = (y) => (y > 0.09 ? 1 - 0.22 * Math.min(1, (y - 0.09) / 0.22) : 1);
  const half = (x, y) => HB * along(x) * down(y) * tumble(y);
  function extrude(shape, mat, grow = 1) {
    const g = new T.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 10, steps: 1 });
    g.translate(0, 0, -0.5);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * 2 * half(p.getX(i), p.getY(i)) * grow);
    g.computeVertexNormals();
    const m = new T.Mesh(g, mat); ship.add(m); return m;
  }
  const shape = (pts) => { const s = new T.Shape(); s.moveTo(...pts[0]); for (const q of pts.slice(1)) q.length === 4 ? s.quadraticCurveTo(...q) : s.lineTo(...q); return s; };

  // side profile: stern castle (two tiers), low waist, forecastle, keel and a raked stem
  extrude(shape([[-0.5, 0.31], [-0.47, -0.02], [-0.33, -0.1, -0.08, -0.105], [0.28, -0.1], [0.46, -0.07, 0.52, 0.09],
    [0.5, 0.2], [0.29, 0.2], [0.28, 0.09], [-0.17, 0.09], [-0.18, 0.21], [-0.33, 0.21], [-0.34, 0.31], [-0.5, 0.31]]), wood);
  // painted bands that follow the hull: red wale, gilt rails, red castle friezes
  extrude(shape([[-0.47, 0.055], [0.49, 0.055], [0.49, 0.072], [-0.47, 0.072]]), redPaint, 1.03);
  extrude(shape([[-0.49, 0.086], [0.5, 0.086], [0.5, 0.094], [-0.49, 0.094]]), gold, 1.03);
  extrude(shape([[-0.5, 0.15], [-0.18, 0.15], [-0.18, 0.19], [-0.5, 0.19]]), redPaint, 1.03);
  extrude(shape([[-0.5, 0.255], [-0.34, 0.255], [-0.34, 0.29], [-0.5, 0.29]]), redPaint, 1.03);
  extrude(shape([[0.29, 0.15], [0.5, 0.15], [0.5, 0.185], [0.29, 0.185]]), redPaint, 1.03);
  extrude(shape([[-0.5, 0.205], [-0.17, 0.205], [-0.17, 0.214], [-0.5, 0.214]]), gold, 1.03);
  extrude(shape([[-0.5, 0.305], [-0.33, 0.305], [-0.33, 0.315], [-0.5, 0.315]]), gold, 1.03);
  extrude(shape([[0.28, 0.195], [0.5, 0.195], [0.5, 0.205], [0.28, 0.205]]), gold, 1.03);
  // waist deck
  const deck = new T.Mesh(new T.BoxGeometry(0.46, 0.006, 2 * HB * 0.95), deckMat); deck.position.set(0.05, 0.088, 0); ship.add(deck);
  // gunports with red lids, two rows on the gun deck and the stern castle
  const box = (w, h, d, mat, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); ship.add(m); return m; };
  for (const side of [-1, 1]) {
    for (let k = 0; k < 7; k++) { const x = -0.3 + k * 0.085, y = 0.025; const z = side * (half(x, y) + 0.002);
      box(0.026, 0.022, 0.004, redPaint, x, y, z); box(0.017, 0.014, 0.006, portMat, x, y, z); }
    for (let k = 0; k < 3; k++) { const x = -0.44 + k * 0.085, y = 0.235; box(0.02, 0.018, 0.006, portMat, x, y, side * (half(x, y) + 0.002)); }
    for (let k = 0; k < 2; k++) { const x = 0.33 + k * 0.07, y = 0.125; box(0.018, 0.016, 0.006, portMat, x, y, side * (half(x, y) + 0.002)); }
  }
  // stern gallery windows and a gilt lantern
  for (let k = -1; k <= 1; k++) box(0.004, 0.022, 0.022, gold, -0.502, 0.24, k * 0.034);
  const lantern = new T.Mesh(new T.SphereGeometry(0.012, 8, 6), gold); lantern.position.set(-0.5, 0.345, 0); ship.add(lantern);

  const cyl = (r0, r1, h, mat, x, y, z) => { const m = new T.Mesh(new T.CylinderGeometry(r0, r1, h, 6), mat); m.position.set(x, y, z); ship.add(m); return m; };
  // square sail: billowed forward (towards the bow), hung below a yard across the ship
  function squareSail(x, yTop, yBot, wTop, wBot) {
    const g = new T.PlaneGeometry(1, 1, 8, 8), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = p.getY(i) + 0.5;             // u: -0.5..0.5 across, v: 0 bottom .. 1 top
      const w = wBot + (wTop - wBot) * v;
      const belly = 0.045 * (1 - 4 * u * u) * Math.sin(Math.PI * Math.min(1, 0.15 + v * 0.85));
      p.setXYZ(i, belly, yBot + (yTop - yBot) * v, u * w);
    }
    g.computeVertexNormals();
    const m = new T.Mesh(g, sailMat); m.position.x = x; ship.add(m);
    const yard = cyl(0.004, 0.004, wTop * 1.12, darkWood, x + 0.004, yTop + 0.004, 0); yard.rotation.x = Math.PI / 2;
  }
  // lateen sail: triangle from a long slanted yard down to the mast foot
  function lateen(x, base, h, lean) {
    const yardLen = h * 1.3, top = new T.Vector3(x, base + h * 0.85, 0.006);
    const dir = new T.Vector3(Math.sin(1.0), Math.cos(1.0), 0).multiplyScalar(yardLen / 2);
    const yA = top.clone().add(dir), yB = top.clone().sub(dir), foot = new T.Vector3(x + 0.02, base + 0.03, 0.008);
    const yard = cyl(0.003, 0.003, yardLen, darkWood, top.x, top.y, top.z); yard.rotation.z = -1.0;
    const g = new T.BufferGeometry(), seg = 8, verts = [], idx = [];
    for (let i = 0; i <= seg; i++) for (let j = 0; j <= seg - i; j++) {
      const u = i / seg, v = j / seg, w = 1 - u - v;
      const q = yA.clone().multiplyScalar(u).add(yB.clone().multiplyScalar(v)).add(foot.clone().multiplyScalar(w));
      q.z += 0.035 * Math.sin(Math.PI * Math.min(1, w * 1.6)) * (1 - Math.abs(u - v));
      verts.push(q.x, q.y, q.z);
    }
    const row = (i) => { let o = 0; for (let k = 0; k < i; k++) o += seg - k + 1; return o; };
    for (let i = 0; i < seg; i++) for (let j = 0; j < seg - i; j++) {
      idx.push(row(i) + j, row(i) + j + 1, row(i + 1) + j);
      if (j < seg - i - 1) idx.push(row(i) + j + 1, row(i + 1) + j + 1, row(i + 1) + j);
    }
    g.setIndex(idx); g.setAttribute("position", new T.Float32BufferAttribute(verts, 3)); g.computeVertexNormals();
    ship.add(new T.Mesh(g, sailMat));
  }
  const pennant = (x, y, len) => { const m = new T.Mesh(new T.PlaneGeometry(len, 0.014), flagRed); m.position.set(x - len / 2, y, 0); ship.add(m); return m; };

  // foremast and mainmast: course + topsail, fighting tops, pennants at the trucks
  const rigs = [{ x: 0.3, base: 0.2, h: 0.58, c: [0.48, 0.27, 0.29, 0.31], t: [0.72, 0.53, 0.2, 0.25] },
                { x: 0.02, base: 0.09, h: 0.8, c: [0.5, 0.19, 0.34, 0.38], t: [0.79, 0.55, 0.24, 0.31] }];
  const pennants = [];
  for (const r of rigs) {
    cyl(0.006, 0.009, r.h, darkWood, r.x, r.base + r.h / 2, 0);
    cyl(0.022, 0.016, 0.018, darkWood, r.x, r.c[0] + 0.02, 0);           // fighting top
    squareSail(r.x + 0.012, r.c[0], r.c[1], r.c[2], r.c[3]);
    squareSail(r.x + 0.01, r.t[0], r.t[1], r.t[2], r.t[3]);
    pennants.push(pennant(r.x, r.base + r.h + 0.005, 0.12));
  }
  // mizzen (on the stern castle) and bonaventure (on the poop): lateen
  cyl(0.005, 0.007, 0.42, darkWood, -0.25, 0.21 + 0.21, 0); lateen(-0.25, 0.21, 0.42);
  pennants.push(pennant(-0.25, 0.64, 0.08));
  cyl(0.004, 0.005, 0.26, darkWood, -0.42, 0.31 + 0.13, 0); lateen(-0.42, 0.31, 0.26);
  // bowsprit with a spritsail under it
  const bs = cyl(0.005, 0.007, 0.3, darkWood, 0.6, 0.25, 0); bs.rotation.z = -Math.PI / 2 + 0.5;
  squareSail(0.64, 0.25, 0.13, 0.17, 0.19);
  // rigging: shrouds and stays as thin lines
  const lines = [];
  const L = (a, b) => lines.push(...a, ...b);
  for (const r of rigs) for (const side of [-1, 1]) for (const dx of [-0.04, 0, 0.04]) L([r.x, r.c[0], 0], [r.x + dx, 0.095 + (r.x > 0.2 ? 0.1 : 0), side * half(r.x + dx, 0.09)]);
  L([0.02, 0.88, 0], [0.3, 0.2, 0]); L([0.3, 0.77, 0], [0.72, 0.38, 0]); L([0.02, 0.86, 0], [-0.25, 0.62, 0]); L([-0.25, 0.62, 0], [-0.42, 0.56, 0]);
  const lg = new T.BufferGeometry(); lg.setAttribute("position", new T.Float32BufferAttribute(lines, 3));
  ship.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x2a1a0c, transparent: true, opacity: 0.8 })));
  // ensign on a staff at the stern: red with a gilt band
  cyl(0.003, 0.003, 0.14, darkWood, -0.52, 0.37, 0);
  const flag = new T.Group(); flag.position.set(-0.52, 0.41, 0); ship.add(flag);
  const f1 = new T.Mesh(new T.PlaneGeometry(0.09, 0.055), flagRed); f1.position.x = -0.045; flag.add(f1);
  const f2 = new T.Mesh(new T.PlaneGeometry(0.09, 0.012), flagGold); f2.position.set(-0.045, 0, 0.001); flag.add(f2);

  ship.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  ship.scale.setScalar(LEN / 1);
  return { ship, flag, pennants };
}

export function addShip(api, opts = {}) {
  const T = api.THREE;
  if (!T || !api.scene) return null;
  const at = opts.exact && opts.at ? opts.at : seaSpot(api); // exact: the caller moves it along a sea route
  if (!at) { console.warn("map3d ship: no open-sea spot found, ship not placed"); return null; }
  const { ship, flag, pennants } = buildShip(T);
  const holder = new T.Group();   // positioned by NABOU_MAP3D.addObject at sea level
  const bob = new T.Group();      // gentle swell motion inside it
  bob.add(ship);
  holder.add(bob);
  holder.rotation.y = 0.75;       // heading roughly NW (the route module turns it along its course)
  // wake: soft pale streak on the water behind the stern
  const cv = document.createElement("canvas"); cv.width = 64; cv.height = 256;
  const g = cv.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "rgba(255,250,235,.75)"); gr.addColorStop(1, "rgba(255,250,235,0)");
  g.fillStyle = gr; g.beginPath(); g.moveTo(26, 0); g.lineTo(38, 0); g.lineTo(64, 256); g.lineTo(0, 256); g.fill();
  const wakeTex = new T.CanvasTexture(cv);
  const wake = new T.Mesh(new T.PlaneGeometry(LEN * 0.6, LEN * 1.8), new T.MeshBasicMaterial({ map: wakeTex, transparent: true, depthWrite: false }));
  wake.rotation.x = -Math.PI / 2; wake.rotation.z = -Math.PI / 2; wake.position.set(-LEN * 1.35, 0.004, 0);
  holder.add(wake);
  ship.position.y = 0.004; // waterline: hull bottom sits just under sea level

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t0 = performance.now();
  // animate from the render loop (runs only while the 3D view is drawn)
  ship.children[0].onBeforeRender = () => {
    if (reduce) return;
    const t = (performance.now() - t0) / 1000;
    bob.position.y = 0.0025 * Math.sin(t * 1.3);
    bob.rotation.x = 0.045 * Math.sin(t * 1.1);          // roll
    bob.rotation.z = 0.025 * Math.sin(t * 0.8 + 1.2);    // pitch
    flag.rotation.y = 0.35 * Math.sin(t * 3.1);
    pennants.forEach((p, i) => { p.rotation.x = 0.4 * Math.sin(t * 2.6 + i); });
  };
  const handle = api.addObject(holder, { lon: at.lon, lat: at.lat, z: 0 });
  holder.position.y = 0; // sea level, not the sea floor
  return { handle, at, object: holder };
}
