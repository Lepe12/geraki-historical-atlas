const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const dataUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const viewPromise = import(dataUrl(fs.readFileSync(__dirname + '/research-narrative-view.js', 'utf8')));
const uiSource = fs.readFileSync(__dirname + '/research-ui.js', 'utf8');
async function renderAnswer(payload) {
  const view = await viewPromise;
  const start = uiSource.indexOf('const esc=');
  const end = uiSource.indexOf('function recordEvidence');
  const code = uiSource.slice(start, end) + ';semanticAnswer';
  return vm.runInNewContext(code, {
    URL,
    isNarrativeReady: view.isNarrativeReady,
    renderStoryHtml: view.renderStoryHtml,
  })(payload);
}
test('source dossier renders exact quotes, citations, uncertainty and safe links without claiming model synthesis', async () => {
  const html = await renderAnswer({ schema: 'pct-semantic-answer-v1', status: 'SOURCE_DOSSIER_AVAILABLE', answer_mode: 'EXACT_SOURCE_EXTRACTS', claims: [{ claim_id: 'extract-1', kind: 'acquired_excerpt', statement: 'Απόσπασμα', quote: '<script>source</script>', source_occurrences: [{ title: 'Book', url: 'https://example.org/source', locator: { start_line: 2, end_line: 4, printed_page: 135, scan_indexes_0_based: [14] } }], source_uncertainties: ['IDENTITY_PENDING'] }], answer_sections: [{ text: 'Book', claim_ids: ['extract-1'] }], documentary_timeline: [{ year: 1677, claim_id: 'extract-1' }], unknowns: ['Η ταύτιση παραμένει ανοιχτή.'] });
  assert.match(html, /χωρίς υπηρεσία μοντέλου/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /https:\/\/example.org\/source/);
  assert.match(html, /Γραμμές 2–4/);
  assert.match(html, /Σελίδα 135/);
  assert.match(html, /PDF 15/);
  assert.match(html, /IDENTITY_PENDING/);
  assert.match(html, /Δεν αποτελούν επαληθευμένο χρονολόγιο/);
  assert.doesNotMatch(html, /Σύνθεση μοντέλου από/);
});
test('empty dossier reports insufficient evidence instead of an answer', async () => {
  const html = await renderAnswer({ schema: 'pct-semantic-answer-v1', status: 'INSUFFICIENT_ACQUIRED_EVIDENCE' });
  assert.match(html, /Δεν έχει αποκτηθεί αρκετό κείμενο/);
  assert.doesNotMatch(html, /ΑΠΑΝΤΗΣΗ ΜΕ ΠΑΡΑΠΟΜΠΕΣ/);
});
test('current engine answers render with citations and explicit pending corpus coverage', async () => {
  for (const schema of ['pct-semantic-answer-v1', 'pct-semantic-answer-v2', 'pct-semantic-answer-v3']) {
    const html = await renderAnswer({ schema, status: 'MODEL_ANSWER_PENDING_HUMAN_REVIEW', answer_scope: 'PROVISIONAL_EXAMINED_PASSAGES_ONLY', coverage: { deferred: [{ evidence_id: 'unread' }] }, claims: [{ claim_id: 'c-1', kind: 'source_statement', statement: 'The source names the island.', quote: 'Literal acquired evidence', source_occurrences: [{ title: 'Consulted book', url: 'https://example.org/book', locator: { printed_page: 42 } }] }], answer_sections: [{ text: 'The consulted source names the island.', claim_ids: ['c-1'] }] });
    assert.match(html, /The consulted source names the island/);
    assert.match(html, /Literal acquired evidence/);
    assert.match(html, /Σελίδα 42/);
    assert.match(html, /https:\/\/example.org\/book/);
    assert.match(html, /Η κάλυψη του συνόλου των πηγών παραμένει εκκρεμής/);
    assert.match(html, /Εκκρεμεί ιστορική επαλήθευση/);
  }
});
test('schema compatibility never exposes unreviewed or uncited answer sections', async () => {
  const pending = await renderAnswer({ schema: 'pct-semantic-answer-v3', status: 'RESEARCH_COVERAGE_PENDING', claims: [], answer_sections: [{ text: 'Do not publish this', claim_ids: ['missing'] }] });
  assert.doesNotMatch(pending, /Do not publish this/);
  const uncited = await renderAnswer({ schema: 'pct-semantic-answer-v3', status: 'MODEL_ANSWER_PENDING_HUMAN_REVIEW', claims: [], answer_sections: [{ text: 'Missing evidence', claim_ids: ['missing'] }] });
  assert.doesNotMatch(uncited, /Missing evidence/);
  assert.equal(await renderAnswer({ schema: 'unknown-schema', status: 'MODEL_ANSWER_PENDING_HUMAN_REVIEW' }), '');
});
test('greek narrative is the default answer surface with raw English under details', async () => {
  const html = await renderAnswer({
    schema: 'pct-semantic-answer-v3',
    status: 'MODEL_ANSWER_PENDING_HUMAN_REVIEW',
    claims: [{
      claim_id: 'c-1', kind: 'source_statement', statement: 'Held Melos.',
      quote: 'Held Melos.',
      source_occurrences: [{ title: 'Book', url: 'https://example.org/book', locator: { printed_page: 42 } }],
    }],
    answer_sections: [{ text: 'Held Melos.', claim_ids: ['c-1'] }],
    greek_narrative: {
      status: 'NARRATIVE_PENDING_HUMAN_REVIEW',
      title_el: 'Δείγμα προσώπου',
      paragraphs: [{ text_el: 'Το 1677 περίπου κράτησε τη Μήλο *(Book, σελ. 42)*', claim_ids: ['c-1'] }],
      not_found: [{ note_el: 'Δεν βρέθηκε ακριβής ημερομηνία σύλληψης στις εξετασθείσες πηγές.', reason: 'NOT_FOUND_IN_CONSULTED_SOURCES' }],
    },
  });
  assert.match(html, /Δείγμα προσώπου|Αφήγηση/);
  assert.match(html, /κράτησε τη Μήλο/);
  assert.match(html, /Book, σελ\. 42/);
  assert.match(html, /Τι δεν βρέθηκε/);
  assert.match(html, /Λεπτομέρειες πηγών/);
  assert.match(html, /Held Melos/);
  assert.match(html, /<cite>/);
});
test('honest empty greek narrative renders without inventing a biography', async () => {
  const html = await renderAnswer({
    schema: 'pct-semantic-answer-v3',
    status: 'INSUFFICIENT_ACQUIRED_EVIDENCE',
    greek_narrative: {
      status: 'NO_USABLE_EVIDENCE',
      title_el: 'Άγνωστος',
      paragraphs: [{ text_el: 'Δεν προέκυψε τεκμηριωμένη βιογραφία. Αυτό δεν σημαίνει ότι δεν υπήρξε.', claim_ids: [] }],
      not_found: [],
    },
  });
  assert.match(html, /Αφήγηση|δεν σημαίνει|Δεν προέκυψε/);
  assert.doesNotMatch(html, /βασιλιάς της Μήλου/);
});
