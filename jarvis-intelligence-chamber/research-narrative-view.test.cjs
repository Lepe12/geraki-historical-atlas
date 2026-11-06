const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const dataUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const viewPromise = import(dataUrl(fs.readFileSync(__dirname + '/research-narrative-view.js', 'utf8')));
const overviewPromise = import(dataUrl(fs.readFileSync(__dirname + '/research-overview.js', 'utf8')));

test('citation sits under each fact, not inline', async () => {
  const { splitCitation, renderStoryHtml } = await viewPromise;
  assert.deepEqual(splitCitation('Κράτησε το φρούριο *(Book, σελ. 12)*'), {
    body: 'Κράτησε το φρούριο',
    cite: 'Book, σελ. 12',
  });
  const html = renderStoryHtml({
    status: 'NARRATIVE_PENDING_HUMAN_REVIEW',
    title_el: 'ΠΑΡΑΔΕΙΓΜΑ προσώπου',
    paragraphs: [
      { text_el: 'Το 1610 περίπου πέρασε από λιμάνι *(ΠΑΡΑΔΕΙΓΜΑ πηγή)*' },
      { text_el: 'Αργότερα φυλακίστηκε σε άλλη πόλη *(ΠΑΡΑΔΕΙΓΜΑ πηγή Β)*' },
    ],
    sources: [
      { label_el: 'ΠΑΡΑΔΕΙΓΜΑ πηγή, Τόπος 1610, σ. 12' },
      { label_el: 'ΠΑΡΑΔΕΙΓΜΑ πηγή Β, Τόπος 1612, σ. 4' },
    ],
    map_places: [{ label: 'Μήλος', status: 'RESOLVED', lon: 24.4, lat: 36.7 }],
    not_found: [],
  });
  assert.match(html, /πέρασε από λιμάνι/);
  assert.match(html, /φυλακίστηκε/);
  assert.match(html, /<cite>ΠΑΡΑΔΕΙΓΜΑ πηγή<\/cite>/);
  assert.match(html, /narrative-sources/);
  assert.match(html, /Πηγές/);
  assert.match(html, /τόπους του άρθρου: Μήλος/);
  assert.doesNotMatch(html, /703 εγγραφές/);
  assert.doesNotMatch(html, /το σύστημα εντόπισε/);
});

test('overview story hides counts behind Πορεία έρευνας', async () => {
  const { overview } = await overviewPromise;
  const { renderOverviewStory } = await viewPromise;
  const snapshot = {
    run_id: '1',
    mission: { status: 'COMPLETED', target: 'ΠΑΡΑΔΕΙΓΜΑ', purpose: 'Ποιος ήταν;', date_range: '1600–1650' },
    discoveries: [{ topical_match: { category: 'TARGET_MATCH' } }],
    claims: [{}],
    blockers: [{}],
    contradictions: { records: [] },
    research_answer: {
      greek_narrative: {
        status: 'NARRATIVE_PENDING_HUMAN_REVIEW',
        title_el: 'ΠΑΡΑΔΕΙΓΜΑ προσώπου',
        paragraphs: [{ text_el: 'Το 1612 περίπου έδρασε στη θάλασσα *(ΠΑΡΑΔΕΙΓΜΑ)*' }],
        sources: [{ label_el: 'ΠΑΡΑΔΕΙΓΜΑ, σ. 1' }],
        research_path: {
          found: 10,
          passed: 1,
          cut: 9,
          summary_el: 'Βρέθηκαν 10 τεκμήρια· Πέρασαν 1 που ταιριάζουν στο πρόσωπο/τόπο και την περίοδο· Κόπηκαν 9.',
          groups: [
            { key: 'namesakes_or_later_people', label_el: 'Ομώνυμοι / μεταγενέστερα πρόσωπα', count: 4 },
            { key: 'duplicate_same_source', label_el: 'Διπλοεγγραφές της ίδιας πηγής', count: 5 },
          ],
        },
        not_found: [{ note_el: 'Δεν βρέθηκε τόπος ταφής.' }],
      },
    },
  };
  const html = renderOverviewStory(snapshot, overview(snapshot));
  assert.match(html, /έδρασε στη θάλασσα/);
  assert.match(html, /Πορεία έρευνας/);
  assert.match(html, /Βρέθηκαν 10 τεκμήρια/);
  assert.match(html, /Ομώνυμοι/);
  assert.match(html, /Το ερώτημά σας/);
  assert.ok(html.indexOf('έδρασε στη θάλασσα') < html.indexOf('Πορεία έρευνας'));
  assert.ok(html.indexOf('Πηγές') < html.indexOf('Πορεία έρευνας'));
});

test('territory mode is a place note and keeps the map note', async () => {
  const { renderStoryHtml } = await viewPromise;
  const html = renderStoryHtml({
    status: 'NARRATIVE_PENDING_HUMAN_REVIEW',
    title_el: 'ΠΑΡΑΔΕΙΓΜΑ τόπου',
    paragraphs: [
      { text_el: 'Γενική φράση χωρίς τόπο *(Α)*' },
      { text_el: 'Στη Μήλο κράτησε φρουρά *(Β)*' },
    ],
    sources: [{ label_el: 'Βιβλίο Β, σ. 2' }],
    map_places: [{ label: 'Μήλος', status: 'RESOLVED', lon: 24.4, lat: 36.7 }],
    not_found: [],
  }, { mode: 'territory', heading: true });
  assert.match(html, /Στη Μήλο/);
  assert.match(html, /Ιστορικό σημείωμα τόπου|τόπους του άρθρου: Μήλος/);
  assert.match(html, /Πηγές/);
});

test('people mode labels the article as βιογραφικό', async () => {
  const { renderStoryHtml } = await viewPromise;
  const html = renderStoryHtml({
    status: 'NARRATIVE_PENDING_HUMAN_REVIEW',
    title_el: 'ΠΑΡΑΔΕΙΓΜΑ',
    paragraphs: [{ text_el: 'Εμφανίζεται σε πηγή *(Α)*' }],
    sources: [{ label_el: 'Α, σ. 1' }],
    not_found: [],
  }, { mode: 'people', heading: false });
  assert.match(html, /Βιογραφικό/);
});
