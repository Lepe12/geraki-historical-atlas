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
  // «Τι δεν βρέθηκε» lives only inside the closed Πορεία έρευνας.
  const pathStart = html.indexOf('<details class="overview-details research-path">');
  assert.ok(pathStart > 0);
  assert.ok(html.indexOf('Τι δεν βρέθηκε') > pathStart);
  assert.match(html, /Δεν βρέθηκε τόπος ταφής/);
  assert.doesNotMatch(html, /<details[^>]*open/);
  // Legacy dashboard tallies are gone from the panel.
  assert.doesNotMatch(html, /Ιστορικοί ισχυρισμοί/);
  assert.doesNotMatch(html, /Καταγεγραμμένες αντιφάσεις/);
  assert.doesNotMatch(html, /Εμπόδια πρόσβασης/);
  assert.doesNotMatch(html, /overview-counts/);
  assert.doesNotMatch(html, /Αφήγηση έρευνας/);
  assert.match(html, /<h2>ΠΑΡΑΔΕΙΓΜΑ προσώπου<\/h2>/);
});

test('closed surface is only article + Πηγές + map; not-found never sits beside sources', async () => {
  const { renderStoryHtml, renderResearchPath } = await viewPromise;
  const narrative = {
    status: 'NARRATIVE_PENDING_HUMAN_REVIEW',
    title_el: 'Πέτρος Λάντζας (Pietro / Pedro Lanza, 1530–1613)',
    paragraphs: [{ text_el: 'Στις 9 Ιανουαρίου 1573 έγινε κυβερνήτης της Πάργας *(Λάσκαρις 1956)*' }],
    sources: [{ label_el: 'Λάσκαρις 1956' }],
    map_places: [{ label: 'Πάργα', status: 'RESOLVED', lon: 20.4, lat: 39.3 }],
    research_path: { found: 12, passed: 3, cut: 9, groups: [{ label_el: 'Συνονόματοι', count: 9 }] },
    not_found: [{ note_el: 'Δεν βρέθηκε τόπος ταφής.' }],
  };
  const story = renderStoryHtml(narrative, { heading: true });
  assert.match(story, /<h3>Πέτρος Λάντζας \(Pietro \/ Pedro Lanza,\s*1530–1613\)<\/h3>/);
  assert.match(story, /Πηγές/);
  assert.match(story, /τόπους του άρθρου: Πάργα/);
  assert.doesNotMatch(story, /Τι δεν βρέθηκε/);
  assert.doesNotMatch(story, /Πορεία έρευνας/);
  const path = renderResearchPath(narrative);
  assert.match(path, /^<details class="overview-details research-path"><summary>Πορεία έρευνας<\/summary>/);
  assert.match(path, /Βρέθηκαν 12 τεκμήρια· Πέρασαν 3· Κόπηκαν 9/);
  assert.match(path, /Συνονόματοι: 9/);
  assert.match(path, /Τι δεν βρέθηκε/);
});

test('heading never falls back to «Αφήγηση έρευνας»', async () => {
  const { renderStoryHtml, articleTitle } = await viewPromise;
  const base = { status: 'NARRATIVE_PENDING_HUMAN_REVIEW', paragraphs: [{ text_el: 'Γεγονός *(Α)*' }] };
  assert.equal(articleTitle({ ...base, title_el: 'Αφήγηση έρευνας' }, 'Πέτρος Λάντζας'), 'Πέτρος Λάντζας');
  const html = renderStoryHtml({ ...base, title_el: '' }, { heading: true, fallbackTitle: 'Πέτρος Λάντζας' });
  assert.match(html, /<h3>Πέτρος Λάντζας<\/h3>/);
  assert.doesNotMatch(renderStoryHtml(base, { heading: true }), /Αφήγηση έρευνας/);
  assert.doesNotMatch(renderStoryHtml(base, { heading: false }), /Αφήγηση/);
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


test('in-progress title uses typed query, not run id; question visible; Πορεία open', async () => {
  const { overview } = await overviewPromise;
  const { renderOverviewStory } = await viewPromise;
  const typed = 'Κίμωλος πειρατεία 1700';
  const snapshot = {
    run_id: '42176932029',
    mission: { status: 'RUNNING' },
    agents: [{ status: 'RUNNING' }],
  };
  const data = overview(snapshot, { knownQuery: typed });
  assert.equal(data.title, typed);
  assert.doesNotMatch(data.title, /Έρευνα/);
  assert.doesNotMatch(data.title, /42176932029/);
  const html = renderOverviewStory(snapshot, data, { knownQuery: typed });
  assert.match(html, /<h2>Κίμωλος πειρατεία[\s\u00a0]1700<\/h2>/);
  assert.match(html, /Το ερώτημά σας/);
  assert.match(html, new RegExp(typed));
  assert.doesNotMatch(html, /δεν είναι ακόμη διαθέσιμο/);
  assert.match(html, /<details class="overview-details research-path" open>/);
  assert.doesNotMatch(html, /Αφήγηση έρευνας/);
});

test('finished research keeps Πορεία closed and still shows the recorded question', async () => {
  const { overview } = await overviewPromise;
  const { renderOverviewStory } = await viewPromise;
  const snapshot = {
    run_id: '1',
    mission: { status: 'COMPLETED', target: 'Δείγμα τόπου', purpose: 'Τι γνωρίζουμε για τον τόπο;', date_range: '1600–1700' },
    discoveries: [{ topical_match: { category: 'TARGET_MATCH' } }],
    claims: [{}],
    blockers: [],
    contradictions: { records: [] },
    research_answer: {
      greek_narrative: {
        status: 'NARRATIVE_PENDING_HUMAN_REVIEW',
        title_el: 'Δείγμα τόπου',
        paragraphs: [{ text_el: 'Αναφέρεται σε πηγή *(Α)*' }],
        sources: [{ label_el: 'Α' }],
        research_path: { found: 3, passed: 1, cut: 2 },
        not_found: [{ note_el: 'Δεν βρέθηκε οχυρό.' }],
      },
    },
  };
  const html = renderOverviewStory(snapshot, overview(snapshot));
  assert.match(html, /<h2>Δείγμα τόπου<\/h2>/);
  assert.match(html, /Τι γνωρίζουμε για τον τόπο;/);
  assert.match(html, /Τι δεν βρέθηκε/);
  assert.doesNotMatch(html, /<details[^>]*open/);
  assert.match(html, /<details class="overview-details research-path"><summary>Πορεία έρευνας<\/summary>/);
});

test('in-progress without known query still warns; with known query never invents years', async () => {
  const { overview } = await overviewPromise;
  const { renderOverviewStory } = await viewPromise;
  const bare = {
    run_id: '99',
    mission: { status: 'RUNNING' },
    agents: [{ status: 'RUNNING' }],
  };
  const bareHtml = renderOverviewStory(bare, overview(bare));
  assert.match(bareHtml, /δεν είναι ακόμη διαθέσιμο/);
  assert.equal(overview(bare).title, '');
  const named = 'Πέτρος Λάντζας';
  const withQuery = overview(bare, { knownQuery: named });
  assert.equal(withQuery.title, named);
  assert.doesNotMatch(withQuery.title, /1530|1613|\d{4}/);
});


test('title wrap binds year with nbsp; empty story uses unread wording', async () => {
  const { wrapTitleHtml, renderStoryHtml } = await viewPromise;
  assert.match(wrapTitleHtml('Πέτρος Λάντζας 1613'), /\u00a01613/);
  const empty = renderStoryHtml({
    status: 'NO_USABLE_EVIDENCE',
    title_el: 'Πέτρος Λάντζας',
    paragraphs: [],
  }, { heading: true });
  assert.match(empty, /Δεν μπόρεσα να διαβάσω τις πηγές/);
});
