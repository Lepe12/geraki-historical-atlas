/* NABOU edit mode (owner only): loaded by site-content.js after ?edit=1.
   Edits menu items and pages in place and saves content/site.json (and uploaded images)
   straight to GitHub with the owner's fine-grained token, kept in this browser only. */
(() => {
  const S = window.nabouSite;
  const shell = document.getElementById('n7Shell');
  if (!S || !shell) return;
  const REPO = 'Lepe12/geraki-historical-atlas';
  const DIR = 'jarvis-intelligence-chamber/';
  // ?branch=… wins; a raw.githack.com preview of a branch saves to that branch; the real site saves to main.
  const m = location.host === 'raw.githack.com' && location.pathname.match(/^\/Lepe12\/geraki-historical-atlas\/([^/]+)\//i);
  const BRANCH = new URLSearchParams(location.search).get('branch') || (m && !/^[0-9a-f]{40}$/.test(m[1]) ? decodeURIComponent(m[1]) : 'main');
  const TOKEN_KEY = 'nabou.githubToken';
  let dirty = false;

  const css = document.createElement('style');
  css.textContent = `
#nabouEditBar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483000;display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:12px;background:#0b1a2e;color:#ede4d2;border:1px solid #c29a5b;box-shadow:0 10px 30px #000a;font:14px/1.3 'Noto Sans',system-ui,sans-serif}
#nabouEditBar button{white-space:nowrap;padding:7px 12px;border-radius:8px;border:1px solid #c29a5b88;background:#13283f;color:#fff;cursor:pointer;font:inherit}
#nabouEditBar button[data-a=save]{background:#c29a5b;color:#061419;font-weight:600}
#nabouEditBar .st{max-width:340px;color:#c8d6de}
[data-site-page][draggable=true]{outline:1px dashed #c29a5b;outline-offset:2px;cursor:grab}
[data-site-page].nabou-hidden{opacity:.45}
#nabouEditor{width:min(820px,94vw);max-height:90vh;overflow:auto}
#nabouEditor label{display:block;margin:8px 0;font-size:13px;color:#c8d6de}
#nabouEditor input[type=text]{width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid #c29a5b66;background:#0c2440;color:#fff;font:15px 'Noto Serif',serif}
#nabouEditor .tb{display:flex;flex-wrap:wrap;gap:4px;margin-top:10px}
#nabouEditor .tb button{margin:0;padding:5px 10px}
#nabouEditor .body{min-height:220px;margin:6px 0 10px;padding:12px;border-radius:6px;border:1px solid #c29a5b66;background:#0c2440;color:#fff;outline:none}
#nabouEditor .body img{max-width:100%;height:auto}
#nabouEditor .row{display:flex;gap:8px;flex-wrap:wrap}
#nabouEditor input[type=checkbox]{all:revert;width:18px;height:18px;margin:0 8px 0 0;vertical-align:middle;accent-color:#c29a5b}`;
  document.head.append(css);

  const bar = document.createElement('div');
  bar.id = 'nabouEditBar';
  bar.innerHTML = '<b>Επεξεργασία</b><button type="button" data-a="new">+ Νέα σελίδα</button><button type="button" data-a="save">Αποθήκευση</button><button type="button" data-a="exit">Έξοδος</button><span class="st" role="status"></span>';
  document.body.append(bar);
  const status = (t) => { bar.querySelector('.st').textContent = t; };
  status('Πάτα ένα κουμπί του μενού για να το αλλάξεις· σύρε για να αλλάξεις σειρά.');
  const changed = () => { dirty = true; status('Έχεις αλλαγές που δεν αποθηκεύτηκαν.'); };
  addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

  /* ── menu items: click to edit, drag to reorder ── */
  S.onItemClick = (item) => edit(item);
  S.decorate = (el, item, i) => {
    el.draggable = true;
    if (item.hidden) el.classList.add('nabou-hidden');
    el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', String(i)));
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (Number.isNaN(from) || from === i) return;
      const [moved] = S.data.menu.splice(from, 1);
      S.data.menu.splice(i, 0, moved);
      changed();
      S.render();
    });
  };
  S.render();

  /* ── page editor ── */
  const dlg = document.createElement('dialog');
  dlg.id = 'nabouEditor';
  dlg.className = 'n7-help';
  dlg.innerHTML = `<form method="dialog">
  <label>Όνομα στο μενού<input type="text" name="label" required></label>
  <div class="tb" role="toolbar" aria-label="Μορφοποίηση">
    <button type="button" data-cmd="bold"><b>Έντονα</b></button>
    <button type="button" data-cmd="italic"><i>Πλάγια</i></button>
    <button type="button" data-cmd="h3">Τίτλος</button>
    <button type="button" data-cmd="p">Κανονικό</button>
    <button type="button" data-cmd="insertUnorderedList">• Λίστα</button>
    <button type="button" data-cmd="link">Link</button>
    <button type="button" data-cmd="image">Εικόνα</button>
  </div>
  <div class="body" contenteditable="true" aria-label="Κείμενο σελίδας"></div>
  <label>Link (προαιρετικό: αν το γράψεις, το κουμπί ανοίγει αυτή τη διεύθυνση αντί για τη σελίδα)<input type="text" name="url" placeholder="https://…"></label>
  <label><input type="checkbox" name="hidden"> Κρυφό (δεν φαίνεται στους επισκέπτες)</label>
  <div class="row"><button value="ok">Εντάξει</button><button value="cancel" formnovalidate>Άκυρο</button><button value="del" formnovalidate>Διαγραφή σελίδας</button></div>
  <input type="file" accept="image/*" hidden>
</form>`;
  shell.append(dlg);
  const f = dlg.querySelector('form');
  const F = f.elements; // not f.hidden: that is the form's own hidden property
  const bodyEl = dlg.querySelector('.body');
  const fileIn = dlg.querySelector('input[type=file]');
  let current = null;
  // Remember the caret in the text, so toolbar buttons and image uploads act where the owner was typing.
  let range = null;
  document.addEventListener('selectionchange', () => {
    const sel = getSelection();
    if (sel.rangeCount && bodyEl.contains(sel.anchorNode)) range = sel.getRangeAt(0).cloneRange();
  });
  const restore = () => {
    bodyEl.focus();
    if (range) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); }
  };

  function edit(item) {
    current = item;
    F.label.value = item.label || '';
    F.url.value = item.url || '';
    F.hidden.checked = !!item.hidden;
    range = null;
    bodyEl.innerHTML = window.marked ? window.marked.parse(String(item.content || '')) : String(item.content || '');
    dlg.showModal();
  }

  dlg.querySelector('.tb').addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret in the text
  dlg.querySelector('.tb').addEventListener('click', (e) => {
    const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
    if (!cmd) return;
    restore();
    if (cmd === 'h3' || cmd === 'p') document.execCommand('formatBlock', false, cmd);
    else if (cmd === 'link') { const u = prompt('Διεύθυνση του link (https://…):'); if (u && /^https?:\/\//i.test(u)) document.execCommand('createLink', false, u); }
    else if (cmd === 'image') fileIn.click();
    else document.execCommand(cmd);
  });

  fileIn.addEventListener('change', async () => {
    const file = fileIn.files[0];
    fileIn.value = '';
    if (!file) return;
    if (file.size > 8e6) { alert('Η εικόνα είναι πάνω από 8 MB· μίκρυνέ την πρώτα.'); return; }
    const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    const name = Date.now() + '-' + file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
    status('Ανεβαίνει η εικόνα…');
    try {
      await gh('PUT', DIR + 'content/media/' + name, { message: 'NABOU: εικόνα ' + name, content: dataUrl.split(',')[1], branch: BRANCH });
      restore();
      // Show the local copy while editing; data-src is what gets saved.
      document.execCommand('insertHTML', false, `<img src="${dataUrl}" data-src="./content/media/${name}" alt="">`);
      status('Η εικόνα ανέβηκε. Πάτα «Εντάξει» και μετά «Αποθήκευση».');
    } catch (err) { status('Η εικόνα δεν ανέβηκε: ' + err.message); }
  });

  dlg.addEventListener('close', () => {
    const v = dlg.returnValue;
    dlg.returnValue = '';
    if (!current || !v || v === 'cancel') return;
    const menu = S.data.menu;
    if (v === 'del') {
      if (!confirm('Να διαγραφεί η σελίδα «' + (current.label || '') + '»;')) return;
      menu.splice(menu.indexOf(current), 1);
    } else {
      const clone = bodyEl.cloneNode(true);
      clone.querySelectorAll('img[data-src]').forEach((img) => { img.setAttribute('src', img.dataset.src); img.removeAttribute('data-src'); });
      Object.assign(current, { label: F.label.value.trim(), url: F.url.value.trim(), hidden: F.hidden.checked, content: clone.innerHTML });
    }
    changed();
    S.render();
  });

  /* ── toolbar ── */
  bar.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'new') {
      const item = { label: 'Νέα σελίδα', content: '', url: '', hidden: false };
      S.data.menu.push(item);
      changed();
      S.render();
      edit(item);
    } else if (a === 'save') save();
    else if (a === 'exit') {
      if (dirty && !confirm('Έχεις αλλαγές που δεν αποθηκεύτηκαν. Έξοδος χωρίς αποθήκευση;')) return;
      try { localStorage.removeItem('nabou.edit'); } catch {}
      dirty = false;
      location.href = location.pathname;
    }
  });

  async function save() {
    status('Αποθήκευση…');
    try {
      const path = DIR + 'content/site.json';
      const cur = await gh('GET', path);
      // shortcut: last save wins; a change made meanwhile elsewhere (e.g. Pages CMS) to this file is overwritten.
      await gh('PUT', path, { message: 'NABOU: αλλαγές στο μενού και τις σελίδες', content: b64(JSON.stringify(S.data, null, 2) + '\n'), sha: cur.sha, branch: BRANCH });
      dirty = false;
      status('Αποθηκεύτηκε. Οι επισκέπτες θα το δουν σε 1–2 λεπτά.');
    } catch (err) { status('Δεν αποθηκεύτηκε: ' + err.message); }
  }

  function b64(text) {
    const bytes = new TextEncoder().encode(text);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function token() {
    let t = '';
    try { t = localStorage.getItem(TOKEN_KEY) || ''; } catch {}
    if (!t) {
      t = (prompt('Βάλε το κλειδί σου από το GitHub (μία φορά· μένει μόνο σε αυτόν τον browser):') || '').trim();
      if (t) try { localStorage.setItem(TOKEN_KEY, t); } catch {}
    }
    return t;
  }

  async function gh(method, path, body) {
    const t = token();
    if (!t) throw new Error('δεν δόθηκε κλειδί GitHub');
    const url = `https://api.github.com/repos/${REPO}/contents/${path}` + (method === 'GET' ? `?ref=${encodeURIComponent(BRANCH)}` : '');
    const r = await fetch(url, { method, cache: 'no-store', headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' }, body: body && JSON.stringify(body) });
    if (r.status === 401 || r.status === 403) { try { localStorage.removeItem(TOKEN_KEY); } catch {} throw new Error('το κλειδί δεν δέχτηκε (ξαναδοκίμασε με σωστό κλειδί)'); }
    if (!r.ok) throw new Error('GitHub ' + r.status);
    return r.json();
  }
})();
