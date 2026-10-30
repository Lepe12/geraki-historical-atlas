/* NABOU voice assistant (Greek). Loaded only when the user presses the small launcher.
   Safety: it never submits the operator form and never calls the research API; "ψάξε" only
   writes the words into the query box and filters what is already on the page. */
import { parse, afterWake, matchPlace } from "./assistant-intents.js";

const $ = (id) => document.getElementById(id);
let ui = null, holo = null, holoP = null;

const SAY = {
  open: "Είμαι εδώ. Πες μου τι να ψάξω ή τι να σου δείξω.",
  close: "Επιστρέφω στη σφαίρα. Είμαι εδώ αν με χρειαστείς.",
  hello: "Γεια σου. Είμαι ο Ναμπού, ο βοηθός του χάρτη.",
  who: "Είμαι ο Ναμπού, ο φωνητικός βοηθός του NABOU//X. Ψάχνω στις έρευνες και στα ευρήματα της σελίδας και σου δείχνω τόπους στον χάρτη.",
  help: "Μπορείς να πεις: άνοιξε, κλείσε, γύρνα δεξιά ή αριστερά, ψάξε και μια λέξη, δείξε μου τον Λάντζα, δείξε την Κέρκυρα, τρισδιάστατο ή δισδιάστατο.",
  thanks: "Παρακαλώ.",
  unknown: "Συγγνώμη, δεν το κατάλαβα. Πες για παράδειγμα «ψάξε Μήλος» ή «δείξε μου τον Λάντζα».",
};

/* ---------- speech out ---------- */
let voice = null;
function pickVoice() {
  const all = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  const el = all.filter((v) => /^el(-|_|$)/i.test(v.lang));
  /* male Greek voice only (the figure is a man): Windows "Microsoft Stefanos", Edge online "Nestoras".
     Without one the answer stays as text. */
  const male = /(stefanos|nestoras|στεφανος|νεστορας|\bmale\b)/i, female = /(female|melina|athina|αθηνα|μελινα)/i;
  voice = el.find((v) => male.test(v.name) && !female.test(v.name)) || null;
  return voice;
}
if (window.speechSynthesis) { pickVoice(); speechSynthesis.addEventListener?.("voiceschanged", pickVoice); }

function say(text) {
  bubble(text, "nabou");
  const done = () => { holo?.speaking(false); ui?.root.classList.remove("speaking"); };
  holo?.speaking(true); ui?.root.classList.add("speaking");
  if (window.speechSynthesis && (voice || pickVoice())) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "el-GR"; u.voice = voice; u.rate = 0.96; u.pitch = 0.95;
    u.onend = u.onerror = done;
    speechSynthesis.speak(u);
    setStatus(`Φωνή: ${voice.name}`);
  } else {
    setStatus("Δεν βρέθηκε ανδρική ελληνική φωνή στη συσκευή· η απάντηση φαίνεται ως κείμενο.");
    setTimeout(done, Math.min(6000, 900 + text.length * 45));
  }
}

/* ---------- speech in ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, wakeOn = false, armedUntil = 0;
function startRec(continuous) {
  if (!SR) { setStatus("Αυτό το πρόγραμμα περιήγησης δεν έχει αναγνώριση ομιλίας· γράψε την εντολή στο πεδίο."); return; }
  try { rec?.abort(); } catch {}
  rec = new SR(); rec.lang = "el-GR"; rec.interimResults = true; rec.continuous = continuous; rec.maxAlternatives = 1;
  rec.onstart = () => { listening = true; ui.root.classList.add("listening"); setStatus(continuous ? "Περιμένω τη λέξη «Ναμπού»…" : "Σε ακούω…"); };
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i], text = r[0].transcript;
      ui.heard.textContent = text;
      if (!r.isFinal) continue;
      if (!continuous) { handle(text); continue; }
      const rest = afterWake(text);
      if (rest === null) { if (Date.now() < armedUntil) { armedUntil = 0; handle(text); } continue; }
      if (rest) handle(rest); else { armedUntil = Date.now() + 8000; if (!holo?.active) { holo?.show(); morphLabel(true); } say("Σε ακούω."); }
    }
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") { wakeOn = false; ui.wake.setAttribute("aria-pressed", "false"); setStatus("Το μικρόφωνο δεν επιτρέπεται. Επίτρεψέ το από τις ρυθμίσεις του προγράμματος περιήγησης."); }
    else if (e.error === "network") setStatus("Η αναγνώριση ομιλίας χρειάζεται σύνδεση στο διαδίκτυο (την κάνει το πρόγραμμα περιήγησης).");
    else if (e.error !== "no-speech" && e.error !== "aborted") setStatus("Σφάλμα αναγνώρισης: " + e.error);
  };
  rec.onend = () => {
    listening = false; ui.root.classList.remove("listening");
    if (wakeOn && ui && !ui.root.hidden) setTimeout(() => wakeOn && startRec(true), 300);
  };
  try { rec.start(); } catch (err) { setStatus("Δεν ξεκίνησε η ακρόαση: " + err.message); }
}

/* ---------- actions on the page (read-only) ---------- */
function setInput(el, value) {
  if (!el) return false;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
function search(query) {
  const q = $("operatorQuery");
  if (q) q.value = query; // written only; the form is NOT submitted (that would start a new research run)
  const a = setInput($("historySearch"), query), b = setInput($("resultSearch"), query);
  const hist = $("researchHistory"); if (hist && "open" in hist) hist.open = true;
  say(`Έγραψα «${query}» στο πεδίο ερώτησης και φιλτράρισα τις αποθηκευμένες έρευνες${b ? " και τα ευρήματα" : ""}. Νέα έρευνα ξεκινά μόνο αν πατήσεις εσύ το βέλος «Έναρξη έρευνας».`);
  return { a, b };
}

const chart = () => window.NABOU_CHART || { k: 30, lon0: -20, my1: 66.48233060009922 };
function laneLonLat(l) {
  const c = chart(), lon = l.x / c.k + c.lon0, my = c.my1 - l.y / c.k;
  return { lon, lat: (2 * Math.atan(Math.exp(my * Math.PI / 180)) - Math.PI / 2) * 180 / Math.PI };
}
let routeStops = null;
async function places() {
  if (!routeStops) {
    try {
      const d = await (await fetch(new URL("../assets/nautical/routes/lantzas-1577-book3.json", import.meta.url))).json();
      routeStops = d.stops.map((s) => ({ kind: "stop", names: [s.place, ...String(s.historicalNames || "").split("/")].map((x) => x.trim()).filter(Boolean), label: String(s.historicalNames || s.place).split("/").pop().trim(), lon: s.lon, lat: s.lat }));
    } catch { routeStops = []; }
  }
  const lanes = (window.NABOU_LANES || []).map((l) => ({ kind: l.kind === "science" ? "science" : "lane", lane: l, label: l.name, names: [l.name, String(l.place || "").split("—")[0].trim()], ...laneLonLat(l) }));
  return [...routeStops, ...lanes];
}
async function map3d(on) {
  const m = window.NABOU_MAP3D;
  if (!m) return false;
  if (on && m.supported === false) return false;
  if (m.enabled !== on) m.set(on);
  if (on) await m.whenReady();
  return true;
}
async function focus3d(lon, lat, dist = 0.45, tilt = 42) {
  const m = window.NABOU_MAP3D; if (!m || !(await map3d(true))) return false;
  const p = m.camera({}) || {}; m.camera({ tilt, rot: p.rot ?? 0, dist: (p.dist || 10) * dist, lon, lat });
  return true;
}
async function showPlace(name) {
  const p = matchPlace(name, await places());
  if (!p) return say(`Δεν βρήκα τον τόπο «${name}» στον χάρτη. Δοκίμασε μια διαδρομή, π.χ. Βενετία ή Κέρκυρα.`);
  if (p.kind === "lane") {
    const label = document.querySelector(`#nodeLabels .node-label[data-emblem="${p.lane.agentId}"]`);
    label?.click();
    if (window.NABOU_MAP3D?.enabled) await focus3d(p.lon, p.lat);
    return say(`Σου δείχνω τη διαδρομή «${p.label}».`);
  }
  if (p.kind === "science") { document.querySelector(`#nodeLabels .node-label[data-emblem="${p.lane.agentId}"]`)?.click(); return say(`Άνοιξα τη διαδρομή «${p.label}».`); }
  const ok = await focus3d(p.lon, p.lat, 0.35);
  say(ok ? `Σου δείχνω τη στάση «${p.label}» στη διαδρομή του Λάντζα.` : "Ο τρισδιάστατος χάρτης δεν υποστηρίζεται σε αυτή τη συσκευή.");
}
async function showLantzas() {
  if (!(await map3d(true))) return say("Ο τρισδιάστατος χάρτης δεν υποστηρίζεται σε αυτή τη συσκευή.");
  await focus3d(21.6, 38.9, 0.6, 38);
  const m = window.NABOU_MAP3D;
  for (let i = 0; i < 40 && !m.route; i++) await new Promise((r) => setTimeout(r, 100));
  m.route?.play?.();
  say("Ορίστε η διαδρομή του Πέτρου Λάντζα, 1577: Κέρκυρα, Ραγούσα, Χάνδακας, Πόρτο Κάγιο.");
}

async function handle(text) {
  bubble(text, "user");
  const it = parse(text);
  switch (it.type) {
    case "none": return;
    case "open": holo?.show(); morphLabel(true); return say(SAY.open);
    case "close": holo?.hide(); morphLabel(false); return say(SAY.close);
    case "turn": holo?.show(); morphLabel(true); holo?.turn(it.dir); return say(it.dir === 0 ? "Κοιτάζω μπροστά." : it.dir > 0 ? "Γυρίζω δεξιά." : "Γυρίζω αριστερά.");
    case "look": holo?.show(); morphLabel(true); holo?.look(it.pitch); return say(it.pitch < 0 ? "Κοιτάζω πάνω." : "Κοιτάζω κάτω.");
    case "nod": holo?.show(); morphLabel(true); holo?.nod(); return say("Μάλιστα.");
    case "search": return search(it.query);
    case "lantzas": return showLantzas();
    case "place": return showPlace(it.place);
    case "map3d": { const ok = await map3d(it.on); return say(!ok ? "Ο τρισδιάστατος χάρτης δεν υποστηρίζεται σε αυτή τη συσκευή." : it.on ? "Ο χάρτης είναι τώρα τρισδιάστατος." : "Ο χάρτης είναι τώρα δισδιάστατος."); }
    default: return say(SAY[it.type] || SAY.unknown);
  }
}

/* ---------- overlay ---------- */
function bubble(text, who) {
  const b = document.createElement("p"); b.className = "nxa-msg " + who; b.textContent = text;
  ui.log.appendChild(b); while (ui.log.children.length > 6) ui.log.firstChild.remove();
  ui.log.scrollTop = ui.log.scrollHeight;
}
function morphLabel(on) { const b = ui?.root.querySelector(".nxa-morph"); if (b) b.textContent = on ? "Κρύψε τη μορφή" : "Δείξε τη μορφή"; }
function setStatus(t) { if (ui) ui.status.textContent = t; }

function build() {
  const root = document.createElement("section");
  root.id = "nabouAssistant"; root.className = "nxa"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Ναμπού — φωνητικός βοηθός");
  root.innerHTML = `
    <header class="nxa-head"><span class="nxa-title">ΝΑΜΠΟΥ</span><small>φωνητικός βοηθός</small>
      <button type="button" class="nxa-x" aria-label="Κλείσιμο βοηθού">×</button></header>
    <div class="nxa-stage"><canvas class="nxa-canvas" aria-hidden="true"></canvas><p class="nxa-heard" aria-live="polite"></p></div>
    <div class="nxa-log" aria-live="polite"></div>
    <form class="nxa-form"><input class="nxa-text" type="text" autocomplete="off" placeholder="Γράψε ή πες μια εντολή…" aria-label="Εντολή προς τον βοηθό"><button type="submit" class="nxa-send">Στείλε</button></form>
    <div class="nxa-bar">
      <button type="button" class="nxa-mic" aria-label="Πάτα και μίλα">● Πάτα και μίλα</button>
      <button type="button" class="nxa-wake" aria-pressed="false" title="Ακούει συνεχώς· ξεκίνα την εντολή με «Ναμπού»">Να ακούει πάντα</button>
      <button type="button" class="nxa-morph">Δείξε τη μορφή</button>
    </div>
    <p class="nxa-status"></p>`;
  document.body.appendChild(root);
  const q = (s) => root.querySelector(s);
  ui = { root, log: q(".nxa-log"), heard: q(".nxa-heard"), status: q(".nxa-status"), wake: q(".nxa-wake"), canvas: q(".nxa-canvas") };
  q(".nxa-x").onclick = () => close();
  q(".nxa-mic").onclick = () => { wakeOn = false; ui.wake.setAttribute("aria-pressed", "false"); listening ? rec?.stop() : startRec(false); };
  ui.wake.onclick = () => { wakeOn = !wakeOn; ui.wake.setAttribute("aria-pressed", String(wakeOn)); if (wakeOn) startRec(true); else { try { rec?.stop(); } catch {} setStatus(""); } };
  q(".nxa-morph").onclick = () => handle(holo?.active ? "κλείσε" : "άνοιξε");
  q(".nxa-form").onsubmit = (e) => { e.preventDefault(); const v = q(".nxa-text").value; q(".nxa-text").value = ""; handle(v); };
  root.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  setStatus(SR ? "Πάτα «Πάτα και μίλα» και πες μια εντολή, ή άνοιξε το «Να ακούει πάντα» και ξεκίνα με «Ναμπού»." : "Αυτό το πρόγραμμα περιήγησης δεν έχει αναγνώριση ομιλίας· γράψε την εντολή στο πεδίο.");
  holoP = import("./assistant-scene.js").then((m) => m.createHologram(ui.canvas)).then((h) => (holo = h))
    .catch((err) => { root.classList.add("no-webgl"); setStatus("Το ολόγραμμα δεν φορτώθηκε (WebGL): " + err.message); });
}

export function open() {
  if (!ui) build();
  ui.root.hidden = false; holo?.resume();
  document.dispatchEvent(new CustomEvent("nabou:assistant", { detail: { open: true } }));
  ui.root.querySelector(".nxa-text").focus({ preventScroll: true });
  return holoP;
}
export function close() {
  if (!ui) return;
  wakeOn = false; ui.wake.setAttribute("aria-pressed", "false");
  try { rec?.abort(); } catch {}
  window.speechSynthesis?.cancel();
  ui.root.hidden = true; holo?.pause();
  document.dispatchEvent(new CustomEvent("nabou:assistant", { detail: { open: false } }));
}
export const isOpen = () => !!ui && !ui.root.hidden;
/* for tests / screenshots */
export const api = { handle, get holo() { return holo; }, ready: () => holoP };
