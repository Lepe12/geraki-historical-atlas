(() => {
  'use strict';
  if (!window.N7_CHAT || !window.N7_CHAT.endpoint) return;
  const style = document.createElement('style');
  style.textContent = `
    #n7-chat-launch {position:fixed;right:22px;bottom:22px;z-index:2147483000;border:1px solid #39728a;border-radius:50%;width:58px;height:58px;background:#102c3b;color:#b8f3ff;font:700 19px system-ui;box-shadow:0 6px 26px #0004;cursor:pointer}
    #n7-chat-panel {box-sizing:border-box;position:fixed;right:22px;bottom:92px;z-index:2147483000;width:min(390px,calc(100vw - 24px));height:min(530px,calc(100dvh - 115px));display:none;flex-direction:column;border:1px solid #2d5362;border-radius:16px;background:#0d1b26;color:#e8f5fa;box-shadow:0 15px 45px #0007;font:14px/1.5 system-ui,sans-serif;overflow:hidden}
    #n7-chat-panel.open {display:flex}
    #n7-chat-panel *,#n7-chat-panel *:before {box-sizing:border-box}
    #n7-chat-header {display:flex;justify-content:space-between;align-items:center;padding:13px 16px;background:#142c3a;font-weight:700}
    #n7-chat-close {background:transparent;color:#e8f5fa;border:0;font-size:23px;cursor:pointer}
    #n7-chat-log {flex:1;overflow:auto;padding:15px;display:flex;flex-direction:column;gap:12px}
    .n7-msg {padding:10px 12px;border-radius:11px;max-width:95%;white-space:pre-wrap;overflow-wrap:anywhere;background:#1c3542;align-self:flex-start}
    .n7-msg.visitor {align-self:flex-end;background:#155065}
    .n7-sources {display:flex;flex-direction:column;gap:5px;margin-top:7px}
    .n7-sources a {color:#9bdcf3;text-decoration:underline}
    #n7-chat-form {display:flex;gap:7px;border-top:1px solid #2d5362;padding:11px}
    #n7-chat-input {width:100%;min-width:0;border-radius:9px;border:1px solid #58717e;background:#102631;color:white;padding:10px;font:inherit}
    #n7-chat-send {border:0;border-radius:9px;background:#3d9db5;color:#051d27;font-weight:700;padding:9px 13px;cursor:pointer}
    #n7-chat-send:disabled {opacity:.5}
  `;
  document.head.appendChild(style);

  const launch = document.createElement('button');
  launch.id = 'n7-chat-launch';
  launch.type = 'button';
  launch.textContent = 'N7';
  launch.setAttribute('aria-label', 'Άνοιγμα συνομιλίας N7');
  launch.setAttribute('aria-expanded', 'false');

  const panel = document.createElement('section');
  panel.id = 'n7-chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'N7 Historical AI');
  panel.innerHTML = '<header id="n7-chat-header"><span>N7 · Historical AI</span><button id="n7-chat-close" type="button" aria-label="Κλείσιμο">×</button></header><div id="n7-chat-log" aria-live="polite"></div><form id="n7-chat-form"><input id="n7-chat-input" maxlength="500" aria-label="Η ερώτησή σας" placeholder="Ρώτησε για την ιστορία της πειρατείας…" required><button id="n7-chat-send" type="submit">➤</button></form>';
  document.body.append(launch, panel);
  const log = panel.querySelector('#n7-chat-log');
  const form = panel.querySelector('#n7-chat-form');
  const input = panel.querySelector('#n7-chat-input');
  const send = panel.querySelector('#n7-chat-send');
  const close = panel.querySelector('#n7-chat-close');

  function message(text, visitor = false) {
    const item = document.createElement('div');
    item.className = 'n7-msg' + (visitor ? ' visitor' : '');
    item.textContent = text;
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
    return item;
  }
  message('Καλώς ήρθες στο Pirate Cartography. Ρώτησέ με για την ιστορία της πειρατείας. Οι απαντήσεις βασίζονται σε δημοσιευμένα άρθρα του ιστότοπου.');
  function toggle(open) {
    panel.classList.toggle('open', open);
    launch.setAttribute('aria-expanded', String(open));
    if (open) input.focus(); else launch.focus();
  }
  launch.addEventListener('click', () => toggle(!panel.classList.contains('open')));
  close.addEventListener('click', () => toggle(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open')) toggle(false); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question || send.disabled) return;
    message(question, true);
    input.value = '';
    send.disabled = true;
    const status = message('Αναζητώ στα άρθρα…');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(window.N7_CHAT.endpoint, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        credentials: 'same-origin',
        body: JSON.stringify({message: question}), signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Το N7 δεν είναι διαθέσιμο.');
      status.textContent = data.answer || 'Δεν βρέθηκε απάντηση.';
      if (Array.isArray(data.sources) && data.sources.length) {
        const links = document.createElement('div');
        links.className = 'n7-sources';
        const heading = document.createElement('strong');
        heading.textContent = 'Άρθρα του ιστότοπου:';
        links.appendChild(heading);
        data.sources.forEach((source, i) => {
          try {
            const url = new URL(source.url, window.location.origin);
            if (url.origin !== window.location.origin || !['https:', 'http:'].includes(url.protocol)) return;
            const a = document.createElement('a');
            a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
            a.textContent = '[' + (i + 1) + '] ' + (source.title || 'Πηγή');
            links.appendChild(a);
          } catch (_) {}
        });
        status.appendChild(links);
      }
    } catch (err) {
      status.textContent = err.name === 'AbortError' ? 'Η σύνδεση καθυστέρησε υπερβολικά.' : (err.message || 'Σφάλμα σύνδεσης.');
    } finally {
      clearTimeout(timeout);
      send.disabled = false;
      log.scrollTop = log.scrollHeight;
      input.focus();
    }
  });
})();
