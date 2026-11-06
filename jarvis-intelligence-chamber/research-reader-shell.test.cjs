const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const dataUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const overviewSrc = fs.readFileSync(__dirname + '/research-overview.js', 'utf8');
const viewSrc = fs.readFileSync(__dirname + '/research-narrative-view.js', 'utf8');
const overviewUrl = dataUrl(overviewSrc);
const viewUrl = dataUrl(viewSrc);
const shellSrc = fs
  .readFileSync(__dirname + '/research-reader-shell.js', 'utf8')
  .replace('./live-bridge.js', dataUrl('export function connectResearchFeed(){}'))
  .replace('./research-overview.js', overviewUrl)
  .replace('./research-narrative-view.js', viewUrl);
const overviewPromise = import(overviewUrl);
const viewPromise = import(viewUrl);
const shellPromise = import(dataUrl(shellSrc));

test('history statuses are plain reading labels only', async () => {
  const { historyStatusLabel } = await overviewPromise;
  assert.equal(historyStatusLabel('COMPLETED'), 'άρθρο έτοιμο');
  assert.equal(historyStatusLabel('RUNNING'), 'σε εξέλιξη');
  assert.equal(historyStatusLabel('PARTIAL'), 'δεν μπόρεσα να διαβάσω τις πηγές');
  assert.equal(historyStatusLabel('COMPLETED', { status: 'NO_USABLE_EVIDENCE', paragraphs: [] }), 'δεν μπόρεσα να διαβάσω τις πηγές');
  assert.doesNotMatch(historyStatusLabel('PARTIAL'), /εκκρεμότητες/i);
  assert.doesNotMatch(historyStatusLabel('COMPLETED'), /Ολοκληρώθηκε/);
});

test('waiting phrase never uses a run id', async () => {
  const { waitingPhrase } = await overviewPromise;
  assert.equal(waitingPhrase('Πέτρος Λάντζας'), 'Διαβάζονται οι πηγές για «Πέτρος Λάντζας».');
  assert.equal(waitingPhrase('Έρευνα 42176932029'), 'Διαβάζονται οι πηγές.');
  assert.equal(waitingPhrase(''), 'Διαβάζονται οι πηγές.');
});

test('reader waiting surface shows question and plain reading copy', async () => {
  const { renderReaderArticle, renderReaderHistory } = await shellPromise;
  const html = renderReaderArticle(
    { mission: { status: 'RUNNING', purpose: 'Πέτρος Λάντζας', target: 'Πέτρος Λάντζας' }, agents: [{ status: 'RUNNING' }] },
    { title: 'Πέτρος Λάντζας', status: 'σε εξέλιξη' },
    { knownQuery: 'Πέτρος Λάντζας' },
  );
  assert.match(html, /Πέτρος Λάντζας/);
  assert.match(html, /Διαβάζονται οι πηγές/);
  assert.doesNotMatch(html, /42176932029/);
  assert.doesNotMatch(html, /ερευνητ/i);
  assert.doesNotMatch(html, /0\s*\/\s*1/);
  assert.match(html, /<details class="overview-details research-path" open>/);
  const list = renderReaderHistory(
    [
      { run_id: '1', target: 'Πέτρος Λάντζας', status: 'COMPLETED' },
      { run_id: '2', target: 'Κίμωλος', status: 'RUNNING' },
      { run_id: '3', target: 'Creveliers', status: 'PARTIAL' },
    ],
    '1',
  );
  assert.match(list, /άρθρο έτοιμο/);
  assert.match(list, /σε εξέλιξη/);
  assert.match(list, /δεν μπόρεσα να διαβάσω τις πηγές/);
  assert.doesNotMatch(list, /Ολοκληρώθηκε με εκκρεμότητες/);
  assert.doesNotMatch(list, /Έρευνα 1/);
});

test('finished article reuses mold and keeps Πορεία closed', async () => {
  const { renderReaderArticle } = await shellPromise;
  const { wrapTitleHtml } = await viewPromise;
  const html = renderReaderArticle({
    mission: { status: 'COMPLETED', target: 'Πέτρος Λάντζας' },
    research_answer: {
      greek_narrative: {
        status: 'NARRATIVE_PENDING_HUMAN_REVIEW',
        title_el: 'Πέτρος Λάντζας (Pietro / Pedro Lanza, 1530–1613)',
        paragraphs: [{ text_el: 'Στις 9 Ιανουαρίου 1573 έγινε κυβερνήτης της Πάργας *(Λάσκαρις 1956)*' }],
        sources: [{ label_el: 'Λάσκαρις 1956' }],
        map_places: [{ label: 'Πάργα', status: 'RESOLVED', lon: 20.4, lat: 39.3 }],
        research_path: { found: 12, passed: 3, cut: 9 },
        not_found: [{ note_el: 'Δεν βρέθηκε τόπος ταφής.' }],
      },
    },
  });
  assert.match(html, /nr-ornament/);
  assert.match(html, /Πέτρος Λάντζας/);
  assert.match(html, /Pietro \/ Pedro Lanza/);
  assert.match(html, /κυβερνήτης της Πάργας/);
  assert.match(html, /Πηγές/);
  assert.match(html, /Πορεία έρευνας/);
  assert.doesNotMatch(html, /<details[^>]*open/);
  assert.ok(html.indexOf('Τι δεν βρέθηκε') > html.indexOf('Πορεία έρευνας'));
  assert.match(wrapTitleHtml('Λάντζας 1613'), /\u00a01613/);
});

test('empty narrative uses Geraki unread wording', async () => {
  const { renderReaderArticle } = await shellPromise;
  const html = renderReaderArticle({
    mission: { status: 'COMPLETED', target: 'Πέτρος Λάντζας' },
    research_answer: {
      greek_narrative: {
        status: 'NO_USABLE_EVIDENCE',
        title_el: 'Πέτρος Λάντζας',
        paragraphs: [],
        research_path: { found: 0, passed: 0, cut: 0 },
      },
    },
  });
  assert.match(html, /Δεν μπόρεσα να διαβάσω τις πηγές/);
  assert.doesNotMatch(html, /δεν προέκυψε τεκμηριωμένη βιογραφία/i);
});
