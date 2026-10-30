/* NABOU//X — heraldic banners (λάβαρα) for the 17 lanes of the 3D main map.
 * The artwork is exactly the banner the 2D map shows: window.NABOU_EMBLEMS.get(id) from nautical-emblems.js
 * (same SVG, same colours, including the tughra of Murad III for the Ottoman lane, which nautical-emblems.js puts in
 * the shared <defs>; we wait for NABOU_EMBLEMS.ready). Each banner SVG is made self-contained (the shared <defs> of
 * the page are copied in) and rasterised in the browser at 1024 px on its long side into an sRGB texture with mipmaps
 * and anisotropic filtering. The cloth is fully opaque (alpha-tested edges, no blending, no glow), hangs from its
 * crossbar at the top of a wooden pole with a small plinth and always turns to face the camera. */

const TEX = 1024;
const NS = "http://www.w3.org/2000/svg";
const TITLES = {
  spanish_simancas: "Σταυρός της Βουργουνδίας (Ισπανία των Αψβούργων)", venetian: "Λέων του Αγίου Μάρκου (Βενετία)",
  french: "Κρίνοι της Γαλλίας", british: "Αγγλία", dutch: "Prinsenvlag (Κάτω Χώρες)", german: "Δικέφαλος αετός (Αγία Ρωμαϊκή Αυτοκρατορία)",
  italian_states: "Κλειδιά του Αγίου Πέτρου (Παπικό Κράτος)", greek: "Δικέφαλος αετός (βυζαντινή παράδοση)",
  ottoman: "Τουγρά του Μουράτ Γ΄ (1574–1595), Οθωμανική αυτοκρατορία", north_african: "Δίκοπο σπαθί (Ζουλφικάρ) σε πράσινο με κόκκινο πλαίσιο (κουρσάροι της Βόρειας Αφρικής)",
};
export const emblemInfo = (id) => ({ title: TITLES[id] || "Λάβαρο λωρίδας (όπως στον 2D χάρτη)" });

let defsCache = null;
function pageDefs() {
  if (defsCache != null) return defsCache;
  const d = document.querySelector("#nxEmDefs defs");
  defsCache = d ? new XMLSerializer().serializeToString(d) : "";
  return defsCache;
}
const emblemSource = (id) => {
  const lib = window.NABOU_EMBLEMS;
  return lib ? Promise.resolve(lib.ready).then(() => lib.get(id)) : Promise.resolve(null);
};

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
export function makeEmblem(THREE, renderer, id, { pole = 0.42, height = 0.3 } = {}) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x2a190e, roughness: 0.6 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.02, 16), wood); plinth.position.y = 0.01; group.add(plinth);
  // the banner carries its own gilded finial and crossbar at the top of the cloth, level with the top of the pole
  const swing = new THREE.Group(); group.add(swing);  // turns around the pole
  const tilt = new THREE.Group(); swing.add(tilt);                                                   // leans towards the camera
  // the pole: up to the middle of the cloth it stands on the ground; the upper part leans with the cloth and stays
  // right behind it (it would otherwise cut through the cloth when the banner leans towards a high camera)
  const pivot = pole + 0.006 - height / 2; swing.position.y = pivot;
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.006, pivot, 8), wood); staff.position.y = pivot / 2; group.add(staff);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, height / 2 - 0.012, 8), wood); upper.position.y = (height / 2 - 0.012) / 2; tilt.add(upper);
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
