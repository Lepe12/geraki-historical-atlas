/* NABOU//X — 3D ship on the 3D main map (loaded only after the 3D scene starts; never in 2D).
 * Model: a 17th-century Mediterranean three-masted xebec (lateen rig), built here from three.js geometry,
 * no external model files. It is an ILLUSTRATION placed at a fixed sea position in the Cyclades (near
 * Milos and Kimolos). It does not travel and shows no historical voyage: voyage legs are not used here.
 * It always floats at sea level: the position is checked against the terrain (groundAt < 0 = sea) and
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
  const ship = new T.Group();
  ship.name = "nabou-ship";
  const wood = new T.MeshStandardMaterial({ color: 0x7a4e2a, emissive: 0x1c0f06, roughness: 0.7 });
  const darkWood = new T.MeshStandardMaterial({ color: 0x3b2413, roughness: 0.8 });
  const deckMat = new T.MeshStandardMaterial({ color: 0xa47a4a, roughness: 0.85 });
  const sailMat = new T.MeshStandardMaterial({ color: 0xf1e4c2, emissive: 0x4a3d26, roughness: 0.9, side: T.DoubleSide });
  const red = new T.MeshStandardMaterial({ color: 0x9c2219, roughness: 0.6, side: T.DoubleSide });
  const gold = new T.MeshStandardMaterial({ color: 0xb48d45, roughness: 0.4, metalness: 0.6 });

  /* hull: side profile extruded across the beam, then tapered to a sharp bow, rounded stern and a narrow keel */
  const L = 1, Hh = 0.16;
  const prof = new T.Shape();
  prof.moveTo(-0.5, 0.10);            // stern top
  prof.lineTo(-0.47, -0.02);
  prof.quadraticCurveTo(-0.35, -0.09, -0.1, -0.095);
  prof.lineTo(0.3, -0.09);
  prof.quadraticCurveTo(0.48, -0.06, 0.6, 0.06); // long overhanging bow (xebec beak)
  prof.lineTo(0.56, 0.075);
  prof.quadraticCurveTo(0.2, 0.045, -0.2, 0.06);
  prof.lineTo(-0.5, 0.10);
  const hullGeo = new T.ExtrudeGeometry(prof, { depth: 0.2, bevelEnabled: false, curveSegments: 10, steps: 1 });
  hullGeo.translate(0, 0, -0.1);
  const p = hullGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const along = x > 0.15 ? Math.max(0, 1 - ((x - 0.15) / 0.45) ** 1.6) : x < -0.38 ? 0.78 + 0.22 * (1 - (-0.38 - x) / 0.12) : 1;
    const down = 0.35 + 0.65 * Math.min(1, Math.max(0, (y + 0.095) / 0.13)); // narrower towards the keel
    p.setZ(i, z * along * down);
  }
  hullGeo.computeVertexNormals();
  const hull = new T.Mesh(hullGeo, wood);
  ship.add(hull);
  // wale stripes and gold rail along the sheer
  const stripe = new T.Mesh(new T.BoxGeometry(0.86, 0.012, 0.192), darkWood); stripe.position.set(0.02, 0.035, 0); ship.add(stripe);
  const rail = new T.Mesh(new T.BoxGeometry(0.98, 0.008, 0.17), gold); rail.position.set(0, 0.078, 0); ship.add(rail);
  // deck
  const deck = new T.Mesh(new T.BoxGeometry(0.9, 0.01, 0.15), deckMat); deck.position.set(0.0, 0.066, 0); ship.add(deck);
  // stern castle with a small cabin
  const castle = new T.Mesh(new T.BoxGeometry(0.16, 0.06, 0.15), darkWood); castle.position.set(-0.41, 0.12, 0); ship.add(castle);
  const castleRail = new T.Mesh(new T.BoxGeometry(0.17, 0.008, 0.155), gold); castleRail.position.set(-0.41, 0.153, 0); ship.add(castleRail);
  // oar ports / oars (xebecs could row in calms)
  for (const side of [-1, 1]) for (let k = 0; k < 7; k++) {
    const oar = new T.Mesh(new T.CylinderGeometry(0.003, 0.003, 0.16, 4), darkWood);
    oar.position.set(-0.22 + k * 0.08, 0.0, side * 0.13);
    oar.rotation.x = side * 1.05;
    ship.add(oar);
  }

  /* three masts with lateen yards and triangular sails, gently billowed */
  const masts = [{ x: 0.3, h: 0.5, lean: 0.12 }, { x: 0.02, h: 0.58, lean: 0.06 }, { x: -0.3, h: 0.4, lean: 0.02 }];
  for (const m of masts) {
    const mast = new T.Mesh(new T.CylinderGeometry(0.006, 0.009, m.h, 6), darkWood);
    mast.position.set(m.x, 0.07 + m.h / 2, 0); mast.rotation.z = m.lean * 0.5; ship.add(mast);
    const yardLen = m.h * 1.25;
    const yard = new T.Mesh(new T.CylinderGeometry(0.0035, 0.0035, yardLen, 5), darkWood);
    const top = new T.Vector3(m.x - Math.sin(m.lean * 0.5) * m.h * 0.92, 0.07 + m.h * 0.92, 0.012);
    yard.position.copy(top).add(new T.Vector3(0.06, -0.06, 0));
    yard.rotation.z = -1.05; ship.add(yard);
    // lateen sail: triangle hanging from the yard down to the deck at the mast foot
    const dir = new T.Vector3(Math.sin(1.05), Math.cos(1.05), 0).multiplyScalar(yardLen / 2); // yard axis after rotation (pointing fore-up)
    const yA = yard.position.clone().add(dir), yB = yard.position.clone().sub(dir);
    const foot = new T.Vector3(m.x + 0.02, 0.09, 0.015);
    const g = new T.BufferGeometry(), seg = 8, verts = [], idx = [];
    for (let i = 0; i <= seg; i++) for (let j = 0; j <= seg - i; j++) {
      const u = i / seg, v = j / seg, w = 1 - u - v;
      const pnt = yA.clone().multiplyScalar(u).add(yB.clone().multiplyScalar(v)).add(foot.clone().multiplyScalar(w));
      pnt.z += 0.05 * Math.sin(Math.PI * Math.min(1, w * 1.6)) * (1 - Math.abs(u - v)); // belly of the sail
      verts.push(pnt.x, pnt.y, pnt.z);
    }
    const row = (i) => { let o = 0; for (let k = 0; k < i; k++) o += seg - k + 1; return o; };
    for (let i = 0; i < seg; i++) for (let j = 0; j < seg - i; j++) {
      const a = row(i) + j, b = row(i) + j + 1, c = row(i + 1) + j;
      idx.push(a, b, c);
      if (j < seg - i - 1) idx.push(b, row(i + 1) + j + 1, c);
    }
    g.setIndex(idx); g.setAttribute("position", new T.Float32BufferAttribute(verts, 3)); g.computeVertexNormals();
    const sail = new T.Mesh(g, sailMat); ship.add(sail);
    // pennant at the upper yard end
    const pen = new T.Mesh(new T.PlaneGeometry(0.08, 0.025), red);
    pen.position.copy(yA).add(new T.Vector3(-0.04, 0.012, 0)); ship.add(pen);
  }
  // stern flag
  const pole = new T.Mesh(new T.CylinderGeometry(0.003, 0.003, 0.12, 4), darkWood); pole.position.set(-0.49, 0.2, 0); ship.add(pole);
  const flag = new T.Mesh(new T.PlaneGeometry(0.07, 0.045), red); flag.position.set(-0.53, 0.235, 0); ship.add(flag);

  ship.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  ship.scale.setScalar(LEN / L);
  return { ship, flag };
}

export function addShip(api) {
  const T = api.THREE;
  if (!T || !api.scene) return null;
  const at = seaSpot(api);
  if (!at) { console.warn("map3d ship: no open-sea spot found, ship not placed"); return null; }
  const { ship, flag } = buildShip(T);
  const holder = new T.Group();   // positioned by NABOU_MAP3D.addObject at sea level
  const bob = new T.Group();      // gentle swell motion inside it
  bob.add(ship);
  holder.add(bob);
  holder.rotation.y = 0.75;       // heading roughly NW, along the channel
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
  };
  const handle = api.addObject(holder, { lon: at.lon, lat: at.lat, z: 0 });
  holder.position.y = 0; // sea level, not the sea floor
  return { handle, at, object: holder };
}
