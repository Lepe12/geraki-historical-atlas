/* NABOU//X — 3D galleon on the 3D main map (loaded only after the 3D scene starts; never in 2D).
 * Model: "Galleon" by Grab3D, CC0 1.0 (public domain), vendored at assets/nautical/models/galleon.glb
 * (see assets/nautical/models/README.md), loaded with three.js GLTFLoader (vendor/three, MIT).
 * On its own it floats at a fixed open-sea spot in the Cyclades (near Milos and Kimolos); map-3d-route.js
 * instead sails it along the Book III (1577) route and moves it every frame.
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

const MODEL = "./assets/nautical/models/galleon.glb";
const WATERLINE_M = 2.6, LENGTH_M = 29.85; // from the model's manifest: waterline 2.6 m above the keel, 29.85 m long

function loadGalleon(T, bob) {
  return import("./vendor/three/GLTFLoader.js").then(({ GLTFLoader }) => new GLTFLoader().loadAsync(MODEL)).then((gltf) => {
    const m = gltf.scene;
    const box = new T.Box3().setFromObject(m), size = box.getSize(new T.Vector3());
    const len = Math.max(size.x, size.z), k = LEN / len;
    m.scale.setScalar(k);
    // the model's bow points along +z (glTF) when it is longer in z; the route code expects the bow on +x
    if (size.z >= size.x) m.rotation.y = Math.PI / 2;
    m.position.y = -(box.min.y + WATERLINE_M * (len / LENGTH_M)) * k;
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mt of mats) for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap"]) if (mt[key]) mt[key].anisotropy = 8;
    });
    m.name = "nabou-galleon";
    bob.add(m);
    return m;
  });
}

export function addShip(api, opts = {}) {
  const T = api.THREE;
  if (!T || !api.scene) return null;
  const at = opts.exact && opts.at ? opts.at : seaSpot(api); // exact: the caller moves it along a sea route
  if (!at) { console.warn("map3d ship: no open-sea spot found, ship not placed"); return null; }
  const holder = new T.Group();   // positioned by NABOU_MAP3D.addObject at sea level
  const bob = new T.Group();      // gentle swell motion inside it
  holder.add(bob);
  holder.rotation.y = 0.75;       // heading roughly NW (the route module turns it along its course)
  const ready = loadGalleon(T, bob).catch((e) => { console.warn("map3d ship: galleon model not loaded", e); return null; });
  // wake: soft pale streak on the water behind the stern
  const cv = document.createElement("canvas"); cv.width = 64; cv.height = 256;
  const g = cv.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "rgba(255,250,235,.75)"); gr.addColorStop(1, "rgba(255,250,235,0)");
  g.fillStyle = gr; g.beginPath(); g.moveTo(26, 0); g.lineTo(38, 0); g.lineTo(64, 256); g.lineTo(0, 256); g.fill();
  const wakeTex = new T.CanvasTexture(cv);
  const wake = new T.Mesh(new T.PlaneGeometry(LEN * 0.42, LEN * 0.95), new T.MeshBasicMaterial({ map: wakeTex, transparent: true, opacity: 0.8, depthWrite: false }));
  wake.rotation.x = -Math.PI / 2; wake.rotation.z = -Math.PI / 2; wake.position.set(-LEN * 0.95, 0.003, 0); // short wake (the route draws the ship large)
  holder.add(wake);

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t0 = performance.now();
  // animate from the render loop (runs only while the 3D view is drawn)
  wake.onBeforeRender = () => {
    if (reduce) return;
    const t = (performance.now() - t0) / 1000;
    bob.position.y = 0.0015 * Math.sin(t * 1.3);
    bob.rotation.x = 0.03 * Math.sin(t * 1.1);           // roll
    bob.rotation.z = 0.018 * Math.sin(t * 0.8 + 1.2);    // pitch
  };
  const handle = api.addObject(holder, { lon: at.lon, lat: at.lat, z: 0 });
  holder.position.y = 0; // sea level, not the sea floor
  return { handle, at, object: holder, ready };
}
