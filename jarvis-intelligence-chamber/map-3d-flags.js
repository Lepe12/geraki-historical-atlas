/* NABOU//X — waving period flags (c. 1577) for the 17 lanes of the 3D main map (3D only).
 * The state flags are real artwork from Wikimedia Commons (public domain, CC0 or CC BY-SA), vendored unchanged in
 * assets/nautical/flags/ — file, author and licence for each are in assets/nautical/flags/CREDITS.md.
 * Each SVG is rasterised in the browser to a 1024 px wide texture (sRGB, mipmaps, anisotropic filtering).
 * Where the design used in 1577 is uncertain, FLAGS[id].uncertain says why. Lanes that are not states
 * (travellers, research methods) get a plain parchment banner drawn here, not a historical flag. */

const DIR = "./assets/nautical/flags/";
const FLAGS = {
  spanish_simancas: { title: "Σταυρός της Βουργουνδίας (Ισπανία των Αψβούργων)", svg: "spanish_simancas.svg" },
  venetian: { title: "Λέων του Αγίου Μάρκου (Βενετία)", svg: "venetian.svg" },
  french: { title: "Λάβαρο με τους χρυσούς κρίνους (Γαλλία)", svg: "french.svg", uncertain: "η λευκή βασιλική σημαία είναι μεταγενέστερη· εδώ το λάβαρο με τους χρυσούς κρίνους σε μπλε" },
  british: { title: "Σταυρός του Αγίου Γεωργίου (Αγγλία)", svg: "british.svg", uncertain: "το 1577 δεν υπάρχει Βρετανία· η σημαία είναι της Αγγλίας" },
  dutch: { title: "Prinsenvlag (πορτοκαλί–λευκό–μπλε)", svg: "dutch.svg", uncertain: "σε χρήση μόλις από τη δεκαετία του 1570· πρώιμη" },
  german: { title: "Λάβαρο του αυτοκράτορα, δικέφαλος αετός (Αγία Ρωμαϊκή Αυτοκρατορία)", svg: "german.svg", uncertain: "τα γερμανικά κράτη είχαν και δικές τους σημαίες" },
  italian_states: { title: "Κλειδιά και ουμπρακούλο (λάβαρο της Εκκλησίας)", svg: "italian_states.svg", uncertain: "η λωρίδα καλύπτει πολλά ιταλικά κράτη· επιλέχθηκε το λάβαρο της Εκκλησίας (σχέδιο μεσαιωνικό)" },
  greek: { title: "Δικέφαλος αετός των Παλαιολόγων (βυζαντινή παράδοση)", svg: "greek.svg", uncertain: "το 1577 δεν υπάρχει ελληνικό κράτος· κατά το Commons το σχέδιο δεν χρησιμοποιήθηκε ποτέ ως σημαία" },
  ottoman: { title: "Σημαία με το Zulfiqar (Οθωμανική αυτοκρατορία)", svg: "ottoman.svg", uncertain: "κατά το Commons είναι προσέγγιση της σημαίας του Σελίμ Α' (δεκαετία 1510)· οι οθωμανικές σημαίες διέφεραν" },
  north_african: { title: "Σημαία του Αλγερίου κατά τον άτλαντα Al-Sharafi (Μπαρμπαριά)", svg: "north_african.svg", uncertain: "σύγχρονη αναπαράσταση από τον άτλαντα· οι σημαίες της Τύνιδας και της Τρίπολης διέφεραν" },
  travellers: { title: "Λάβαρο λωρίδας (όχι ιστορική σημαία)", draw: (g, w, h) => parchment(g, w, h, rose), neutral: true },
};
const NEUTRAL = { title: "Λάβαρο λωρίδας (όχι ιστορική σημαία)", draw: (g, w, h) => parchment(g, w, h, book), neutral: true };
export const flagInfo = (id) => FLAGS[id] || NEUTRAL;

const TEX_W = 1024;
function cloth(g, w, h) { // faint weave on the painted parts only, so it reads as fabric
  g.globalCompositeOperation = "source-atop"; g.fillStyle = "rgba(0,0,0,.05)";
  for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 2);
  g.globalCompositeOperation = "source-over";
}
// size of an SVG from its width/height or viewBox
function svgAspect(text) {
  const tag = (text.match(/<svg[^>]*>/i) || [""])[0];
  const num = (a) => { const m = tag.match(new RegExp("\\s" + a + "\\s*=\\s*[\"']\\s*([\\d.]+)\\s*(px)?[\"']")); return m ? +m[1] : 0; };
  const vb = tag.match(/viewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
  if (vb && +vb[2]) return +vb[1] / +vb[2];
  const w = num("width"), h = num("height");
  return w && h ? w / h : 1.5;
}
// paints the flag into a canvas (1024 px wide); resolves with { canvas, aspect }
export function flagCanvas(id) {
  const f = flagInfo(id);
  if (!f.svg) {
    const cv = document.createElement("canvas"); cv.width = TEX_W; cv.height = Math.round(TEX_W / 1.5);
    const g = cv.getContext("2d"); g.save(); g.scale(TEX_W / 768, TEX_W / 768); f.draw(g, 768, 512); g.restore(); cloth(g, cv.width, cv.height);
    return Promise.resolve({ canvas: cv, aspect: 1.5 });
  }
  return fetch(DIR + f.svg).then((r) => { if (!r.ok) throw new Error(f.svg + " " + r.status); return r.text(); }).then((text) => new Promise((ok, bad) => {
    const aspect = svgAspect(text), url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" })), img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas"); cv.width = TEX_W; cv.height = Math.round(TEX_W / aspect);
      const g = cv.getContext("2d"); g.drawImage(img, 0, 0, cv.width, cv.height); cloth(g, cv.width, cv.height);
      URL.revokeObjectURL(url); ok({ canvas: cv, aspect });
    };
    img.onerror = () => { URL.revokeObjectURL(url); bad(new Error("flag svg not decoded: " + f.svg)); };
    img.src = url;
  }));
}

/* ---------- parchment banners for lanes that are not states ---------- */
function parchment(g, w, h, sym) {
  g.fillStyle = "#efe2c0"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#8c1c14"; g.lineWidth = 22; g.strokeRect(26, 26, w - 52, h - 52);
  g.strokeStyle = "#2a190e"; g.lineWidth = 4; g.strokeRect(46, 46, w - 92, h - 92);
  sym(g, w / 2, h / 2);
}
function rose(g, x, y) {
  g.fillStyle = "#2a190e";
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, r = k % 2 ? 80 : 150; g.beginPath(); g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.lineTo(x + Math.cos(a + 0.35) * 26, y + Math.sin(a + 0.35) * 26); g.lineTo(x + Math.cos(a - 0.35) * 26, y + Math.sin(a - 0.35) * 26); g.fill(); }
  g.fillStyle = "#8c1c14"; g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.fill();
}
function book(g, x, y) {
  g.fillStyle = "#2a190e";
  g.beginPath(); g.moveTo(x - 170, y - 90); g.quadraticCurveTo(x - 80, y - 120, x - 6, y - 84); g.lineTo(x - 6, y + 110); g.quadraticCurveTo(x - 80, y + 76, x - 170, y + 106); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(x + 170, y - 90); g.quadraticCurveTo(x + 80, y - 120, x + 6, y - 84); g.lineTo(x + 6, y + 110); g.quadraticCurveTo(x + 80, y + 76, x + 170, y + 106); g.closePath(); g.fill();
  g.strokeStyle = "#efe2c0"; g.lineWidth = 5;
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * 30, y - 50 + k * 30); g.lineTo(x + s * 140, y - 56 + k * 30); g.stroke(); }
}

/* ---------- 3D flag on a pole ---------- */
export function makeFlag(THREE, renderer, id, { pole = 0.42, width = 0.34, maxHeight = 0.24 } = {}) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x2a190e, roughness: 0.6 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc09a4c, roughness: 0.35, metalness: 0.7 });
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, pole, 8), wood); staff.position.y = pole / 2; group.add(staff);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), brass); knob.position.y = pole + 0.008; group.add(knob);
  const info = flagInfo(id);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.85, alphaTest: 0.5, emissive: 0xffffff, emissiveIntensity: 0.3, visible: false });
  const swing = new THREE.Group(); group.add(swing);
  const cloth = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  cloth.castShadow = true; cloth.userData.flagId = id; swing.add(cloth);
  let geo = null, base = null, w = width;
  const phase = Math.random() * 6.28;
  function shape(aspect) {
    w = Math.min(width, maxHeight * aspect); const h = w / aspect;
    geo = new THREE.PlaneGeometry(w, h, 32, 12); geo.translate(w / 2 + 0.004, 0, 0);
    cloth.geometry.dispose(); cloth.geometry = geo; cloth.position.y = pole - h / 2 - 0.004;
    base = geo.attributes.position.array.slice(); wave(0);
  }
  // small waves only, so the emblem stays readable
  function wave(t) {
    if (!geo) return;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], q = x / w;
      p.setZ(i, q * (0.005 * Math.sin(x * 30 - t * 3.6 + phase) + 0.002 * Math.sin(y * 40 + x * 16 - t * 2.7)));
      p.setY(i, y - q * q * 0.004);
    }
    p.needsUpdate = true; geo.computeVertexNormals();
  }
  const ready = flagCanvas(id).then(({ canvas, aspect }) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    mat.map = tex; mat.emissiveMap = tex; mat.visible = true; mat.needsUpdate = true;
    shape(aspect);
  }).catch((e) => console.warn("map3d flag:", id, e));
  return { group, swing, cloth, wave, info, ready };
}
