'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {classify,cleanHistoryForTopic,contextForResearch,sourceFooter,researchMessages}=require('./public-web-search');
const date=new Date('2026-11-05T21:00:00Z');
const past=[
 {role:'user',content:'Τι έγινε στις χθεσινές αμερικανικές ενδιάμεσες εκλογές;'},
 {role:'assistant',content:'Δημοκρατικοί στις εκλογές.\n\nΠηγές διαδικτυακής αναζήτησης (τίτλοι/ημερομηνίες, όχι πλήρη άρθρα):\n[S1] Reuters https://example.org/elections'},
 {role:'user',content:'Τι ξέρεις για τον Πέτρο Λάντζα τον κουρσάρο;'}
];
test('new historical subject never inherits US election news query',()=>{
 const result=classify(past,date);
 assert.equal(result.kind,'historical');
 assert.equal(result.historicalLanza,true);
 assert.match(result.query,/Pietro Lanza Corfu corsair Parga 1573/);
 assert.doesNotMatch(result.query,/midterm|Trump|election/i);
});
test('history context removes previous subject and previous source footers',()=>{
 const cleaned=cleanHistoryForTopic(past);
 assert.equal(cleaned.length,1);
 assert.match(cleaned[0].content,/Πέτρο Λάντζα/);
 assert.doesNotMatch(JSON.stringify(cleaned),/election|Reuters/i);
});
test('current election question still follows news path',()=>{
 const result=classify([{role:'user',content:'Αποτελέσματα ενδιάμεσων εκλογών ΗΠΑ χθες;'}],date);
 assert.equal(result.kind,'news');
 assert.match(result.query,/2026 US midterm election results/);
});
test('historical name yields curated archive source, never old election citations',async()=>{
 const result=await researchMessages(past,{now:date,transport:async()=>{throw Error('offline')}});
 assert.equal(result.kind,'historical');
 assert.equal(result.items.length,1);
 assert.match(result.items[0].url,/piratecartography\.com\/archives\/114/);
 assert.doesNotMatch(sourceFooter(result),/election|Reuters/i);
 assert.match(contextForResearch(result),/Do not invent birth\/death dates/);
});
test('historical public web search retains older documents instead of discarding all',()=>{
 const result=classify([{role:'user',content:'Ψάξε την ιστορία του Πέτρου Λάντζα το 1573'}],date);
 assert.equal(result.kind,'historical');
 assert.match(result.query,/1573/);
});
