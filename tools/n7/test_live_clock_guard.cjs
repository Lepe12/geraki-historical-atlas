'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {athensNow,n7ClockGuidance,installClockGuard}=require('./live-clock-guard');
const basic=history=>[{role:'system',content:'Είσαι το N7.'},...history];
test('2026 US midterms week anchored to real Greece calendar',()=>{
  const date=new Date('2026-11-05T18:00:00Z');
  assert.deepEqual(athensNow(date),{
    date:'2026-11-05',time:'20:00',weekday:'Thursday',
    zone:'Europe/Athens',utc:'2026-11-05T18:00:00.000Z'});
  const text=n7ClockGuidance(date);
  assert.match(text,/2026-11-05/);
  assert.match(text,/NO LIVE INTERNET SEARCH/);
  assert.match(text,/DO NOT assert that recent elections did not happen/);
});
test('Athens day rolls over correctly at UTC boundary',()=>{
  assert.equal(athensNow(new Date('2026-11-05T22:30:00Z')).date,'2026-11-06');
});
test('clock is injected anew every request; prior owner memory and history unchanged',()=>{
  const dates=[new Date('2026-11-05T18:00:00Z'),new Date('2026-11-06T18:00:00Z')];
  const original=history=>[{role:'system',content:'N7 Skills + saved owner rules'},...history];
  const wrap=installClockGuard(original,()=>dates.shift());
  const history=[{role:'user',content:'Τι έγινε στις πρόσφατες εκλογές;'}];
  const a=wrap(history),b=wrap(history);
  assert.match(a[0].content,/2026-11-05/);
  assert.match(b[0].content,/2026-11-06/);
  assert.match(a[0].content,/N7 Skills \+ saved owner rules/);
  assert.equal(history[0].content,'Τι έγινε στις πρόσφατες εκλογές;');
  assert.equal(a[1],history[0]);
});
test('does not hallucinate an external search or fabricate outcomes in its guidance',()=>{
  const text=n7ClockGuidance(new Date('2026-11-05T18:00:00Z'));
  assert.match(text,/This server date does NOT verify recent news/);
  assert.match(text,/Do not invent winners/);
  assert.doesNotMatch(text,/Democrats won|Republicans won|εξελέγησαν|εκλέχθηκαν/);
});
test('malformed prompt pipeline is rejected instead of silently losing clock',()=>{
  assert.throws(()=>installClockGuard(null),/Missing original/);
  const bad=installClockGuard(()=>[]);
  assert.throws(()=>bad([]),/Unexpected N7 prompt/);
});
