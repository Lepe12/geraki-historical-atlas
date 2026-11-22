/* Owner-editable menu items and pages, read from content/site.json.
   The owner edits that file in Pages CMS (see /.pages.yml). Items go into the top page row
   (.nbc-sitenav, built by nabou-command.js), or the left rail in ?classic=1. If the file fails
   to load, the built-in menu stays as it is. */
(() => {
  const shell = document.getElementById('n7Shell');
  const dialog = document.getElementById('n7Page');
  if (!shell || !dialog) return;
  const safeUrl = (u) => /^(https?:\/\/|\/|\.\/|\.\.\/|#)/i.test(u);

  function openPage(item) {
    dialog.querySelector('h2').textContent = item.label;
    // shortcut: no HTML sanitising, content is written only by the repo owner via GitHub; add DOMPurify if others get edit access.
    dialog.querySelector('.n7-page-body').innerHTML = window.marked ? window.marked.parse(String(item.content || '')) : '';
    dialog.showModal();
  }

  function render(site) {
    const top = shell.querySelector('.nbc-sitenav');
    const rail = shell.querySelector('.n7-nav');
    for (const item of site.menu || []) {
      if (!item || !item.label || item.hidden) continue;
      const url = String(item.url || '').trim();
      if (url && !safeUrl(url)) continue;
      // Always a button, so it takes the menu's own button styles.
      const el = document.createElement('button');
      el.type = 'button';
      el.addEventListener('click', () => {
        if (!url) openPage(item);
        else if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener');
        else location.href = url;
      });
      el.dataset.sitePage = '';
      if (top) {
        el.className = 'nbc-navtab';
        el.textContent = item.label;
        top.insertBefore(el, top.querySelector('.n7-top-actions'));
      } else if (rail) {
        el.innerHTML = '<svg class="n7-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/></svg><span></span>';
        el.lastChild.textContent = item.label;
        rail.insertBefore(el, rail.querySelector('.n7-nav-spacer'));
      }
    }
  }

  // Wait for DOMContentLoaded so nabou-command.js (deferred) has built the top row first.
  const ready = new Promise((r) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r, { once: true }) : r()));
  Promise.all([fetch('./content/site.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))), ready])
    .then(([site]) => render(site))
    .catch((err) => console.warn('site-content: built-in menu kept', err));
})();
