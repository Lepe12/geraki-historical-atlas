// Unit tests for «Η έρευνά μου» (my-research.js). No network, no storage outside the fake below.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const mod = import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(__dirname + '/my-research.js', 'utf8')).toString('base64'));
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const T0 = Date.parse('2026-11-11T08:10:29Z');
const entry = { query: 'Βρες στοιχεια για Κρεβελιε τον κουρσατο', request_id: 'ui-mwbu9zx3-cad5044d', started_at: T0 };

test('the sent question survives a reload and rejects junk', async () => {
  const m = await mod, s = store();
  assert.equal(m.loadMyResearch(s), null);
  m.saveMyResearch(entry, s);
  assert.deepEqual(m.loadMyResearch(s), entry);
  s.setItem(m.MY_RESEARCH_KEY, '{"query":"x","request_id":"<script>","started_at":1}');
  assert.equal(m.loadMyResearch(s), null, 'unsafe request id is dropped');
  s.setItem(m.MY_RESEARCH_KEY, 'not json');
  assert.equal(m.loadMyResearch(s), null);
  m.saveMyResearch(entry, s); m.clearMyResearch(s);
  assert.equal(m.loadMyResearch(s), null);
  assert.equal(m.saveMyResearch(entry, { setItem() { throw Error('denied'); } }).query, entry.query, 'storage denied still returns the entry');
});

test('only the own request id (or own run) counts as mine; status is recorded', async () => {
  const m = await mod;
  assert.equal(m.isMine(entry, { run_id: '1', request_id: 'someone-else', mission: { status: 'RUNNING' } }), false);
  assert.equal(m.isMine(entry, { run_id: '42272446144', mission: { status: 'PARTIAL' } }), false, 'old latest run without request id is not mine');
  const running = { run_id: '42984961899', request_id: entry.request_id, mission: { status: 'RUNNING' }, agents: [{ status: 'COMPLETED' }, { status: 'RUNNING' }] };
  const next = m.updateFromSnapshot(entry, running, T0 + 1);
  assert.equal(next.run_id, '42984961899'); assert.equal(m.isMyResearchDone(next), false);
  assert.deepEqual(m.researchStage(next, running), { key: 'running', seen: true, lanes: { done: 1, total: 2 } });
  assert.equal(m.researchStage(next, { ...running, agents: [{ status: 'COMPLETED' }] }).key, 'gathering');
  const done = m.updateFromSnapshot(next, { ...running, mission: { status: 'PARTIAL' } }, T0 + 2);
  assert.equal(m.isMyResearchDone(done), true); assert.equal(done.finished_at, T0 + 2);
  assert.equal(m.researchStage(done).key, 'published');
  assert.equal(m.isMine(done, { run_id: '42984961899', mission: {} }), true, 'own run number matches without request id');
  assert.equal(m.researchStage(entry, null).key, 'received');
});

test('GitHub catalogue fallback finds the published run by question and time', async () => {
  const m = await mod;
  const runs = [
    { run_id: '42272446144', target: 'Π¨ετρο Λάντζα τον κερκυραιο κουρσάρο', generated_utc: '2026-11-06T20:45:16Z', status: 'PARTIAL' },
    { run_id: '41000000000', target: 'Βρες στοιχεια για Κρεβελιε τον κουρσατο', generated_utc: '2026-11-01T08:00:00Z', status: 'PARTIAL' },
  ];
  assert.equal(m.findPublishedRun(entry, runs), null, 'an older run with the same text is not this question');
  runs.unshift({ run_id: '42984961899', target: 'ΒΡΕΣ στοιχεία για Κρεβελιέ τον κουρσάτο ', generated_utc: '2026-11-11T08:32:21Z', status: 'PARTIAL' });
  assert.equal(m.findPublishedRun(entry, runs).run_id, '42984961899');
});

test('progress picture: own question as title, honest time, numbers only under Λεπτομέρειες', async () => {
  const m = await mod;
  const html = m.progressHtml(entry, m.researchStage(entry, null), { now: T0 + 25 * 60000, liveBlocked: true });
  assert.match(html, /<h2>Βρες στοιχεια για Κρεβελιε τον κουρσατο<\/h2>/);
  assert.match(html, /πριν από 25 λεπτά/);
  assert.match(html, /20–90 λεπτά/);
  assert.match(html, /δεν βλέπουμε ζωντανά/);
  assert.match(html, /data-step="received" data-state="current"/);
  assert.ok(!/δευτ/.test(html), 'no seconds counter');
  assert.ok(html.indexOf('ui-mwbu9zx3-cad5044d') > html.indexOf('Λεπτομέρειες'), 'request id only inside Λεπτομέρειες');
  const late = m.progressHtml(entry, m.researchStage(entry, null), { now: T0 + 3 * 3600000 });
  assert.match(late, /περισσότερο από το συνηθισμένο/);
  assert.match(m.progressHtml({ ...entry, query: '<img src=x onerror=alert(1)>' }, { key: 'received' }), /&lt;img/);
  assert.match(m.reminderHtml(entry, { key: 'running' }, T0 + 60000), /data-my-research="show"/);
  assert.equal(m.reminderHtml(entry, { key: 'published' }), '');
});
