"use strict";
(() => {
  const form = document.getElementById('operatorCommand');
  const input = document.getElementById('operatorQuery');
  if (!form || !input) return;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  const canSpeak = Boolean(synth && window.SpeechSynthesisUtterance);
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.id = 'voiceToggle'; toggle.className = 'voice-toggle';
  toggle.textContent = 'ΦΩΝΗ'; toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'voicePanel');
  const dock = document.createElement('div');
  dock.id = 'voiceDock'; dock.className = 'voice-dock';
  dock.append(toggle); document.getElementById('app').append(dock);
  const panel = document.createElement('section');
  panel.id = 'voicePanel'; panel.className = 'voice-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Φωνή NABOU');
  panel.innerHTML = `<div class="voice-heading"><strong>Φωνή NABOU</strong><button type="button" id="voiceClose" aria-label="Κλείσιμο φωνής">×</button></div>
    <div class="voice-actions"><button type="button" id="voiceMic" aria-pressed="false">Μίλησε το ερώτημα</button><button type="button" id="voiceRead">Άκου σύνοψη</button><button type="button" id="voiceStop" disabled>Διακοπή</button></div>
    <p id="voiceStatus" role="status" aria-live="polite">Το μικρόφωνο ανοίγει μόνο όταν πατήσετε «Μίλησε το ερώτημα».</p>
    <details><summary>Ρυθμίσεις φωνής</summary><label for="voiceLanguage">Γλώσσα υπαγόρευσης</label><select id="voiceLanguage"><option value="el-GR">Ελληνικά</option><option value="en-US">English</option></select>
    <label for="voiceChoice">Φωνή ανάγνωσης της συσκευής</label><select id="voiceChoice"></select><small id="voiceAvailability"></small>
    <label class="voice-auto"><input type="checkbox" id="voiceAuto"> Να ακούγονται η έναρξη και η ολοκλήρωση της δικής μου έρευνας</label></details>
    <small>Η υπαγόρευση συμπληρώνει το πεδίο. Ελέγξτε το κείμενο και πατήστε «ΕΡΕΥΝΑ» για αποστολή. Ο browser ενδέχεται να στέλνει τον ήχο στην υπηρεσία αναγνώρισής του. Η ανάγνωση χρησιμοποιεί τα καταγεγραμμένα δεδομένα της έρευνας.</small>`;
  dock.append(panel);
  const $ = id => document.getElementById(id);
  const mic = $('voiceMic'), read = $('voiceRead'), stop = $('voiceStop'), status = $('voiceStatus');
  const language = $('voiceLanguage'), choice = $('voiceChoice'), auto = $('voiceAuto');
  let recognition = null, listening = false, speaking = false, session = 0, voices = [], utterance = null;
  let ownRequest = '', ownRun = '', announced = new Set();
  const sayStatus = text => { status.textContent = text; };
  const update = () => {
    mic.disabled = !Recognition || input.disabled;
    mic.textContent = listening ? 'Τέλος υπαγόρευσης' : 'Μίλησε το ερώτημα';
    mic.setAttribute('aria-pressed', String(listening));
    read.disabled = !canSpeak;
    stop.disabled = !listening && !speaking;
    toggle.classList.toggle('is-active', listening || speaking);
    document.body.dataset.voiceState = listening ? 'LISTENING' : speaking ? 'SPEAKING' : 'IDLE';
  };
  function halt(message) {
    const wasActive = listening || speaking;
    session++; const previous = recognition; recognition = null; listening = false;
    if (previous) { previous.onresult = previous.onerror = previous.onend = null; try { previous.abort(); } catch (_) {} }
    speaking = false; utterance = null;
    if (canSpeak) synth.cancel();
    update(); if (message) sayStatus(message); else if (wasActive) sayStatus('Η φωνή σταμάτησε.');
  }
  function close() { halt(); panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
  toggle.addEventListener('click', () => { if (!panel.hidden) return close(); panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); update(); });
  $('voiceClose').addEventListener('click', close);
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  stop.addEventListener('click', () => halt('Η φωνή σταμάτησε.'));
  function populateVoices() {
    const selected = choice.value;
    voices = canSpeak ? synth.getVoices() : [];
    choice.replaceChildren();
    const defaultOption = document.createElement('option'); defaultOption.value = ''; defaultOption.textContent = 'Αυτόματη επιλογή ελληνικής φωνής'; choice.append(defaultOption);
    for (const voice of voices) { const option = document.createElement('option'); option.value = voice.voiceURI; option.textContent = voice.name + ' · ' + voice.lang; choice.append(option); }
    if (voices.some(v => v.voiceURI === selected)) choice.value = selected;
    choice.disabled = !canSpeak || !voices.length;
    $('voiceAvailability').textContent = !canSpeak ? 'Η ανάγνωση δεν υποστηρίζεται σε αυτόν τον browser.' : voices.some(v => /^el(?:-|$)/i.test(v.lang)) ? 'Διαθέσιμη ελληνική φωνή. Μπορείτε να επιλέξετε άλλη από τη λίστα.' : 'Δεν εμφανίζεται ελληνική φωνή στη συσκευή. Η αυτόματη ανάγνωση ελληνικών μπορεί να μην είναι διαθέσιμη.';
  }
  populateVoices();
  if (canSpeak) synth.addEventListener('voiceschanged', populateVoices);
  if (!Recognition) { mic.title = 'Η υπαγόρευση δεν υποστηρίζεται εδώ. Μπορείτε να γράψετε το ερώτημα ή να χρησιμοποιήσετε το μικρόφωνο του πληκτρολογίου.'; sayStatus(mic.title); }
  if (!canSpeak) auto.disabled = true;
  function speak(text) {
    if (!canSpeak || !text || document.hidden) return;
    halt(); const token = session;
    const u = new SpeechSynthesisUtterance(text.slice(0, 6000));
    const voice = voices.find(v => v.voiceURI === choice.value) || voices.find(v => /^el(?:-|$)/i.test(v.lang));
    u.lang = voice?.lang || 'el-GR'; if (voice) u.voice = voice; u.rate = 1;
    utterance = u; speaking = true; update(); sayStatus('Ανάγνωση…');
    u.onend = () => { if (token !== session) return; speaking = false; utterance = null; update(); sayStatus('Η ανάγνωση ολοκληρώθηκε.'); };
    u.onerror = () => { if (token !== session) return; speaking = false; utterance = null; update(); sayStatus('Η φωνή δεν μπόρεσε να ξεκινήσει. Δοκιμάστε άλλη διαθέσιμη φωνή στις ρυθμίσεις.'); };
    try { synth.speak(u); } catch (_) { u.onerror(); }
  }
  function summary() {
    const state = document.body.dataset.researchVisual;
    if (state === 'SUBMITTING') return 'Το ερώτημά σας αποστέλλεται στον διακομιστή.';
    if (state === 'QUEUED') return 'Το αίτημά σας παραλήφθηκε. Αναμονή για να ξεκινήσει η έρευνα.';
    if (state === 'ERROR') return 'Η αποστολή δεν ολοκληρώθηκε. ' + $('commandState').textContent;
    const run = document.body.dataset.currentResearchRun;
    if (!run) return 'Δεν έχει φορτωθεί έρευνα. Γράψτε ή υπαγορεύστε ένα ερώτημα.';
    const stateText = {'RESEARCH ACTIVE':'Η έρευνα βρίσκεται σε εξέλιξη.',RUNNING:'Η έρευνα βρίσκεται σε εξέλιξη.',COMPLETED:'Η έρευνα ολοκληρώθηκε.',FAILED:'Η έρευνα απέτυχε.',BLOCKED:'Η έρευνα αντιμετωπίζει εμπόδια.'}[$('missionState').textContent.trim()] || 'Σύνοψη της επιλεγμένης έρευνας.';
    const target = document.querySelector('.result-context summary')?.textContent || '';
    return [stateText, target, $('resultsMeta').textContent, 'Οι σχετικές αναφορές και οι ιστορικοί ισχυρισμοί απαιτούν έλεγχο της τεκμηρίωσής τους. Μηδενικά αποτελέσματα δεν αποδεικνύουν ότι δεν υπάρχουν ιστορικές πηγές.'].filter(Boolean).join(' ');
  }
  read.addEventListener('click', () => speak(summary()));
  const detail = $('discoveryDetail');
  if (detail && canSpeak) {
    $('resultsList').addEventListener('click', e => { if (e.target.closest('[data-record]')) detail.dataset.voiceRun = document.body.dataset.currentResearchRun || ''; });
    const b = document.createElement('button'); b.type = 'button'; b.id = 'voiceReadDiscovery'; b.textContent = 'Άκου το εύρημα'; b.addEventListener('click', () => { if (['SUBMITTING','QUEUED'].includes(document.body.dataset.researchVisual) || detail.dataset.voiceRun !== document.body.dataset.currentResearchRun) { sayStatus('Ανοίξτε ένα εύρημα της τρέχουσας έρευνας για ανάγνωση.'); return; } panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); speak(['Καταγεγραμμένο εύρημα. Η ανάγνωση δεν αποτελεί ιστορική επαλήθευση.', detail.querySelector('h3').textContent, detail.querySelector('p').textContent, detail.querySelector('small').textContent].join(' ')); }); detail.append(b); }
  mic.addEventListener('click', () => {
    if (listening) { try { recognition.stop(); } catch (_) { halt(); } return; }
    if (!Recognition || input.disabled) return;
    halt(); const token = session, prefix = input.value.trim(); let finalText = '', interimText = '';
    const r = new Recognition(); recognition = r;
    r.lang = language.value; r.continuous = false; r.interimResults = true; r.maxAlternatives = 1;
    listening = true; update(); sayStatus('Αναμονή άδειας μικροφώνου…');
    r.onstart = () => { if (token === session) sayStatus('Ακούω… Μιλήστε το ερώτημά σας.'); };
    r.onresult = e => {
      if (token !== session || input.disabled) return;
      finalText = ''; interimText = '';
      for (let i = 0; i < e.results.length; i++) { const result = e.results[i]; if (result.isFinal) finalText += result[0].transcript + ' '; else interimText += result[0].transcript + ' '; }
      input.value = [prefix, finalText.trim(), interimText.trim()].filter(Boolean).join(' ').slice(0, input.maxLength > 0 ? input.maxLength : 500);
      input.dispatchEvent(new Event('input', {bubbles:true}));
      sayStatus(interimText ? 'Μεταγραφή…' : 'Το κείμενο προστέθηκε. Ελέγξτε το πριν την αποστολή.');
    };
    r.onerror = e => {
      if (token !== session) return;
      const messages = {'not-allowed':'Δεν δόθηκε άδεια μικροφώνου. Η πληκτρολόγηση παραμένει διαθέσιμη.','service-not-allowed':'Η υπηρεσία υπαγόρευσης δεν είναι διαθέσιμη σε αυτόν τον browser.','audio-capture':'Δεν βρέθηκε διαθέσιμο μικρόφωνο.','no-speech':'Δεν ακούστηκε ομιλία. Μπορείτε να δοκιμάσετε ξανά.','network':'Η υπηρεσία αναγνώρισης δεν συνδέθηκε. Ελέγξτε τη σύνδεση ή γράψτε το ερώτημα.','language-not-supported':'Η επιλεγμένη γλώσσα δεν υποστηρίζεται από την υπηρεσία αναγνώρισης.'};
      halt(messages[e.error] || 'Η υπαγόρευση διακόπηκε. Το κείμενό σας παραμένει στο πεδίο.');
    };
    r.onend = () => { if (token !== session) return; recognition = null; listening = false; update(); if (finalText || interimText) sayStatus('Ελέγξτε το κείμενο και πατήστε «ΕΡΕΥΝΑ» για αποστολή.'); else sayStatus('Δεν προστέθηκε κείμενο. Πατήστε ξανά για υπαγόρευση.'); };
    try { r.start(); } catch (_) { halt('Το μικρόφωνο δεν μπόρεσε να ξεκινήσει. Δοκιμάστε ξανά ή γράψτε το ερώτημα.'); }
  });
  input.addEventListener('keydown', e => { if (listening && e.key !== 'Enter') halt('Η υπαγόρευση σταμάτησε για επεξεργασία του κειμένου.'); });
  form.addEventListener('submit', () => halt(), true);
  new MutationObserver(update).observe(input, {attributes:true, attributeFilter:['disabled']});
  window.addEventListener('jarvis:operator-query', () => { halt(); ownRequest = ''; ownRun = ''; announced = new Set(); });
  window.addEventListener('jarvis:dispatch-accepted', e => { ownRequest = e.detail?.request_id || ''; if (auto.checked) speak('Το αίτημά σας παραλήφθηκε. Θα σας ενημερώσω όταν ξεκινήσει η έρευνα.'); });
  window.addEventListener('jarvis:dispatch-failed', () => { ownRequest = ''; ownRun = ''; halt(); if (auto.checked) speak('Η αποστολή του ερωτήματος δεν ολοκληρώθηκε. Ελέγξτε το μήνυμα στο πεδίο έρευνας.'); });
  window.addEventListener('jarvis:research-state', e => {
    const d = e.detail || {}; if (!ownRequest || (d.request_id !== ownRequest && String(d.run_id) !== ownRun)) return;
    ownRun = String(d.run_id); if (!auto.checked || listening) return;
    const phase = /COMPLETED|FAILED|BLOCKED/.test(d.state) ? d.state : /ACTIVE|RUNNING/.test(d.state) ? 'ACTIVE' : '';
    if (!phase || announced.has(phase)) return; announced.add(phase);
    speak(phase === 'ACTIVE' ? 'Η έρευνά σας ξεκίνησε.' : summary());
  });
  window.addEventListener('jarvis:research-selection', () => { ownRequest = ''; ownRun = ''; halt(); });
  auto.addEventListener('change', () => { if (!auto.checked) halt(); });
  choice.addEventListener('change', () => halt()); language.addEventListener('change', () => halt());
  document.addEventListener('visibilitychange', () => { if (document.hidden) halt(); });
  window.addEventListener('pagehide', () => halt());
  update();
})();
