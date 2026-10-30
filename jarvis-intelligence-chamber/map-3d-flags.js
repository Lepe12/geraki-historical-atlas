/* NABOU//X — waving period flags (c. 1577) for the 17 lanes of the 3D main map (3D only).
 * Every flag is drawn here in code on a canvas, from well-known period designs. Where the design used in 1577
 * is uncertain, the best-supported design is drawn and FLAGS[id].uncertain says why. Lanes that are not
 * states (travellers, research methods) get a plain parchment banner, not a historical flag. */
const FLAGS = {
  spanish_simancas: { title: "Σταυρός της Βουργουνδίας (Ισπανία των Αψβούργων)", draw: burgundy },
  venetian: { title: "Λέων του Αγίου Μάρκου (Βενετία)", draw: venice, tails: true },
  french: { title: "Βασιλικό λάβαρο της Γαλλίας (κρίνοι σε μπλε)", draw: france, uncertain: "η λευκή βασιλική σημαία είναι μεταγενέστερη· εδώ το βασιλικό λάβαρο με τους χρυσούς κρίνους" },
  british: { title: "Σταυρός του Αγίου Γεωργίου (Αγγλία)", draw: stGeorge, uncertain: "το 1577 δεν υπάρχει Βρετανία· η σημαία είναι της Αγγλίας" },
  dutch: { title: "Prinsenvlag (πορτοκαλί–λευκό–μπλε)", draw: prinsenvlag, uncertain: "σε χρήση μόλις από τη δεκαετία του 1570 (Θαλάσσιοι Ζητιάνοι)· πρώιμη" },
  german: { title: "Αυτοκρατορικός αετός (Αγία Ρωμαϊκή Αυτοκρατορία)", draw: reich, uncertain: "λάβαρο με τον μαύρο δικέφαλο αετό σε χρυσό· τα γερμανικά κράτη είχαν και δικές τους σημαίες" },
  italian_states: { title: "Κλειδιά του Αγίου Πέτρου (Παπικό Κράτος)", draw: papal, uncertain: "η λωρίδα καλύπτει πολλά ιταλικά κράτη· επιλέχθηκε το Παπικό Κράτος" },
  greek: { title: "Δικέφαλος αετός (βυζαντινή παράδοση / Ορθόδοξη Εκκλησία)", draw: byzantine, uncertain: "το 1577 δεν υπάρχει ελληνικό κράτος· σύμβολο της βυζαντινής παράδοσης" },
  ottoman: { title: "Κόκκινη σημαία με τρεις ημισέληνους (Οθωμανική αυτοκρατορία)", draw: ottoman, uncertain: "οι οθωμανικές σημαίες του 16ου αι. διέφεραν (κόκκινες, πράσινες, με ημισέληνους)" },
  north_african: { title: "Πράσινη σημαία με το Zulfiqar (Μπαρμπαριά)", draw: barbary, uncertain: "οι σημαίες του Αλγερίου/Τύνιδας τον 16ο αι. είναι ελάχιστα τεκμηριωμένες" },
  travellers: { title: "Λάβαρο λωρίδας (όχι ιστορική σημαία)", draw: (g, w, h) => parchment(g, w, h, rose), neutral: true },
};
const NEUTRAL = { title: "Λάβαρο λωρίδας (όχι ιστορική σημαία)", draw: (g, w, h) => parchment(g, w, h, book), neutral: true };
export const flagInfo = (id) => FLAGS[id] || NEUTRAL;

const W = 768, H = 512;
export function flagCanvas(id) {
  const f = flagInfo(id), cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  f.draw(g, W, H);
  // cloth: faint weave and a darker hem so it reads as fabric
  g.globalAlpha = 0.07; g.fillStyle = "#000";
  for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
  g.globalAlpha = 1; g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
  if (f.tails) { // Venetian gonfalon: six tails on the fly
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 6; i++) { const y0 = (i * H) / 6; g.beginPath(); g.moveTo(W, y0 + 4); g.lineTo(W * 0.86, y0 + H / 12); g.lineTo(W, y0 + H / 6 - 4); g.closePath(); g.fill(); }
    g.globalCompositeOperation = "source-over";
  }
  return cv;
}

/* ---------- designs ---------- */
function burgundy(g, w, h) {
  g.fillStyle = "#f4efe2"; g.fillRect(0, 0, w, h);
  g.fillStyle = g.strokeStyle = "#b3201b";
  for (const [x0, y0, x1, y1] of [[40, 30, w - 40, h - 30], [w - 40, 30, 40, h - 30]]) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    g.lineWidth = 46; g.lineCap = "round"; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    for (let s = 60, k = 0; s < L - 50; s += 62, k++) { // raguly: cut-off branch stubs on alternate sides
      const side = k % 2 ? 1 : -1, cx = x0 + ux * s, cy = y0 + uy * s;
      g.beginPath();
      g.moveTo(cx + nx * side * 18 - ux * 14, cy + ny * side * 18 - uy * 14);
      g.lineTo(cx + nx * side * 46 + ux * 2, cy + ny * side * 46 + uy * 2);
      g.lineTo(cx + nx * side * 46 + ux * 24, cy + ny * side * 46 + uy * 24);
      g.lineTo(cx + nx * side * 18 + ux * 14, cy + ny * side * 18 + uy * 14);
      g.fill();
    }
  }
}
function stGeorge(g, w, h) {
  g.fillStyle = "#f4efe2"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#c01f1a"; g.fillRect(w / 2 - 52, 0, 104, h); g.fillRect(0, h / 2 - 52, w, 104);
}
function prinsenvlag(g, w, h) {
  for (const [i, c] of ["#e8781e", "#f4efe2", "#1f3f8c"].entries()) { g.fillStyle = c; g.fillRect(0, (i * h) / 3, w, h / 3 + 1); }
}
function fleur(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s); g.beginPath();
  g.moveTo(0, -60); g.bezierCurveTo(22, -38, 22, -10, 6, 8); g.lineTo(-6, 8); g.bezierCurveTo(-22, -10, -22, -38, 0, -60); // centre petal
  g.moveTo(8, 4); g.bezierCurveTo(30, -26, 66, -18, 52, 12); g.bezierCurveTo(44, -2, 28, 0, 14, 20); g.closePath();
  g.moveTo(-8, 4); g.bezierCurveTo(-30, -26, -66, -18, -52, 12); g.bezierCurveTo(-44, -2, -28, 0, -14, 20); g.closePath();
  g.rect(-30, 14, 60, 12);                                                     // band
  g.moveTo(-8, 26); g.lineTo(8, 26); g.lineTo(14, 52); g.lineTo(0, 44); g.lineTo(-14, 52); g.closePath(); // foot
  g.fill(); g.restore();
}
function france(g, w, h) {
  g.fillStyle = "#1f3a8a"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#e9c25a";
  fleur(g, w * 0.3, h * 0.3, 1.45); fleur(g, w * 0.7, h * 0.3, 1.45); fleur(g, w * 0.5, h * 0.72, 1.45);
}
function eagle(g, cx, cy, s, body, accent) {
  g.save(); g.translate(cx, cy); g.scale(s, s); g.fillStyle = body;
  for (const side of [-1, 1]) {
    g.beginPath(); // wing with feather fingers
    g.moveTo(side * 14, -18);
    g.bezierCurveTo(side * 60, -70, side * 120, -80, side * 150, -60);
    for (let k = 0; k < 5; k++) { const x = side * (150 - k * 16), y = -60 + k * 26; g.lineTo(x, y); g.lineTo(side * (132 - k * 16), y + 10); }
    g.lineTo(side * 20, 20); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(side * 6, -30); g.quadraticCurveTo(side * 18, -70, side * 34, -86); // neck
    g.lineTo(side * 52, -90); g.lineTo(side * 60, -80); g.lineTo(side * 44, -76); g.quadraticCurveTo(side * 30, -50, side * 18, -24); g.closePath(); g.fill();
    g.beginPath(); g.arc(side * 40, -86, 13, 0, Math.PI * 2); g.fill(); // head
    g.beginPath(); g.moveTo(side * 30, 40); g.lineTo(side * 50, 82); g.lineTo(side * 40, 84); g.lineTo(side * 20, 48); g.fill(); // legs
  }
  g.beginPath(); g.ellipse(0, 4, 28, 50, 0, 0, Math.PI * 2); g.fill(); // body
  g.beginPath(); g.moveTo(-26, 44); g.lineTo(0, 96); g.lineTo(26, 44); g.fill(); // tail
  g.fillStyle = accent;
  for (const side of [-1, 1]) { g.beginPath(); g.moveTo(side * 52, -90); g.lineTo(side * 64, -84); g.lineTo(side * 52, -80); g.fill(); } // beaks
  g.restore();
}
function reich(g, w, h) { g.fillStyle = "#e5b93d"; g.fillRect(0, 0, w, h); eagle(g, w / 2, h / 2 + 8, 1.95, "#141210", "#c0261c"); }
function byzantine(g, w, h) { g.fillStyle = "#9c1d17"; g.fillRect(0, 0, w, h); eagle(g, w / 2, h / 2 + 8, 1.95, "#e6bf55", "#e6bf55"); }
function crescent(g, x, y, r, field) {
  g.fillStyle = "#f4efe2"; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = field; g.beginPath(); g.arc(x + r * 0.32, y, r * 0.82, 0, Math.PI * 2); g.fill();
}
function ottoman(g, w, h) {
  const f = "#b31d18"; g.fillStyle = f; g.fillRect(0, 0, w, h);
  crescent(g, w * 0.32, h * 0.3, 78, f); crescent(g, w * 0.68, h * 0.3, 78, f); crescent(g, w * 0.5, h * 0.72, 78, f);
}
function barbary(g, w, h) {
  g.fillStyle = "#1d6b3a"; g.fillRect(0, 0, w, h);
  g.save(); g.translate(w / 2, h / 2); g.rotate(-0.12); g.fillStyle = "#f4efe2";
  g.fillRect(-250, -18, 46, 36); g.fillRect(-206, -48, 16, 96);           // grip and guard
  g.beginPath(); g.moveTo(-190, -26); g.lineTo(150, -26); g.lineTo(250, -62); g.lineTo(196, -10); g.lineTo(196, 10); // two-pointed blade
  g.lineTo(250, 62); g.lineTo(150, 26); g.lineTo(-190, 26); g.closePath(); g.fill();
  g.fillStyle = "#1d6b3a"; g.fillRect(-180, -3, 330, 6);
  g.restore();
}
function venice(g, w, h) {
  g.fillStyle = "#a3191b"; g.fillRect(0, 0, w, h);
  const gold = "#e8be50"; g.fillStyle = g.strokeStyle = gold;
  g.save(); g.translate(w * 0.56, h * 0.56); g.scale(-1, 1); // the lion faces the hoist
  g.beginPath(); g.ellipse(0, 0, 120, 44, 0, 0, Math.PI * 2); g.fill();           // body
  for (const x of [-92, -60, 70, 100]) { g.fillRect(x - 11, 20, 22, 92); g.fillRect(x - 15, 104, 30, 12); } // legs
  g.lineWidth = 14; g.lineCap = "round"; g.beginPath(); g.moveTo(-116, -8); g.bezierCurveTo(-190, -30, -170, -130, -128, -120); g.stroke(); // tail
  g.beginPath(); g.arc(-130, -122, 12, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(140, -40, 46, 0, Math.PI * 2); g.fill();                  // head with mane
  g.lineWidth = 6; g.beginPath(); g.arc(150, -48, 64, 0, Math.PI * 2); g.stroke(); // halo
  g.beginPath(); g.moveTo(-20, -30);                                              // raised wing
  g.bezierCurveTo(-40, -150, 40, -200, 90, -196);
  for (let k = 0; k < 5; k++) { g.lineTo(70 - k * 20, -160 + k * 22); g.lineTo(60 - k * 20, -150 + k * 22 + 12); }
  g.lineTo(30, -30); g.closePath(); g.fill();
  g.fillStyle = "#f4efe2"; g.fillRect(180, 10, 90, 64);                           // open book under the paw
  g.fillStyle = "#a3191b"; g.fillRect(223, 10, 4, 64);
  g.fillStyle = gold; g.fillRect(160, -10, 20, 70);                               // raised forepaw on the book
  g.fillStyle = "#a3191b"; g.beginPath(); g.arc(158, -52, 7, 0, Math.PI * 2); g.fill(); // eye
  g.restore();
}
function key(g, x, y, ang, col) {
  g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = g.strokeStyle = col; g.lineWidth = 16;
  g.beginPath(); g.arc(0, -150, 40, 0, Math.PI * 2); g.stroke();                 // bow
  g.fillRect(-9, -112, 18, 230);                                                  // shaft
  g.fillRect(-9, 80, 56, 18); g.fillRect(-9, 108, 46, 14); g.fillRect(28, 80, 14, 42); // bit
  g.restore();
}
function papal(g, w, h) {
  g.fillStyle = "#a8211c"; g.fillRect(0, 0, w, h);
  key(g, w / 2, h / 2 + 40, -0.6, "#e8be50"); key(g, w / 2, h / 2 + 40, 0.6, "#dcdcd6");
  g.fillStyle = "#e8be50"; g.beginPath(); g.moveTo(w / 2 - 44, 132); g.quadraticCurveTo(w / 2 - 44, 30, w / 2, 24); g.quadraticCurveTo(w / 2 + 44, 30, w / 2 + 44, 132); g.closePath(); g.fill(); // tiara
  g.fillStyle = "#a8211c"; for (const y of [56, 86, 116]) g.fillRect(w / 2 - 46, y, 92, 7);
}
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
export function makeFlag(THREE, renderer, id, { pole = 0.42, width = 0.27 } = {}) {
  const hgt = width * (H / W);
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x2a190e, roughness: 0.6 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc09a4c, roughness: 0.35, metalness: 0.7 });
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, pole, 8), wood); staff.position.y = pole / 2; group.add(staff);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), brass); knob.position.y = pole + 0.008; group.add(knob);
  const tex = new THREE.CanvasTexture(flagCanvas(id));
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const info = flagInfo(id);
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85, alphaTest: info.tails ? 0.5 : 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.28 });
  const geo = new THREE.PlaneGeometry(width, hgt, 24, 8);
  geo.translate(width / 2 + 0.004, 0, 0);
  const cloth = new THREE.Mesh(geo, mat);
  cloth.position.y = pole - hgt / 2 - 0.004; cloth.castShadow = true;
  cloth.userData.flagId = id;
  const swing = new THREE.Group(); swing.add(cloth); group.add(swing);
  const base = geo.attributes.position.array.slice();
  const p = geo.attributes.position, phase = Math.random() * 6.28;
  function wave(t) {
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], q = x / width;
      p.setZ(i, q * (0.014 * Math.sin(x * 38 - t * 4.2 + phase) + 0.006 * Math.sin(y * 50 + x * 20 - t * 3.1)));
      p.setY(i, y - q * q * 0.01);
    }
    p.needsUpdate = true; geo.computeVertexNormals();
  }
  wave(0);
  return { group, swing, cloth, wave, info };
}
