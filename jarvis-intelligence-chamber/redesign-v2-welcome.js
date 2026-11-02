/* NABOU//X — σελίδα καλωσορίσματος με το ολόγραμμα του βοηθού (assistant/assistant-scene.js).
   Εμφανίζεται μία φορά ανά συνεδρία· δεν εμφανίζεται σε άμεσους συνδέσμους (?run=…, ?skip, #…). Enter ή «Είσοδος» → fade ~400ms. */
const html = document.documentElement, root = document.getElementById("v2welcome");
if (root && !html.classList.contains("v2-welcome-on")) root.remove();
else if (root) {
  const btn = document.getElementById("v2wEnter"), canvas = document.getElementById("v2wCanvas"), app = document.getElementById("viewport");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let holo = null, done = false, raf = 0, speakingNow = false, kickUntil = 0;
  app?.setAttribute("inert", "");
  app?.setAttribute("aria-hidden", "true");
  btn.focus({ preventScroll: true });

  function enter() {
    if (done) return;
    done = true;
    try { sessionStorage.setItem("nx-v2-seen", "1"); } catch {}
    root.classList.add("leaving");
    app?.removeAttribute("inert");
    app?.removeAttribute("aria-hidden");
    setTimeout(() => {
      cancelAnimationFrame(raf);
      try { holo?.dispose(); } catch {}
      html.classList.remove("v2-welcome-on");
      root.remove();
      if (matchMedia("(hover: hover) and (pointer: fine)").matches) document.getElementById("operatorQuery")?.focus({ preventScroll: true });
    }, reduce ? 20 : 420);
  }
  btn.addEventListener("click", enter);
  const muteBtn = document.getElementById("v2wMute");
  document.addEventListener("keydown", (e) => {
    if (done) return;
    if (e.key === "Enter" && e.target !== btn && e.target !== muteBtn) { e.preventDefault(); enter(); }
    else if (e.key === "Tab") { // εστίαση παγιδευμένη στα δύο κουμπιά του καλωσορίσματος
      e.preventDefault();
      const ring = [btn, muteBtn && !muteBtn.hidden ? muteBtn : null].filter(Boolean);
      const i = ring.indexOf(document.activeElement);
      ring[(i + (e.shiftKey ? ring.length - 1 : 1)) % ring.length].focus();
    }
  });

  // Ζωντάνια ολογράμματος όσο μιλάει. Με reduced-motion: μόνο στατική αύξηση φωτεινότητας, χωρίς παλμό.
  function applySpeaking() {
    if (!holo) return;
    try { if (!reduce) holo.speaking(speakingNow); } catch {}
    if (reduce) holo.tune(speakingNow ? { uGain: 0.8, uSize: 0.046, strength: 0.95 } : { uGain: 0.62, uSize: 0.04, strength: 0.7 });
  }

  const hasGL = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };
  if (!hasGL()) root.classList.add("no-webgl");
  else {
    import("./assistant/assistant-scene.js")
      .then((m) => m.createHologram(canvas))
      .then((h) => {
        if (done) { h.dispose(); return; }
        holo = h;
        h.jump(1); // πορτραίτο του χαρτογράφου από το νέφος σημείων
        h.tune({ uGain: 0.62, uSize: 0.04 });
        applySpeaking();
        if (reduce) { h.freeze(2.2); return; }
        const t0 = performance.now();
        const loop = (now) => { // απαλή «αναπνοή»: φωτεινότητα και μέγεθος σημείων· πιο έντονος παλμός όσο μιλάει
          const s = Math.sin((now - t0) / 1000 * 1.05);
          if (speakingNow) {
            const p = Math.sin((now - t0) / 1000 * 7.5), k = now < kickUntil ? 1 : 0.55;
            h.tune({ uGain: 0.8 + 0.16 * p * k, uSize: 0.046 + 0.006 * p * k, strength: 0.95 + 0.2 * p * k });
          } else h.tune({ uGain: 0.62 + 0.14 * s, uSize: 0.04 + 0.004 * s, strength: 0.7 + 0.12 * s });
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      })
      .catch(() => root.classList.add("no-webgl"));
  }

  /* ---------- Φωνητικός χαιρετισμός στο πρώτο άγγιγμα / πλήκτρο ----------
     Οι browsers μπλοκάρουν την ομιλία πριν από user activation, γι' αυτό περιμένουμε την πρώτη κίνηση του χρήστη.
     Η επιλογή φωνής ακολουθεί τη λογική του assistant/assistant.js (προτίμηση σε ελληνική ανδρική φωνή, αλλιώς οποιαδήποτε el). */
  const GREETING_FULL = "Καλώς ήρθες στο Ναμπού. Είμαι ο ψηφιακός σου χαρτογράφος. Πάτησε Είσοδο για να ξεκινήσουμε την έρευνα."; // «Ναμπού» = προφορά του NABOU//X
  const GREETING_SHORT = "Καλώς ήρθες.";
  const MUTE_KEY = "nx-v2-welcome-mute";
  const synth = window.speechSynthesis, hint = document.getElementById("v2wGreetHint");
  const store = { get() { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; } }, set(v) { try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch {} } };
  let muted = store.get(), spoken = false, utter = null, voice = null;

  const greekVoices = () => ((synth && synth.getVoices && synth.getVoices()) || []).filter((v) => /^el(-|_|$)/i.test(v.lang));
  function pickVoice() {
    const el = greekVoices();
    const male = /(stefanos|nestoras|στεφανος|νεστορας|\bmale\b)/i, female = /(female|melina|athina|αθηνα|μελινα)/i;
    voice = el.find((v) => male.test(v.name) && !female.test(v.name)) || el[0] || null;
    return voice;
  }
  // Υποστηρίζεται αν υπάρχει speechSynthesis και είτε υπάρχει ελληνική φωνή είτε η λίστα φωνών δεν έχει φορτώσει ακόμη (Android)
  const supported = () => !!synth && typeof SpeechSynthesisUtterance !== "undefined" && (greekVoices().length > 0 || ((synth.getVoices && synth.getVoices()) || []).length === 0);

  function syncUI() {
    const ok = supported();
    if (muteBtn) {
      muteBtn.hidden = !ok;
      muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
      muteBtn.setAttribute("aria-label", muted ? "Ενεργοποίηση φωνής του χαρτογράφου" : "Σίγαση φωνής του χαρτογράφου");
      muteBtn.title = muteBtn.getAttribute("aria-label");
      muteBtn.textContent = muted ? "🔇" : "🔊";
    }
    if (hint) hint.hidden = !ok || muted || spoken || hintGone;
  }
  let hintGone = false;
  function hideHint() { hintGone = true; if (hint) { hint.classList.add("gone"); setTimeout(() => { hint.hidden = true; }, 500); } }

  function stopSpeech() {
    if (utter) { try { synth.cancel(); } catch {} utter = null; }
    speakState(false);
  }
  function speakState(v) { speakingNow = v; applySpeaking(); }

  function speak(text) {
    if (!supported() || muted || spoken) return false;
    pickVoice();
    spoken = true;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "el-GR"; if (voice) u.voice = voice; u.rate = 0.96; u.pitch = 0.95;
    utter = u;
    u.onstart = () => speakState(true);
    u.onboundary = () => { kickUntil = performance.now() + 220; };
    u.onend = () => { if (utter === u) { utter = null; speakState(false); } };
    u.onerror = (ev) => {
      if (utter === u) { utter = null; speakState(false); }
      if (ev && ev.error === "not-allowed") spoken = false; // π.χ. touchstart δεν μετρά ως activation στον Chrome — νέα προσπάθεια στο επόμενο συμβάν (touchend/click)
    };
    try { synth.cancel(); synth.speak(u); speakState(true); } catch { utter = null; spoken = false; return false; }
    return true;
  }

  if (supported() || synth) {
    syncUI();
    synth?.addEventListener?.("voiceschanged", () => { pickVoice(); syncUI(); });
    muteBtn?.addEventListener("click", () => {
      muted = !muted; store.set(muted);
      if (muted) stopSpeech();
      syncUI();
      if (!muted && !spoken) { hideHint(); speak(GREETING_FULL); }
    });
    // Πρώτη κίνηση: pointerdown / touchstart / keydown (+ pointerup/touchend/click ως εφεδρεία για touch)
    const onGesture = (e) => {
      if (done || spoken || muted || !synth) return;
      if (e.target && e.target.closest && e.target.closest("#v2wMute")) return; // το κουμπί σίγασης δεν ενεργοποιεί χαιρετισμό
      if (e.type === "keydown" && (e.key === "Escape" || e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta" || e.key === "CapsLock")) return;
      const onEnterBtn = !!(e.target && e.target.closest && e.target.closest("#v2wEnter"));
      const entering = e.type === "keydown" ? e.key === "Enter" : onEnterBtn; // Enter ή κλικ στο «Είσοδος» → σύντομος χαιρετισμός
      hideHint();
      speak(entering ? GREETING_SHORT : GREETING_FULL);
    };
    for (const t of ["pointerdown", "touchstart", "keydown", "pointerup", "touchend", "click"]) document.addEventListener(t, onGesture, { capture: true, passive: true });
    // Αν ο χρήστης ανοίξει τον βοηθό, σταματά ο χαιρετισμός ώστε να μην επικαλύπτονται
    document.addEventListener("click", (e) => { if (e.target.closest?.("#nabouAssistantLauncher, .nxa")) { stopSpeech(); spoken = true; } }, true);
    window.addEventListener("pagehide", stopSpeech);
  } else { if (muteBtn) muteBtn.hidden = true; if (hint) hint.hidden = true; }
}
