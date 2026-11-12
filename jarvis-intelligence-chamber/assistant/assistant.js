/* NABOU voice assistant (Greek). Loaded only when the user presses the small launcher.
   Map controls remain local. Explicitly connected voice questions use the authenticated N7 chat.
   The research operator form is never submitted by voice. */
import { parse, afterWake, matchPlace } from "./assistant-intents.js";

const $ = (id) => document.getElementById(id);
let ui = null, holo = null, holoP = null;

const SAY = {
  open: "Καλώς ήρθες στο NABOU! Είμαι ο N7, ο βοηθός σου. Εδώ εξερευνούμε την ιστορία της Μεσογείου μέσα από χάρτες, ιστορικές πηγές και τεκμήρια. Πάτα «Σύνδεση με N7» για ερωτήσεις με τη μνήμη και τις πηγές σου.",
  close: "Επιστρέφω στη σφαίρα. Είμαι εδώ αν με χρειαστείς.",
  hello: "Γεια σου. Είμαι ο N7, ο βοηθός του χάρτη στο NABOU.",
  who: "Είμαι η φωνητική μορφή του N7 στον άτλαντα. Χειρίζομαι τον χάρτη και, όταν συνδεθείς, χρησιμοποιώ την ίδια συνομιλία, μνήμη έργου και βιβλιοθήκη του N7.",
  help: "Μπορείς να πεις: άνοιξε, κλείσε, γύρνα δεξιά ή αριστερά, ψάξε και μια λέξη, δείξε μου τον Λάντζα, δείξε την Κέρκυρα, τρισδιάστατο ή δισδιάστατο.",
  thanks: "Παρακαλώ.",
  unknown: "Συγγνώμη, δεν το κατάλαβα. Πες για παράδειγμα «ψάξε Μήλος» ή «δείξε μου τον Λάντζα».",
};

/* ---------- speech out ---------- */
let voice = null, utterance = null, speechSession = 0, speakingOut = false;
function pickVoice() {
  const all = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  const el = all.filter((v) => /^el(-|_|$)/i.test(v.lang));
  /* Prefer a Greek male voice, then any available Greek voice. */
  const male = /(stefanos|nestoras|στεφανος|νεστορας|\bmale\b)/i, female = /(female|melina|athina|αθηνα|μελινα)/i;
  voice = el.find((v) => male.test(v.name) && !female.test(v.name)) || el[0] || null;
  return voice;
}
if (window.speechSynthesis) { pickVoice(); speechSynthesis.addEventListener?.("voiceschanged", pickVoice); }

function say(text, spoken = text) {
  bubble(text, "nabou");
  const session = ++speechSession; speakingOut = true;
  try { rec?.abort(); } catch {}
  const done = () => { if (session !== speechSession) return; speakingOut = false; utterance = null; holo?.speaking(false); ui?.root.classList.remove("speaking"); if (wakeOn && ui && !ui.root.hidden) setTimeout(() => { if (wakeOn && !speakingOut && !listening) startRec(true); },300); };
  holo?.speaking(true); ui?.root.classList.add("speaking");
  if (window.speechSynthesis && (voice || pickVoice())) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = "el-GR"; u.voice = voice; u.rate = 0.96; u.pitch = 0.95;
    utterance = u;
    u.onend = done;
    u.onboundary = () => { try { holo?.kick?.(); } catch {} };
    u.onerror = () => { if (session !== speechSession) return; done(); setStatus("Η φωνή δεν ξεκίνησε. Πάτα ξανά το ολόγραμμα για να δοκιμάσεις."); };
    try { speechSynthesis.speak(u); } catch { u.onerror(); }
    setStatus(`Φωνή: ${voice.name}`);
  } else {
    setStatus("Δεν βρέθηκε ελληνική φωνή στη συσκευή· ο χαιρετισμός εμφανίζεται ως κείμενο.");
    setTimeout(done, Math.min(6000, 900 + text.length * 45));
  }
}

/* ---------- speech in ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, wakeOn = false, armedUntil = 0;
function startRec(continuous) {
  if (speakingOut) stopSpeech();
  if (!SR) { setStatus("Αυτό το πρόγραμμα περιήγησης δεν έχει αναγνώριση ομιλίας· γράψε την εντολή στο πεδίο."); return; }
  try { rec?.abort(); } catch {}
  rec = new SR(); rec.lang = "el-GR"; rec.interimResults = true; rec.continuous = continuous; rec.maxAlternatives = 1;
  rec.onstart = () => { listening = true; ui.root.classList.add("listening"); setStatus(continuous ? "Περιμένω τη λέξη «Ναμπού»…" : "Σε ακούω…"); };
  rec.onresult = (e) => {
    if (speakingOut) return; // Never send the assistant’s own spoken answer back to the model.
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
    if (wakeOn && !speakingOut && ui && !ui.root.hidden) setTimeout(() => { if (wakeOn && !speakingOut && !listening) startRec(true); }, 300);
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

let n7Pending = false;
async function askN7(text) {
  const link = window.N7VoiceLink;
  if (!link?.isConnected()) return say('Πάτησε «Σύνδεση με N7», συνδέσου στο παράθυρό του και διάλεξε συνομιλία ή έργο.');
  n7Pending = true; ui.root.querySelector('.nxa-send').disabled = true; ui.root.querySelector('.nxa-cancel-n7').disabled = false;
  setStatus('Το N7 ελέγχει τη μνήμη και τις πηγές και απαντά…');
  try {
    const result = await link.ask(text, {includeMap:ui.root.querySelector('.nxa-context-n7').checked});
    if (ui.root.hidden) return;
    if (result.queued) return say('Η ερώτηση μπήκε στην ιδιωτική ουρά του N7. Παρακολούθησε τη συνέχεια στο παράθυρό του.');
    if (result.cancelled) { bubble(result.text, 'nabou'); setStatus('Η απάντηση διακόπηκε. Το διαθέσιμο κείμενο βρίσκεται στο N7.'); return; }
    const spoken = result.text.replace(/https:\/\/\S+/g, 'σύνδεσμος πηγής').slice(0,3500);
    say(result.text, spoken + (result.text.length > 3500 ? ' Η πλήρης απάντηση βρίσκεται στη συνομιλία.' : ''));
  } catch (error) { if (!ui.root.hidden) say(error.message); }
  finally { n7Pending = false; ui.root.querySelector('.nxa-send').disabled = false; ui.root.querySelector('.nxa-cancel-n7').disabled = true; }
}
async function handle(text) {
  bubble(text, "user");
  if (/^(σταμάτα|σταματα|stop)$/iu.test(text.trim()) && n7Pending) { window.N7VoiceLink?.cancel(); stopSpeech(); return; }
  const it = parse(text);
  if (window.N7VoiceLink?.isConnected() && ['unknown','search','hello','who','help','thanks'].includes(it.type)) return askN7(text);
  if (it.type === 'unknown') return askN7(text);
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
function morphLabel(on) { const b = ui?.root.querySelector(".nxa-morph .nxa-l"); if (b) b.textContent = on ? "Κρύψε μορφή" : "Δείξε μορφή"; }
function setStatus(t) { if (ui) ui.status.textContent = t; }

function build() {
  const root = document.createElement("section");
  root.id = "nabouAssistant"; root.className = "nxa"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "N7 — φωνητικός βοηθός");
  root.innerHTML = `
    <header class="nxa-head"><span class="nxa-title">N7</span><small>φωνητικός βοηθός</small>
      <button type="button" class="nxa-x" aria-label="Κλείσιμο φωνής N7 (Esc)" title="Κλείσιμο (Esc)">×</button></header>
    <div class="nxa-stage"><canvas class="nxa-canvas" aria-hidden="true"></canvas><button type="button" class="nxa-greet" aria-label="Άκου τον χαιρετισμό του N7" title="Πάτα για να ακούσεις τον χαιρετισμό του N7"></button><p class="nxa-heard" aria-live="polite"></p></div>
    <div class="nxa-log" aria-live="polite"></div>
    <div class="nxa-n7"><label><input type="checkbox" class="nxa-context-n7" checked> Με τον επιλεγμένο τόπο και την περίοδο</label><button type="button" class="nxa-connect-n7">Σύνδεση με N7</button><button type="button" class="nxa-disconnect-n7">Αποσύνδεση</button><button type="button" class="nxa-cancel-n7" disabled>Διακοπή απάντησης N7</button></div>
    <form class="nxa-form"><input class="nxa-text" type="text" autocomplete="off" maxlength="6000" placeholder="Ρώτησε το N7 ή πες μια εντολή χάρτη…" aria-label="Εντολή προς τον βοηθό"><button type="submit" class="nxa-send">Στείλε</button></form>
    <div class="nxa-bar">
      <button type="button" class="nxa-mic" aria-label="Πάτα και μίλα" title="Πάτα και μίλα"><svg class="nxa-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4"/></svg><span class="nxa-l">Μίλα</span></button>
      <button type="button" class="nxa-wake" aria-pressed="false" aria-label="Να ακούει πάντα" title="Ακούει συνεχώς· ξεκίνα την εντολή με τη λέξη «Ναμπού»"><svg class="nxa-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h3l2-6 4 12 3-9 2 3h4"/></svg><span class="nxa-l">Ακούει</span></button>
      <button type="button" class="nxa-stop" aria-label="Διακοπή φωνής" title="Διακοπή φωνής"><svg class="nxa-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg><span class="nxa-l">Σίγαση</span></button>
      <button type="button" class="nxa-morph" aria-label="Εμφάνιση ή απόκρυψη της μορφής" title="Εμφάνιση ή απόκρυψη της μορφής"><svg class="nxa-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg><span class="nxa-l">Δείξε μορφή</span></button>
    </div>
    <p class="nxa-status"></p>`;
  document.body.appendChild(root);
  const q = (s) => root.querySelector(s);
  ui = { root, log: q(".nxa-log"), heard: q(".nxa-heard"), status: q(".nxa-status"), wake: q(".nxa-wake"), canvas: q(".nxa-canvas") };
  q('.nxa-connect-n7').onclick = () => { if (window.N7VoiceLink) window.N7VoiceLink.connect(); else setStatus('Η σύνδεση N7 δεν έχει φορτώσει. Ανανέωσε τη σελίδα.'); };
  q('.nxa-disconnect-n7').onclick = () => window.N7VoiceLink?.disconnect();
  q('.nxa-cancel-n7').onclick = () => { window.N7VoiceLink?.cancel(); stopSpeech(); };
  document.addEventListener('n7:voice-state', event => { q('.nxa-connect-n7').textContent = event.detail.state === 'connected' ? 'Άνοιγμα N7' : 'Σύνδεση με N7'; setStatus(event.detail.message); });
  q(".nxa-x").onclick = () => close();
  q(".nxa-greet").onclick = () => say(SAY.open);
  q(".nxa-stop").onclick = () => { stopSpeech(); setStatus("Η φωνή σταμάτησε."); };
  q(".nxa-mic").onclick = () => { wakeOn = false; ui.wake.setAttribute("aria-pressed", "false"); listening ? rec?.stop() : startRec(false); };
  ui.wake.onclick = () => { wakeOn = !wakeOn; ui.wake.setAttribute("aria-pressed", String(wakeOn)); if (wakeOn) startRec(true); else { try { rec?.stop(); } catch {} setStatus(""); } };
  q(".nxa-morph").hidden = true; // portrait withdrawn; no "show form" control
  q(".nxa-form").onsubmit = (e) => { e.preventDefault(); const v = q(".nxa-text").value; q(".nxa-text").value = ""; handle(v); };
  root.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  setStatus(SR ? "Πάτα «Πάτα και μίλα» και πες μια εντολή, ή άνοιξε το «Να ακούει πάντα» και ξεκίνα με «Ναμπού»." : "Αυτό το πρόγραμμα περιήγησης δεν έχει αναγνώριση ομιλίας· γράψε την εντολή στο πεδίο.");
  holoP = import("./assistant-scene.js?v=v2-mouth-1").then((m) => m.createHologram(ui.canvas)).then((h) => { holo = h; h.show(); morphLabel(true); return h; }) /* το ολόγραμμα φαίνεται από την αρχή */
    .catch((err) => { root.classList.add("no-webgl"); setStatus("Το ολόγραμμα δεν φορτώθηκε (WebGL): " + err.message); });
}

function stopSpeech() {
  speechSession++; speakingOut = false; utterance = null;
  window.speechSynthesis?.cancel();
  holo?.speaking(false); ui?.root.classList.remove("speaking");
  if (wakeOn && ui && !ui.root.hidden && !listening) setTimeout(() => { if (wakeOn && !speakingOut && !listening) startRec(true); },300);
}

export function open() {
  if (!ui) build();
  ui.root.hidden = false; holo?.resume();
  document.dispatchEvent(new CustomEvent("nabou:assistant", { detail: { open: true } }));
  ui.root.querySelector(".nxa-text").focus({ preventScroll: true });
  say(SAY.open);
  return holoP;
}
export function close() {
  if (!ui) return;
  if (n7Pending) window.N7VoiceLink?.cancel();
  wakeOn = false; ui.wake.setAttribute("aria-pressed", "false");
  try { rec?.abort(); } catch {}
  stopSpeech();
  ui.root.hidden = true; holo?.pause();
  document.dispatchEvent(new CustomEvent("nabou:assistant", { detail: { open: false } }));
}
export const isOpen = () => !!ui && !ui.root.hidden;
/* for tests / screenshots */
export const api = { handle, get holo() { return holo; }, ready: () => holoP };
