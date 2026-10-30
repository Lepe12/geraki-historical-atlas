/* NABOU//X — coats of arms (οικόσημα) for the 17 lanes of the 3D main map (3D only).
 * The artwork is the emblem the 2D map shows: window.NABOU_EMBLEMS.get(id) from nautical-emblems.js
 * (read only, never changed here), except the Ottoman and North African lanes, overridden in 3D only (see OVERRIDES). Each emblem SVG is made self-contained (the shared <defs> of the page are
 * copied in) and rasterised in the browser at 1024 px on its long side into an sRGB texture with mipmaps and
 * anisotropic filtering. The plaque is fully opaque (no blending, no glow), stands upright on a wooden pole
 * with a small plinth and always turns to face the camera, so it reads from any angle. */

const TEX = 1024;
const NS = "http://www.w3.org/2000/svg";
const TITLES = {
  spanish_simancas: "Σταυρός της Βουργουνδίας (Ισπανία των Αψβούργων)", venetian: "Λέων του Αγίου Μάρκου (Βενετία)",
  french: "Κρίνοι της Γαλλίας", british: "Αγγλία", dutch: "Prinsenvlag (Κάτω Χώρες)", german: "Δικέφαλος αετός (Αγία Ρωμαϊκή Αυτοκρατορία)",
  italian_states: "Κλειδιά του Αγίου Πέτρου (Παπικό Κράτος)", greek: "Δικέφαλος αετός (βυζαντινή παράδοση)",
  ottoman: "Τουγρά του Μουράτ Γ΄ (1574–1595), Οθωμανική αυτοκρατορία", north_african: "Κόκκινη σημαία με λευκές ημισελήνους (κουρσάροι της Βόρειας Αφρικής)",
};
export const emblemInfo = (id) => ({ title: TITLES[id] || "Οικόσημο λωρίδας (όπως στον 2D χάρτη)" });

let defsCache = null;
function pageDefs() {
  if (defsCache != null) return defsCache;
  const d = document.querySelector("#nxEmDefs defs");
  defsCache = d ? new XMLSerializer().serializeToString(d) : "";
  return defsCache;
}
/* 3D-only overrides (the 2D map keeps its own emblems from nautical-emblems.js, which is not touched).
 * Same flag frame, shadow, shading and ink edge as the 2D flag emblems, so they match the other lanes.
 *  ottoman:       tughra of Murad III, the sultan's emblem in 1577 (Commons File:Tughra_of_Murad_III.svg,
 *                 public domain, vendored unchanged in assets/nautical/emblems/, see CREDITS.md there), ink on parchment.
 *  north_african: red field with three white crescents, the Ottoman/corsair naval flag of the period
 *                 (Martykán, "A history of Ottoman naval flags", 1999; Vicentino, Battle of Lepanto). Drawn here. */
const INK = "#2a190e", PARCH = "#efe3c4", RED = "#a3342a";
const FL = "M1.5 1.5H34.5V24.5H1.5Z";
const flagFrame = (charges) => `<svg xmlns="${NS}" viewBox="0 0 36 26" width="36" height="26">` +
  `<path d="${FL}" transform="translate(.9 1.3)" fill="rgba(20,10,4,.38)"/>${charges}` +
  `<path d="${FL}" fill="url(#nxEmShade)"/><path d="M12 1.5V24.5M24 1.5V24.5" stroke="rgba(0,0,0,.08)" stroke-width="5"/>` +
  `<path d="${FL}" fill="none" stroke="${INK}" stroke-width="1.4"/></svg>`;
const cres = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${PARCH}"/><circle cx="${x + r * 0.42}" cy="${y - r * 0.08}" r="${r * 0.8}" fill="${RED}"/>`;
let tughraCache = null;
function tughraSVG() {
  if (!tughraCache) tughraCache = fetch(new URL("./assets/nautical/emblems/tughra_murad_iii.svg", import.meta.url))
    .then((r) => { if (!r.ok) throw new Error("tughra " + r.status); return r.text(); })
    .then((txt) => {
      const doc = new DOMParser().parseFromString(txt, "image/svg+xml"), root = doc.documentElement;
      root.querySelectorAll("metadata").forEach((e) => e.remove());
      [...root.children].filter((e) => e.localName === "namedview").forEach((e) => e.remove());
      // fit inside the flag with a margin, keep the aspect
      root.setAttribute("x", "4.2"); root.setAttribute("y", "3.4"); root.setAttribute("width", "27.6"); root.setAttribute("height", "19.2");
      root.setAttribute("preserveAspectRatio", "xMidYMid meet");
      return new XMLSerializer().serializeToString(root).replace(/<\?xml[^>]*>/, "").replace(/fill:#000000/g, "fill:" + INK);
    });
  return tughraCache;
}
const OVERRIDES = {
  ottoman: () => tughraSVG().then((t) => ({ w: 36, h: 26, svg: flagFrame(`<path d="${FL}" fill="${PARCH}"/>` + t) })),
  north_african: () => Promise.resolve({ w: 36, h: 26, svg: flagFrame(`<path d="${FL}" fill="${RED}"/>` + cres(11, 8.4, 4.4) + cres(25, 8.4, 4.4) + cres(18, 17.8, 4.4)) }),
};
const emblemSource = (id) => OVERRIDES[id] ? OVERRIDES[id]() : Promise.resolve(window.NABOU_EMBLEMS && window.NABOU_EMBLEMS.get(id));

// the lane emblem as a standalone SVG string, drawn at the given pixel size
function standaloneSVG(em) {
  if (!em) return null;
  const k = TEX / Math.max(em.w, em.h), W = Math.round(em.w * k), H = Math.round(em.h * k);
  const holder = document.createElement("div"); holder.innerHTML = em.svg;
  const svg = holder.querySelector("svg");
  svg.setAttribute("xmlns", NS); svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  svg.setAttribute("width", W); svg.setAttribute("height", H);
  let text = new XMLSerializer().serializeToString(svg);
  text = text.replace(/(<svg[^>]*>)/, "$1" + pageDefs());
  return { text, W, H, aspect: em.w / em.h };
}
export async function emblemCanvas(id) {
  const s = standaloneSVG(await emblemSource(id));
  if (!s) throw new Error("no emblem for " + id);
  return new Promise((ok, bad) => {
    const url = URL.createObjectURL(new Blob([s.text], { type: "image/svg+xml" })), img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas"); cv.width = s.W; cv.height = s.H;
      cv.getContext("2d").drawImage(img, 0, 0, s.W, s.H);
      URL.revokeObjectURL(url); ok({ canvas: cv, aspect: s.aspect });
    };
    img.onerror = () => { URL.revokeObjectURL(url); bad(new Error("emblem svg not decoded: " + id)); };
    img.src = url;
  });
}

/* same interface the scene used for the flags: { group, swing, cloth, wave, face, info, ready } */
export function makeEmblem(THREE, renderer, id, { pole = 0.42, height = 0.25 } = {}) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x2a190e, roughness: 0.6 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc09a4c, roughness: 0.35, metalness: 0.7 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.02, 16), wood); plinth.position.y = 0.01; group.add(plinth);
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.006, pole, 8), wood); staff.position.y = pole / 2; group.add(staff);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), brass); knob.position.y = pole + 0.008; group.add(knob);
  const swing = new THREE.Group(); swing.position.y = pole - height / 2 - 0.02; group.add(swing);  // turns around the pole
  const tilt = new THREE.Group(); swing.add(tilt);                                                   // leans towards the camera
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide, transparent: false, alphaTest: 0.5, toneMapped: false, visible: false });
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);   // the plaque (kept the name 'cloth' for the scene's click test)
  cloth.position.z = 0.012; cloth.userData.flagId = id; tilt.add(cloth);
  const ready = emblemCanvas(id).then(({ canvas, aspect }) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    const w = height * aspect;
    cloth.geometry.dispose(); cloth.geometry = new THREE.PlaneGeometry(w, height);
    mat.map = tex; mat.visible = true; mat.needsUpdate = true;
  }).catch((e) => console.warn("map3d emblem:", id, e));
  const tmp = new THREE.Vector3();
  // turn to the camera and lean back so the face is (almost) square to the view from any height
  function face(camera) {
    swing.getWorldPosition(tmp);
    const dx = camera.position.x - tmp.x, dz = camera.position.z - tmp.z, dy = camera.position.y - tmp.y;
    swing.rotation.y = Math.atan2(dx, dz);
    tilt.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz)) * 0.9;
  }
  return { group, swing, cloth, wave: () => {}, face, info: emblemInfo(id), ready };
}
